"""Configuración vigente: el catálogo tal y como está en la base de datos.

Son estructuras planas y **congeladas** (`frozen=True`). El motor recibe una de
estas, la lee y no la toca. Que sean inmutables no es decoración: garantiza que
evaluar un setup no pueda alterar la configuración con la que se evalúa el
siguiente.

Aquí no se importa nada que no sea la librería estándar. Ni Pydantic, ni el
driver de Postgres, ni FastAPI. Quien traiga estos datos de la BD es
`app/db/`; quien los exponga por HTTP es `app/models/`.
"""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Option:
    """Una respuesta posible a un indicador.

    `points` va CON SIGNO: positivo alcista, negativo bajista, 0 neutro.
    No hay campo `direction`: la dirección de una opción *es* el signo de sus
    puntos, y duplicarla en otra columna solo abre la puerta a que se
    contradigan.
    """

    code: str
    label: str
    points: int
    id: int | None = None
    is_default: bool = False


@dataclass(frozen=True, slots=True)
class Indicator:
    """Una pregunta que el trader responde sobre el gráfico."""

    code: str
    name: str
    max_weight: int
    options: tuple[Option, ...]
    id: int | None = None
    display_order: int = 0

    #: REGLA A. El indicador puerta es el disparador obligatorio. El motor
    #: nunca comprueba `code == "rsi_divergence"`: comprueba esta bandera.
    #: Cambiar de disparador es un UPDATE en la BD, no un despliegue.
    is_gate: bool = False

    def option(self, code: str) -> Option | None:
        for opt in self.options:
            if opt.code == code:
                return opt
        return None


@dataclass(frozen=True, slots=True)
class Threshold:
    """Banda de clasificación, sobre el VALOR ABSOLUTO del balance.

    Ambos extremos inclusivos. Va de 0 a 100 y no de -100 a 100 porque la misma
    banda sirve para un LONG de +85 y para un SHORT de -85: la dirección sale
    del signo, la clasificación de la magnitud.
    """

    code: str
    label: str
    min_abs: int
    max_abs: int
    is_tradeable: bool

    def covers(self, abs_balance: int) -> bool:
        return self.min_abs <= abs_balance <= self.max_abs


@dataclass(frozen=True, slots=True)
class EngineConfig:
    """Todo lo que el motor necesita saber, y nada más."""

    indicators: tuple[Indicator, ...]
    thresholds: tuple[Threshold, ...]

    #: REGLA B — PENDIENTE DE CONFIRMAR CON EL TRADER.
    #: Se deja como interruptor en vez de cablearla porque la regla está sin
    #: cerrar. Si el trader la descarta, esto pasa a False y ni el motor ni el
    #: esquema cambian. Ver README.
    rule_b_enabled: bool = True

    @property
    def gate(self) -> Indicator | None:
        for ind in self.indicators:
            if ind.is_gate:
                return ind
        return None

    @property
    def max_abs_balance(self) -> int:
        """Máximo teórico. Con el catálogo de hoy, 100."""
        return sum(ind.max_weight for ind in self.indicators)
