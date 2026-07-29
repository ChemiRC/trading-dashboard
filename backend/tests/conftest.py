"""Configuración de prueba: espejo exacto de backend/sql/002_seed.sql.

Si cambian los pesos o el catálogo en el seed, hay que cambiarlos aquí. Es
duplicación deliberada: los tests tienen que fallar cuando alguien toque el
catálogo sin darse cuenta de lo que arrastra. Un test que lee la configuración
de la misma fuente que el código no comprueba nada.
"""

import pytest

from app.scoring import EngineConfig, Indicator, Option, Threshold


def seed_config(*, rule_b_enabled: bool = True) -> EngineConfig:
    return EngineConfig(
        rule_b_enabled=rule_b_enabled,
        indicators=(
            Indicator(
                code="rsi_divergence",
                name="Divergencia RSI",
                max_weight=30,
                display_order=1,
                is_gate=True,
                options=(
                    Option("regular_bullish", "Divergencia regular alcista", 30),
                    Option("hidden_bullish", "Divergencia oculta alcista", 10),
                    Option("none", "Sin divergencia", 0, is_default=True),
                    Option("hidden_bearish", "Divergencia oculta bajista", -10),
                    Option("regular_bearish", "Divergencia regular bajista", -30),
                ),
            ),
            Indicator(
                code="weekly_trend",
                name="Tendencia semanal",
                max_weight=20,
                display_order=2,
                options=(
                    Option("bullish", "Alcista", 20),
                    Option("bearish", "Bajista", -20),
                ),
            ),
            Indicator(
                code="support_resistance",
                name="Soporte / Resistencia",
                max_weight=15,
                display_order=3,
                options=(
                    Option("near_support", "Precio cerca de soporte", 15),
                    Option("far", "Precio lejos de cualquier zona", 0, is_default=True),
                    Option("near_resistance", "Precio cerca de resistencia", -15),
                ),
            ),
            Indicator(
                code="liquidity",
                name="Liquidez",
                max_weight=15,
                display_order=4,
                options=(
                    Option("lower_swept", "Barrida la liquidez inferior", 15),
                    Option("none", "Sin barrido", 0, is_default=True),
                    Option("upper_swept", "Barrida la liquidez superior", -15),
                ),
            ),
            Indicator(
                code="chart_pattern",
                name="Patrones graficos",
                max_weight=10,
                display_order=5,
                options=(
                    Option("bullish", "Patron alcista", 10),
                    Option("none", "Sin patron", 0, is_default=True),
                    Option("bearish", "Patron bajista", -10),
                ),
            ),
            Indicator(
                code="kiyotaka_barrier",
                name="Barreras Kiyotaka",
                max_weight=10,
                display_order=6,
                options=(
                    Option("buy_wall", "Barrera compradora fuerte", 10),
                    Option("none", "Sin barrera relevante", 0, is_default=True),
                    Option("sell_wall", "Barrera vendedora fuerte", -10),
                ),
            ),
        ),
        thresholds=(
            Threshold("very_strong", "Operacion muy fuerte", 90, 100, True),
            Threshold("good", "Buena oportunidad", 70, 89, True),
            Threshold("medium", "Confianza media", 50, 69, True),
            Threshold("no_trade", "NO OPERAR", 0, 49, False),
        ),
    )


@pytest.fixture
def config() -> EngineConfig:
    return seed_config()


def sel(**overrides: str) -> dict[str, str]:
    """Selección completa, partiendo de la más neutra posible.

    `weekly_trend` arranca en alcista porque no tiene estado neutral: hay que
    elegir sí o sí. `rsi_divergence` arranca en `none`, que dispara la Regla A;
    los tests que quieran evaluar algo tienen que sacarlo de ahí explícitamente,
    igual que el trader en el formulario.
    """
    base = {
        "rsi_divergence": "none",
        "weekly_trend": "bullish",
        "support_resistance": "far",
        "liquidity": "none",
        "chart_pattern": "none",
        "kiyotaka_barrier": "none",
    }
    base.update(overrides)
    return base
