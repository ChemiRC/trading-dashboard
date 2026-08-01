"""Contratos de la sincronización con Bybit."""

from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class SyncSummary(BaseModel):
    """Lo que hizo una sincronización, en números.

    `traidas` cuenta lo que Bybit devolvió; `nuevas` lo que acabó en la base
    de datos. La diferencia son duplicados, y verla es útil: en una
    sincronización rutinaria casi todo es duplicado —se relee una ventana de
    solapamiento a propósito— y que `nuevas` sea 0 no significa que algo
    fallara.
    """

    traidas: int = Field(
        description="Operaciones de la operativa del trader que devolvio Bybit "
        "en el rango, ya descartados los instrumentos ajenos."
    )
    excluidas: int = Field(
        default=0,
        description="Operaciones que Bybit devolvio pero no son de su operativa "
        "(perpetuos). Se cuentan para que la diferencia con el total que se ve "
        "en Bybit sea explicable y no parezca que falta algo.",
    )
    nuevas: int = Field(description="Las que no estaban ya guardadas.")
    vinculadas: int = Field(description="De las nuevas, cuantas encontraron setup.")
    sin_vincular: int = Field(
        description="De las nuevas, cuantas quedaron con setup_id NULL: "
        "operaciones improvisadas, o sin setup que las explique."
    )
    duplicadas: int = Field(description="Ya estaban guardadas; no se tocaron.")

    desde: datetime = Field(description="Inicio del rango consultado a Bybit.")
    hasta: datetime = Field(description="Fin del rango consultado a Bybit.")
    testnet: bool = Field(description="Contra que entorno se sincronizo.")


class TradeOut(BaseModel):
    """Una operación importada, en lo que interesa para comprobar el vínculo."""

    id: UUID
    setup_id: UUID | None
    symbol: str
    side: Literal["LONG", "SHORT"]
    bybit_order_id: str | None
    opened_at: datetime | None
    closed_at: datetime | None
    pnl_net: Decimal | None
    source: Literal["bybit", "manual"]


class TradeListItem(TradeOut):
    """Una fila del listado, con lo mínimo del setup vinculado ya embebido.

    Los cuatro campos `setup_*` van a `null` cuando no hay vínculo, que es el
    estado normal —y correcto— de todo lo importado antes de que el trader
    empezara a evaluar setups aquí: una operación sin setup previo es
    justamente el dato que delata haberse saltado el proceso, no un error.
    """

    entry_price: Decimal | None = None
    exit_price: Decimal | None = None
    quantity: Decimal | None = None

    setup_symbol: str | None = None
    setup_evaluated_at: datetime | None = None
    setup_decision: Literal["LONG", "SHORT", "NO_TRADE"] | None = None
    setup_raw_balance: int | None = None


class TradePage(BaseModel):
    items: list[TradeListItem]
    total: int
    limit: int
    offset: int


class RelinkRequest(BaseModel):
    """Corrección manual del vínculo.

    `setup_id: null` desvincula -- es un valor legítimo y no un campo que
    falte, así que el contrato lo pide explícitamente en vez de tratarlo como
    opcional: mandar `{}` no debe significar "desvincula".
    """

    model_config = {"extra": "forbid"}

    setup_id: UUID | None
