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
