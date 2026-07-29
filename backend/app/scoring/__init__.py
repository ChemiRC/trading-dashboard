"""Motor de decisión — función pura, sin dependencias externas.

    from app.scoring import evaluate
    resultado = evaluate({"rsi_divergence": "regular_bullish", ...}, config)
"""

from .catalog import EngineConfig, Indicator, Option, Threshold
from .engine import evaluate
from .errors import ConfigError, EngineError, SelectionError
from .result import Contribution, Decision, Direction, Evaluation, NoTradeReason

__all__ = [
    "evaluate",
    "EngineConfig",
    "Indicator",
    "Option",
    "Threshold",
    "Evaluation",
    "Contribution",
    "Decision",
    "Direction",
    "NoTradeReason",
    "EngineError",
    "ConfigError",
    "SelectionError",
]
