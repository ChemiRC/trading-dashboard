"""Evaluación y histórico de setups."""

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import Conn, EngineCfg
from app.db import setups_repo
from app.models import (
    EvaluateRequest,
    EvaluationOut,
    SetupCreate,
    SetupCreatedOut,
    SetupDetail,
    SetupPage,
    SetupResultIn,
    SetupResultPatch,
    SetupSummary,
)
from app.scoring import evaluate

router = APIRouter(prefix="/api/setups", tags=["setups"])


@router.post(
    "/evaluate",
    response_model=EvaluationOut,
    summary="Evaluar sin guardar",
)
def evaluate_setup(body: EvaluateRequest, config: EngineCfg) -> EvaluationOut:
    """Calcula el veredicto y no escribe nada.

    Es el endpoint que el formulario llama mientras el trader va marcando
    opciones, para que el Decision Panel se actualice en vivo. Va separado de
    `POST /api/setups` a propósito: si previsualizar guardase, el histórico se
    llenaría de setups a medio rellenar y dejaría de medir nada.
    """
    return EvaluationOut.from_evaluation(evaluate(body.selections, config))


@router.post(
    "",
    response_model=SetupCreatedOut,
    status_code=status.HTTP_201_CREATED,
    summary="Evaluar y guardar",
)
def create_setup(body: SetupCreate, conn: Conn, config: EngineCfg) -> SetupCreatedOut:
    """Evalúa y persiste el resultado.

    El backend **reevalúa**; no acepta un balance calculado por el cliente. Si
    el frontend pudiera mandar el veredicto, el histórico dejaría de ser
    comprobable: bastaría un bug —o un trader tocando la petición— para guardar
    un setup que dice haber puntuado algo que nunca puntuó.

    Se guarda con el resultado de la operación todavía desconocido, que es la
    decisión de diseño central del proyecto.
    """
    evaluation = evaluate(body.selections, config)

    guardado = setups_repo.save_setup(
        conn,
        evaluation=evaluation,
        config=config,
        symbol=body.symbol,
        timeframe=body.timeframe,
        price_at_evaluation=body.price_at_evaluation,
        notes=body.notes,
    )

    return SetupCreatedOut(
        **EvaluationOut.from_evaluation(evaluation).model_dump(),
        id=guardado["id"],
        evaluated_at=guardado["evaluated_at"],
        symbol=body.symbol,
        timeframe=body.timeframe,
    )


@router.get("", response_model=SetupPage, summary="Historico de setups")
def list_setups(
    conn: Conn,
    symbol: Annotated[str | None, Query(description="Filtra por instrumento.")] = None,
    decision: Annotated[
        Literal["LONG", "SHORT", "NO_TRADE"] | None, Query()
    ] = None,
    no_trade_reason: Annotated[
        Literal[
            "GATE_NO_DIVERGENCE",
            "TRIGGER_CONTRADICTION",
            "ZERO_BALANCE",
            "BELOW_THRESHOLD",
        ]
        | None,
        Query(description="Por que se descarto. Distinguirlos es lo que hace "
                          "analizable el comportamiento del trader."),
    ] = None,
    desde: Annotated[datetime | None, Query()] = None,
    hasta: Annotated[datetime | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> SetupPage:
    filas, total = setups_repo.list_setups(
        conn,
        symbol=symbol,
        decision=decision,
        no_trade_reason=no_trade_reason,
        desde=desde,
        hasta=hasta,
        limit=limit,
        offset=offset,
    )
    return SetupPage(
        items=[SetupSummary.from_row(f) for f in filas],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{setup_id}", response_model=SetupDetail, summary="Un setup con su desglose")
def get_setup(setup_id: UUID, conn: Conn) -> SetupDetail:
    fila = setups_repo.get_setup(conn, setup_id)
    if fila is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail=f"No existe el setup {setup_id}."
        )
    return SetupDetail.from_row(fila)


# ---------------------------------------------------------------------------
#  Resultado manual
#
#  Ninguno de estos dos endpoints puede tocar la evaluación original: los
#  contratos no traen selecciones ni balance, y las columnas de `setups`
#  quedaron congeladas al guardar. Aquí solo se añade (o corrige) el desenlace.
# ---------------------------------------------------------------------------


@router.post(
    "/{setup_id}/result",
    response_model=SetupDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar a mano cómo terminó el setup",
)
def register_result(setup_id: UUID, body: SetupResultIn, conn: Conn) -> SetupDetail:
    """Crea la fila de `trades` (source='manual') vinculada al setup.

    Es el adelanto manual de la Fase 2: cuando llegue la sincronización con
    Bybit, sus trades convivirán con estas distinguidas por `source`, y el
    UNIQUE de `trades.setup_id` —que aquí convierte un doble registro en un
    409— es el mismo que le impedirá a la sincronización duplicar un setup ya
    resuelto.
    """
    setup = setups_repo.get_setup(conn, setup_id)
    if setup is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail=f"No existe el setup {setup_id}."
        )
    # Un NO TRADE es la decisión de quedarse fuera: no hay operación cuyo
    # desenlace registrar. Si el trader operó igualmente, eso es una operación
    # improvisada — trade sin setup — y llegará por la vía de la Fase 2.
    if setup["decision"] == "NO_TRADE":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="Este setup salió NO TRADE: no hay operación cuyo resultado "
            "registrar. Una operación hecha al margen del veredicto es una "
            "operación improvisada y se registrará como trade sin setup.",
        )

    setups_repo.save_result(
        conn,
        setup_id,
        symbol=setup["symbol"],
        side=setup["decision"],
        outcome=body.outcome,
        pnl_net=body.pnl_net,
        notes=body.notes,
    )
    return SetupDetail.from_row(setups_repo.get_setup(conn, setup_id))


@router.patch(
    "/{setup_id}/result",
    response_model=SetupDetail,
    summary="Corregir un resultado registrado a mano",
)
def patch_result(setup_id: UUID, body: SetupResultPatch, conn: Conn) -> SetupDetail:
    """Errores de captura pasan; corregirlos deja huella en `result_updated_at`."""
    estado = setups_repo.update_result(conn, setup_id, body.changes())

    if estado is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail=f"El setup {setup_id} no tiene resultado registrado que corregir.",
        )
    if estado == "bybit":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="El resultado de este setup viene de Bybit: la resincronización "
            "lo pisaría. Los campos objetivos del exchange no se editan a mano.",
        )
    return SetupDetail.from_row(setups_repo.get_setup(conn, setup_id))
