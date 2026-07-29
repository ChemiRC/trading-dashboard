"""Contratos de evaluación de un setup."""

from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.scoring import Evaluation

# Los cuatro motivos son un CHECK cerrado en la tabla `setups`; el texto que los
# acompaña vive aquí y no en la base de datos porque es copy de interfaz, no
# configuración: cambiarlo no altera ninguna decisión. Los pesos y los umbrales
# —que sí las alteran— siguen estando solo en la BD.
MENSAJES_NO_TRADE: dict[str, str] = {
    "GATE_NO_DIVERGENCE": (
        "Sin divergencia RSI no hay disparador: no se busca operacion y no se "
        "calcula balance."
    ),
    "TRIGGER_CONTRADICTION": (
        "El disparador apunta a un lado y la suma de la evidencia al contrario. "
        "Es el caso en el que hay que quedarse fuera."
    ),
    "ZERO_BALANCE": (
        "La evidencia alcista y la bajista se cancelan exactamente: no hay "
        "direccion que deducir."
    ),
    "BELOW_THRESHOLD": (
        "Hay direccion, pero la fuerza de la senal no llega al minimo operable "
        "configurado."
    ),
}


class EvaluateRequest(BaseModel):
    """Lo que manda el formulario.

    Fíjate en lo que **no** hay: ningún campo `direction`. El trader describe lo
    que ve y el motor deduce el sentido del signo del balance. Aceptar una
    dirección aquí dejaría entrar por la puerta de atrás justo el sesgo que la
    herramienta existe para frenar.
    """

    model_config = {"extra": "forbid"}

    selections: dict[str, str] = Field(
        description="{indicator_code: option_code}. Una entrada por cada "
        "indicador activo del catalogo.",
        examples=[
            {
                "rsi_divergence": "regular_bullish",
                "weekly_trend": "bullish",
                "support_resistance": "near_support",
                "liquidity": "lower_swept",
                "chart_pattern": "bullish",
                "kiyotaka_barrier": "none",
            }
        ],
    )

    @field_validator("selections")
    @classmethod
    def _no_vacia(cls, v: dict[str, str]) -> dict[str, str]:
        if not v:
            raise ValueError("No has respondido a ningun indicador.")
        return v


class SetupCreate(EvaluateRequest):
    """Evaluar y guardar.

    El símbolo es obligatorio: un setup sin instrumento no sirve para la Fase 4.
    El resultado de la operación **no** está aquí y no puede estarlo — el setup
    se guarda antes de saberlo.
    """

    symbol: str = Field(min_length=1, max_length=20, examples=["BTCUSDT"])
    timeframe: str | None = Field(default=None, max_length=10, examples=["4H"])
    price_at_evaluation: Decimal | None = Field(default=None, gt=0)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("symbol")
    @classmethod
    def _normaliza(cls, v: str) -> str:
        return v.strip().upper()


class ContributionOut(BaseModel):
    indicator_code: str
    indicator_name: str
    option_code: str
    option_label: str
    points: int
    max_weight: int
    ratio: float = Field(
        description="points / max_weight, de -1 a 1. Escala comparable entre "
        "indicadores de peso distinto para la barra del Confluence Score."
    )


class EvaluationOut(BaseModel):
    """El veredicto.

    `decision` y `direction` son campos distintos: `direction` es hacia donde
    apunta la evidencia, `decision` es lo que se hace. Un setup con
    `direction='LONG'` y `decision='NO_TRADE'` es informacion, no una
    contradiccion.
    """

    decision: Literal["LONG", "SHORT", "NO_TRADE"]
    direction: Literal["LONG", "SHORT"] | None
    raw_balance: int | None = Field(
        description="Balance CON SIGNO, -100..100. Null solo bajo la REGLA A, "
        "que corta antes de calcularlo."
    )
    strength: int | None = Field(description="Valor absoluto del balance.")
    no_trade_reason: str | None
    no_trade_message: str | None
    classification_code: str | None
    classification_label: str | None
    contributions: list[ContributionOut]

    @classmethod
    def from_evaluation(cls, ev: Evaluation) -> "EvaluationOut":
        return cls(
            decision=ev.decision,
            direction=ev.direction,
            raw_balance=ev.raw_balance,
            strength=ev.strength,
            no_trade_reason=ev.no_trade_reason,
            no_trade_message=MENSAJES_NO_TRADE.get(ev.no_trade_reason or ""),
            classification_code=ev.classification_code,
            classification_label=ev.classification_label,
            contributions=[
                ContributionOut(
                    indicator_code=c.indicator_code,
                    indicator_name=c.indicator_name,
                    option_code=c.option_code,
                    option_label=c.option_label,
                    points=c.points,
                    max_weight=c.max_weight,
                    ratio=c.ratio,
                )
                for c in ev.contributions
            ],
        )


class SetupCreatedOut(EvaluationOut):
    """La evaluación más el identificador con el que quedó guardada."""

    id: UUID
    evaluated_at: datetime
    symbol: str
    timeframe: str | None = None
