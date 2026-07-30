"""Contratos de entrada y salida entre el frontend y el backend.

Separados de las rutas a propósito: son el contrato del proyecto y la
documentación viva de `/docs`. Ninguno de estos modelos toca la base de datos
ni contiene lógica de decisión.
"""

from .catalog import (
    CatalogOut,
    ConfigHealthOut,
    IndicatorOut,
    IndicatorPatch,
    OptionOut,
    OptionPatch,
    ThresholdOut,
    ThresholdPatch,
)
from .evaluation import (
    MENSAJES_NO_TRADE,
    ContributionOut,
    EvaluateRequest,
    EvaluationOut,
    SetupCreate,
    SetupCreatedOut,
)
from .setup import (
    SelectionOut,
    SetupDetail,
    SetupPage,
    SetupResultIn,
    SetupResultPatch,
    SetupSummary,
)

__all__ = [
    "CatalogOut",
    "ConfigHealthOut",
    "IndicatorOut",
    "IndicatorPatch",
    "OptionOut",
    "OptionPatch",
    "ThresholdOut",
    "ThresholdPatch",
    "ContributionOut",
    "EvaluateRequest",
    "EvaluationOut",
    "SetupCreate",
    "SetupCreatedOut",
    "MENSAJES_NO_TRADE",
    "SelectionOut",
    "SetupDetail",
    "SetupPage",
    "SetupResultIn",
    "SetupResultPatch",
    "SetupSummary",
]
