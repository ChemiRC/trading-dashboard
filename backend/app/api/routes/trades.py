"""Importación del historial de Bybit y corrección del vínculo con los setups.

**Solo lectura contra el exchange.** Aquí no hay —ni habrá— nada que abra o
cierre una posición: se descarga historial y se guarda. Ver README, Seguridad.
"""

import logging
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from app.adapters import bybit, vinculacion
from app.api.auth import Protegido
from app.api.deps import Config, Conn
from app.db import trades_repo
from app.models import RelinkRequest, SyncSummary, TradeOut, TradePage

log = logging.getLogger("app.api.trades")

router = APIRouter(prefix="/api/trades", tags=["operaciones"], dependencies=[Protegido])


@router.post("/sync", response_model=SyncSummary, summary="Importar historial de Bybit")
def sync_trades(conn: Conn, settings: Config) -> SyncSummary:
    """Trae las operaciones cerradas nuevas y las vincula a sus setups.

    Es una acción **manual**: la dispara el trader cuando quiere, no un cron ni
    un proceso en segundo plano. Mientras el volumen sea el de una persona
    operando swing, automatizarlo solo añadiría una pieza que puede fallar de
    madrugada sin que nadie mire.

    El rango se calcula desde la última sincronización menos un solapamiento
    (ver `MARGEN_SOLAPAMIENTO_HORAS`), y los duplicados que eso genere los
    descarta el UNIQUE de `bybit_order_id`. Preferir releer de más a arriesgar
    un hueco es deliberado: un hueco no se nota hasta que faltan operaciones
    en las estadísticas.
    """
    if not settings.bybit_api_key or not settings.bybit_api_secret:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="La sincronizacion con Bybit no esta configurada: faltan "
            "BYBIT_API_KEY o BYBIT_API_SECRET en el entorno. La key debe ser "
            "de SOLO LECTURA, sin permiso de trading ni de retiro.",
        )

    ahora = datetime.now(UTC)
    ultima = trades_repo.get_last_synced_at(conn)
    desde = (
        ultima - timedelta(hours=bybit.MARGEN_SOLAPAMIENTO_HORAS)
        if ultima
        else ahora - timedelta(days=bybit.DIAS_PRIMERA_SINCRONIZACION)
    )

    # Un fallo del exchange sale como 502 con el motivo dentro; no se devuelve
    # un resumen de ceros que parecería "no habia nada nuevo".
    try:
        descarga = bybit.fetch_closed_pnl(
            api_key=settings.bybit_api_key,
            api_secret=settings.bybit_api_secret,
            testnet=settings.bybit_testnet,
            desde=desde,
            hasta=ahora,
        )
    except bybit.BybitError as e:
        log.warning("Sincronizacion con Bybit fallida: %s", e)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(e)) from e

    nuevas = vinculadas = duplicadas = 0

    for fila in descarga.operaciones:
        trade = bybit.a_trade(fila)

        # Sin identificador o sin lado no se puede ni deduplicar ni cumplir el
        # CHECK de `side`: se registra y se sigue, en vez de romper la
        # importación entera por una fila rara.
        if not trade["bybit_order_id"] or not trade["side"]:
            log.warning("Operacion de Bybit descartada por incompleta: %r", fila)
            continue

        setup = None
        if trade["opened_at"] is not None:
            candidatos = trades_repo.candidatos_para(
                conn,
                abierta_en=trade["opened_at"],
                desde=trade["opened_at"] - timedelta(hours=vinculacion.VENTANA_HORAS),
            )
            setup = vinculacion.elegir_setup(trade, candidatos)

        guardada = trades_repo.insert_trade(conn, trade, setup["id"] if setup else None)

        if guardada is None:
            duplicadas += 1
            continue

        nuevas += 1
        if guardada["setup_id"] is not None:
            vinculadas += 1

    trades_repo.set_last_synced_at(conn, ahora)

    return SyncSummary(
        traidas=len(descarga.operaciones),
        excluidas=descarga.excluidas,
        nuevas=nuevas,
        vinculadas=vinculadas,
        sin_vincular=nuevas - vinculadas,
        duplicadas=duplicadas,
        desde=desde,
        hasta=ahora,
        testnet=settings.bybit_testnet,
    )


@router.get("", response_model=TradePage, summary="Listado de operaciones")
def list_trades(
    conn: Conn,
    source: Annotated[
        Literal["bybit", "manual"] | None,
        Query(description="De donde vino: importada del exchange o registrada a mano."),
    ] = None,
    vinculadas: Annotated[
        bool | None,
        Query(description="true: solo las que tienen setup. false: solo las que no."),
    ] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> TradePage:
    """Las operaciones, de la más reciente a la más antigua.

    Cada fila trae embebido lo mínimo del setup vinculado: sin eso la pantalla
    tendría que pedir cada setup por separado para poder enseñar algo más útil
    que un identificador.
    """
    filas, total = trades_repo.list_trades(
        conn, source=source, vinculadas=vinculadas, limit=limit, offset=offset
    )
    return TradePage(items=filas, total=total, limit=limit, offset=offset)


@router.patch(
    "/{trade_id}/setup",
    response_model=TradeOut,
    summary="Corregir a mano el setup vinculado",
)
def relink_trade(trade_id: UUID, body: RelinkRequest, conn: Conn) -> TradeOut:
    """Cambia o quita el vínculo que puso la heurística.

    Existe porque la vinculación automática es una heurística y puede fallar
    -—dos setups del mismo par en el mismo día son indistinguibles para ella—.
    Que el vínculo sea corregible es lo que hace aceptable que se equivoque.

    Un `setup_id` que ya tenga operación lo rechaza el UNIQUE de la columna, y
    ese 409 llega con el mensaje del esquema como cualquier otro.
    """
    fila = trades_repo.relink_trade(conn, trade_id, body.setup_id)
    if fila is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail=f"No existe la operacion {trade_id}."
        )
    return TradeOut(**fila)
