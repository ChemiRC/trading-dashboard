"""Contratos de consulta del histórico de setups."""

from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from .evaluation import MENSAJES_NO_TRADE


class SelectionOut(BaseModel):
    """Una respuesta del formulario, tal y como se congeló.

    `points_applied` y `option_label` son los del día de la evaluación, no los
    del catálogo de hoy. Si el trader cambió los pesos desde entonces, aquí
    sigue viéndose lo que realmente se aplicó.
    """

    indicator_code: str
    indicator_name: str
    option_code: str
    option_label: str
    points_applied: int
    max_weight: int


class SetupSummary(BaseModel):
    id: UUID
    evaluated_at: datetime
    symbol: str
    timeframe: str | None = None
    price_at_evaluation: Decimal | None = None

    raw_balance: int | None = None
    direction: Literal["LONG", "SHORT"] | None = None
    decision: Literal["LONG", "SHORT", "NO_TRADE"]
    no_trade_reason: str | None = None
    no_trade_message: str | None = None

    classification_code: str | None = None
    classification_label: str | None = None
    notes: str | None = None

    #: Vienen de `v_setups_with_outcome`. Siguen a null hasta la Fase 2, cuando
    #: se enlacen las operaciones reales de Bybit. Están en el contrato desde
    #: ahora para que el frontend no cambie de forma al llegar esa fase.
    trade_id: UUID | None = None
    pnl_net: Decimal | None = None
    outcome: Literal["WIN", "LOSS", "BREAKEVEN"] | None = None

    @classmethod
    def from_row(cls, row: dict) -> "SetupSummary":
        return cls(
            **{k: v for k, v in row.items() if k in cls.model_fields},
            no_trade_message=MENSAJES_NO_TRADE.get(row.get("no_trade_reason") or ""),
        )


class SetupDetail(SetupSummary):
    selections: list[SelectionOut] = Field(default_factory=list)

    @classmethod
    def from_row(cls, row: dict) -> "SetupDetail":
        return cls(
            **{k: v for k, v in row.items() if k in cls.model_fields},
            no_trade_message=MENSAJES_NO_TRADE.get(row.get("no_trade_reason") or ""),
        )


class SetupPage(BaseModel):
    """Página de resultados.

    `total` es el número de setups que cumplen el filtro, no los devueltos: sin
    él el frontend no puede pintar un paginador sin traerse todo el histórico.
    """

    items: list[SetupSummary]
    total: int
    limit: int
    offset: int
