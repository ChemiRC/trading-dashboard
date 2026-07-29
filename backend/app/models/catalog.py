"""Contratos del catálogo y de la pantalla de configuración."""

from pydantic import BaseModel, Field, model_validator


class OptionOut(BaseModel):
    id: int
    code: str
    label: str
    points: int = Field(
        description="Puntos CON SIGNO: positivo alcista, negativo bajista, 0 neutro."
    )
    is_default: bool


class IndicatorOut(BaseModel):
    id: int
    code: str
    name: str
    description: str | None = None
    max_weight: int
    display_order: int
    is_gate: bool = Field(
        description="REGLA A: si es el indicador puerta, elegir su opcion de 0 "
        "puntos fuerza NO TRADE sin calcular balance."
    )
    options: list[OptionOut]


class ThresholdOut(BaseModel):
    code: str
    label: str
    min_abs_balance: int
    max_abs_balance: int
    is_tradeable: bool
    display_order: int
    color_token: str | None = None


class CatalogOut(BaseModel):
    """Todo lo que el frontend necesita para pintar el formulario, en un GET.

    Incluye `defaults` ya resuelto para no obligar al cliente a recorrer las
    opciones buscando `is_default`. Los indicadores sin opción por defecto
    —tendencia semanal— simplemente no aparecen en el diccionario, y ese hueco
    es lo que obliga al trader a contestar.
    """

    indicators: list[IndicatorOut]
    thresholds: list[ThresholdOut]
    defaults: dict[str, str]
    gate_indicator_code: str | None
    max_abs_balance: int = Field(
        description="Maximo teorico del balance con el catalogo vigente."
    )
    rule_b_enabled: bool


class ConfigHealthOut(BaseModel):
    """Espejo de la vista `v_config_health`."""

    suma_pesos: int
    suma_es_100: bool
    tiene_puerta: bool
    umbrales_cubren_0_100: bool

    @property
    def todo_ok(self) -> bool:
        return self.suma_es_100 and self.tiene_puerta and self.umbrales_cubren_0_100


# ---------------------------------------------------------------------------
#  Entradas de edición
#
#  Todos los campos son opcionales: es un PATCH, se toca solo lo que llega.
#  Un modelo con todo obligatorio convertiría "cambiar el peso" en "reenviar el
#  indicador entero", y cualquier campo que el cliente olvidase se perdería.
# ---------------------------------------------------------------------------


class _PatchBase(BaseModel):
    model_config = {"extra": "forbid"}

    @model_validator(mode="after")
    def _al_menos_un_campo(self):
        if not self.model_fields_set:
            raise ValueError("El cuerpo no trae ningun campo que actualizar.")
        return self

    def changes(self) -> dict:
        return self.model_dump(exclude_unset=True)


class IndicatorPatch(_PatchBase):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    max_weight: int | None = Field(default=None, gt=0, le=100)
    display_order: int | None = Field(default=None, ge=0)
    is_active: bool | None = None
    is_gate: bool | None = None


class OptionPatch(_PatchBase):
    label: str | None = Field(default=None, min_length=1, max_length=200)
    points: int | None = Field(default=None, ge=-100, le=100)
    display_order: int | None = Field(default=None, ge=0)
    is_default: bool | None = None
    is_active: bool | None = None


class ThresholdPatch(_PatchBase):
    label: str | None = Field(default=None, min_length=1, max_length=120)
    min_abs_balance: int | None = Field(default=None, ge=0, le=100)
    max_abs_balance: int | None = Field(default=None, ge=0, le=100)
    is_tradeable: bool | None = None
    display_order: int | None = Field(default=None, ge=0)
    color_token: str | None = None
