"""Lo que devuelve el motor.

Los nombres de los campos son deliberadamente los mismos que los de las columnas
de `setups` y `setup_selections`. Persistir un resultado es un mapeo directo,
sin capa de traducción que pueda introducir un desfase entre lo que decidió el
motor y lo que quedó guardado.
"""

from dataclasses import dataclass
from typing import Literal

Decision = Literal["LONG", "SHORT", "NO_TRADE"]
Direction = Literal["LONG", "SHORT"]

NoTradeReason = Literal[
    "GATE_NO_DIVERGENCE",     # REGLA A: sin disparador, ni se calcula
    "TRIGGER_CONTRADICTION",  # REGLA B: la evidencia contradice al disparador
    "ZERO_BALANCE",           # balance exactamente 0, sin dirección deducible
    "BELOW_THRESHOLD",        # magnitud insuficiente según los umbrales
]


@dataclass(frozen=True, slots=True)
class Contribution:
    """Lo que aportó un indicador. Una fila de `setup_selections`."""

    indicator_code: str
    indicator_name: str
    option_code: str
    option_label: str
    points: int
    max_weight: int

    #: Cuánto del peso disponible se usó, de -1.0 a 1.0. Para la barra del
    #: Confluence Score, que necesita una escala comparable entre indicadores
    #: de peso 30 y de peso 10.
    @property
    def ratio(self) -> float:
        return self.points / self.max_weight if self.max_weight else 0.0


@dataclass(frozen=True, slots=True)
class Evaluation:
    """El veredicto completo de un setup.

    `decision` y `direction` son campos distintos a propósito:

    - `direction` es hacia dónde apunta la evidencia (el signo del balance).
    - `decision`  es qué se hace (LONG, SHORT o quedarse fuera).

    Un setup con `direction="LONG"` y `decision="NO_TRADE"` es el caso
    interesante: había señal y aun así no se opera. Fundir ambos campos en uno
    perdería justo ese dato.
    """

    decision: Decision

    #: None si la REGLA A cortó antes de calcular, o si el balance es 0.
    direction: Direction | None

    #: Balance crudo CON SIGNO, -100..+100. None solo bajo la REGLA A, que
    #: dice literalmente que no se calcula.
    raw_balance: int | None

    no_trade_reason: NoTradeReason | None

    classification_code: str | None
    classification_label: str | None

    #: Eco de lo que eligió el trader, en el orden del catálogo. Se devuelve
    #: siempre, también bajo la REGLA A: son sus respuestas, no una evaluación.
    contributions: tuple[Contribution, ...]

    @property
    def is_tradeable(self) -> bool:
        return self.decision != "NO_TRADE"

    @property
    def strength(self) -> int | None:
        """La fuerza de la señal: el valor absoluto del balance."""
        return None if self.raw_balance is None else abs(self.raw_balance)
