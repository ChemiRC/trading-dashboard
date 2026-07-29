"""Tests del motor de decisión.

Organizados por lo que protegen, no por función: las dos reglas del trader son
lo que más va a doler si se rompe en silencio.
"""

import dataclasses

import pytest

from app.scoring import ConfigError, EngineConfig, Indicator, Option, SelectionError, Threshold, evaluate
from conftest import seed_config, sel


# =============================================================================
#  La configuración del seed es coherente
# =============================================================================

def test_los_pesos_suman_cien(config):
    assert config.max_abs_balance == 100


def test_solo_hay_un_indicador_puerta(config):
    assert config.gate is not None
    assert config.gate.code == "rsi_divergence"
    assert sum(i.is_gate for i in config.indicators) == 1


def test_los_umbrales_cubren_cero_a_cien_sin_huecos_ni_solapes(config):
    cubierto = [
        sum(t.covers(v) for t in config.thresholds)
        for v in range(0, 101)
    ]
    assert cubierto == [1] * 101, "cada valor 0..100 debe caer en exactamente una banda"


def test_solo_tendencia_semanal_carece_de_opcion_neutra(config):
    sin_neutra = {
        i.code for i in config.indicators
        if not any(o.points == 0 for o in i.options)
    }
    assert sin_neutra == {"weekly_trend"}


def test_ninguna_opcion_supera_el_peso_de_su_indicador(config):
    for ind in config.indicators:
        for opt in ind.options:
            assert abs(opt.points) <= ind.max_weight, f"{ind.code}/{opt.code}"


# =============================================================================
#  REGLA A — puerta de entrada
# =============================================================================

def test_regla_a_sin_divergencia_es_no_trade_inmediato(config):
    r = evaluate(sel(rsi_divergence="none"), config)

    assert r.decision == "NO_TRADE"
    assert r.no_trade_reason == "GATE_NO_DIVERGENCE"
    assert r.raw_balance is None, "la Regla A dice que NO se calcula balance"
    assert r.direction is None
    assert r.classification_code is None
    assert r.strength is None


def test_regla_a_manda_aunque_todo_lo_demas_sea_alcista(config):
    """El caso que justifica la regla: seis confluencias perfectas y sin
    disparador. El trader se queda fuera igual."""
    r = evaluate(
        sel(
            rsi_divergence="none",
            weekly_trend="bullish",
            support_resistance="near_support",
            liquidity="lower_swept",
            chart_pattern="bullish",
            kiyotaka_barrier="buy_wall",
        ),
        config,
    )
    assert r.decision == "NO_TRADE"
    assert r.no_trade_reason == "GATE_NO_DIVERGENCE"
    assert r.raw_balance is None


def test_regla_a_devuelve_igualmente_lo_que_respondio_el_trader(config):
    """No se evalúa nada, pero las respuestas del formulario se conservan:
    son las filas de setup_selections."""
    r = evaluate(sel(rsi_divergence="none", chart_pattern="bullish"), config)

    assert len(r.contributions) == 6
    patron = next(c for c in r.contributions if c.indicator_code == "chart_pattern")
    assert patron.points == 10


# =============================================================================
#  REGLA B — contradicción entre disparador y evidencia
#  PENDIENTE DE CONFIRMAR CON EL TRADER
# =============================================================================

def test_regla_b_ejemplo_literal_del_trader(config):
    """Divergencia alcista +30 pero balance total -40."""
    r = evaluate(
        sel(
            rsi_divergence="regular_bullish",   # +30
            weekly_trend="bearish",             # -20
            support_resistance="near_resistance",  # -15
            liquidity="upper_swept",            # -15
            chart_pattern="bearish",            # -10
            kiyotaka_barrier="sell_wall",       # -10
        ),
        config,
    )

    assert r.raw_balance == -40
    assert r.decision == "NO_TRADE"
    assert r.no_trade_reason == "TRIGGER_CONTRADICTION"
    assert r.direction == "SHORT", "la evidencia sigue apuntando a SHORT aunque no se opere"


def test_regla_b_gana_al_umbral_cuando_la_magnitud_seria_suficiente(config):
    """|−60| entra en 'confianza media', así que sin la Regla B esto sería un
    SHORT operable. La regla es lo único que lo frena."""
    seleccion = sel(
        rsi_divergence="hidden_bullish",       # +10  disparador alcista
        weekly_trend="bearish",                # -20
        support_resistance="near_resistance",  # -15
        liquidity="upper_swept",               # -15
        chart_pattern="bearish",               # -10
        kiyotaka_barrier="sell_wall",          # -10
    )

    con_regla = evaluate(seleccion, seed_config(rule_b_enabled=True))
    assert con_regla.raw_balance == -60
    assert con_regla.decision == "NO_TRADE"
    assert con_regla.no_trade_reason == "TRIGGER_CONTRADICTION"
    assert con_regla.classification_code == "medium"

    sin_regla = evaluate(seleccion, seed_config(rule_b_enabled=False))
    assert sin_regla.raw_balance == -60
    assert sin_regla.decision == "SHORT"
    assert sin_regla.no_trade_reason is None


def test_regla_b_no_salta_cuando_disparador_y_balance_coinciden(config):
    r = evaluate(
        sel(
            rsi_divergence="regular_bearish",      # -30
            weekly_trend="bearish",                # -20
            support_resistance="near_resistance",  # -15
        ),
        config,
    )
    assert r.raw_balance == -65
    assert r.decision == "SHORT"
    assert r.no_trade_reason is None


def test_regla_b_es_simetrica_en_short(config):
    """Disparador bajista, evidencia neta alcista."""
    r = evaluate(
        sel(
            rsi_divergence="hidden_bearish",   # -10
            weekly_trend="bullish",            # +20
            support_resistance="near_support",  # +15
            liquidity="lower_swept",           # +15
            chart_pattern="bullish",           # +10
            kiyotaka_barrier="buy_wall",       # +10
        ),
        config,
    )
    assert r.raw_balance == 60
    assert r.decision == "NO_TRADE"
    assert r.no_trade_reason == "TRIGGER_CONTRADICTION"
    assert r.direction == "LONG"


# =============================================================================
#  Balance, dirección y clasificación
# =============================================================================

def test_maximo_teorico_alcista(config):
    r = evaluate(
        sel(
            rsi_divergence="regular_bullish",
            weekly_trend="bullish",
            support_resistance="near_support",
            liquidity="lower_swept",
            chart_pattern="bullish",
            kiyotaka_barrier="buy_wall",
        ),
        config,
    )
    assert r.raw_balance == 100
    assert r.decision == "LONG"
    assert r.direction == "LONG"
    assert r.classification_code == "very_strong"
    assert r.strength == 100


def test_maximo_teorico_bajista(config):
    r = evaluate(
        sel(
            rsi_divergence="regular_bearish",
            weekly_trend="bearish",
            support_resistance="near_resistance",
            liquidity="upper_swept",
            chart_pattern="bearish",
            kiyotaka_barrier="sell_wall",
        ),
        config,
    )
    assert r.raw_balance == -100
    assert r.decision == "SHORT"
    assert r.direction == "SHORT"
    assert r.classification_code == "very_strong", "la fuerza es el valor absoluto"
    assert r.strength == 100


def test_la_clasificacion_solo_mira_la_magnitud(config):
    """+65 y -65 tienen que clasificar igual y decidir al revés."""
    largo = evaluate(
        sel(rsi_divergence="regular_bullish", weekly_trend="bullish",
            support_resistance="near_support"),
        config,
    )
    corto = evaluate(
        sel(rsi_divergence="regular_bearish", weekly_trend="bearish",
            support_resistance="near_resistance"),
        config,
    )

    assert largo.raw_balance == 65
    assert corto.raw_balance == -65
    assert largo.classification_code == corto.classification_code == "medium"
    assert (largo.decision, corto.decision) == ("LONG", "SHORT")


def test_balance_por_debajo_del_umbral_no_se_opera(config):
    r = evaluate(
        sel(
            rsi_divergence="regular_bullish",      # +30
            weekly_trend="bullish",                # +20
            support_resistance="near_resistance",  # -15
            kiyotaka_barrier="sell_wall",          # -10
        ),
        config,
    )
    assert r.raw_balance == 25
    assert r.decision == "NO_TRADE"
    assert r.no_trade_reason == "BELOW_THRESHOLD"
    assert r.direction == "LONG", "la evidencia apunta a LONG; simplemente no basta"
    assert r.classification_code == "no_trade"


def test_balance_exactamente_cero(config):
    r = evaluate(
        sel(
            rsi_divergence="hidden_bullish",     # +10
            weekly_trend="bearish",              # -20
            support_resistance="near_support",   # +15
            liquidity="upper_swept",             # -15
            chart_pattern="bullish",             # +10
            kiyotaka_barrier="none",             #   0
        ),
        config,
    )
    assert r.raw_balance == 0
    assert r.decision == "NO_TRADE"
    assert r.no_trade_reason == "ZERO_BALANCE", "el cero se resuelve antes que la Regla B"
    assert r.direction is None, "sin signo no hay direccion que deducir"


@pytest.mark.parametrize(
    "balance_objetivo, codigo_esperado, operable",
    [
        (100, "very_strong", True),
        (90, "very_strong", True),
        (89, "good", True),
        (70, "good", True),
        (69, "medium", True),
        (50, "medium", True),
        (49, "no_trade", False),
        (0, "no_trade", False),
    ],
)
def test_fronteras_de_las_bandas(config, balance_objetivo, codigo_esperado, operable):
    banda = next(t for t in config.thresholds if t.covers(balance_objetivo))
    assert banda.code == codigo_esperado
    assert banda.is_tradeable is operable


# =============================================================================
#  Desglose (Confluence Score)
# =============================================================================

def test_las_aportaciones_suman_el_balance(config):
    r = evaluate(
        sel(rsi_divergence="hidden_bearish", weekly_trend="bearish",
            liquidity="lower_swept"),
        config,
    )
    assert sum(c.points for c in r.contributions) == r.raw_balance


def test_las_aportaciones_van_en_el_orden_del_catalogo(config):
    r = evaluate(sel(rsi_divergence="regular_bullish"), config)
    assert [c.indicator_code for c in r.contributions] == [
        "rsi_divergence",
        "weekly_trend",
        "support_resistance",
        "liquidity",
        "chart_pattern",
        "kiyotaka_barrier",
    ]


def test_el_ratio_normaliza_pesos_distintos(config):
    r = evaluate(
        sel(rsi_divergence="regular_bullish", kiyotaka_barrier="buy_wall"),
        config,
    )
    por_codigo = {c.indicator_code: c for c in r.contributions}

    # +30 sobre 30 y +10 sobre 10: aportaciones distintas, ambas al tope.
    assert por_codigo["rsi_divergence"].ratio == 1.0
    assert por_codigo["kiyotaka_barrier"].ratio == 1.0
    assert por_codigo["liquidity"].ratio == 0.0


def test_la_aportacion_guarda_la_etiqueta_para_congelarla(config):
    r = evaluate(sel(rsi_divergence="hidden_bullish"), config)
    div = r.contributions[0]
    assert div.option_label == "Divergencia oculta alcista"
    assert div.points == 10
    assert div.max_weight == 30


# =============================================================================
#  Validación: el motor revienta en vez de inventarse valores
# =============================================================================

def test_falta_un_indicador_por_responder(config):
    incompleta = sel(rsi_divergence="regular_bullish")
    del incompleta["liquidity"]

    with pytest.raises(SelectionError, match="liquidity"):
        evaluate(incompleta, config)


def test_indicador_desconocido(config):
    with pytest.raises(SelectionError, match="luna_llena"):
        evaluate(sel(luna_llena="creciente"), config)


def test_opcion_que_no_existe_en_ese_indicador(config):
    with pytest.raises(SelectionError, match="triangulo"):
        evaluate(sel(rsi_divergence="regular_bullish", chart_pattern="triangulo"), config)


def test_el_formulario_nunca_manda_la_direccion(config):
    """Si alguien añade 'direction' a la petición, se rechaza. La dirección la
    deduce el motor: aceptarla abriría la puerta a forzarla desde el cliente."""
    with pytest.raises(SelectionError, match="direction"):
        evaluate(sel(rsi_divergence="regular_bullish", direction="LONG"), config)


def test_configuracion_sin_puerta(config):
    rota = dataclasses.replace(
        config,
        indicators=tuple(
            dataclasses.replace(i, is_gate=False) for i in config.indicators
        ),
    )
    with pytest.raises(ConfigError, match="is_gate"):
        evaluate(sel(rsi_divergence="regular_bullish"), rota)


def test_configuracion_con_dos_puertas(config):
    rota = dataclasses.replace(
        config,
        indicators=tuple(
            dataclasses.replace(i, is_gate=True) if i.code in ("rsi_divergence", "liquidity") else i
            for i in config.indicators
        ),
    )
    with pytest.raises(ConfigError, match="is_gate"):
        evaluate(sel(rsi_divergence="regular_bullish"), rota)


def test_opcion_que_se_pasa_del_peso_del_indicador(config):
    """La misma regla que vigilan los triggers del esquema SQL. Se comprueba
    también aquí porque en backtesting no hay Postgres detrás."""
    rota = dataclasses.replace(
        config,
        indicators=tuple(
            dataclasses.replace(i, options=i.options + (Option("absurda", "Absurda", 99),))
            if i.code == "kiyotaka_barrier" else i
            for i in config.indicators
        ),
    )
    with pytest.raises(ConfigError, match="peso maximo"):
        evaluate(sel(rsi_divergence="regular_bullish"), rota)


def test_umbrales_con_un_hueco(config):
    """Si el trader edita los umbrales y deja 0..48 y 50..100, el 49 no cae en
    ninguna banda. Mejor reventar que devolver una clasificación inventada."""
    seleccion = sel(
        rsi_divergence="regular_bullish",      # +30
        weekly_trend="bullish",                # +20
        support_resistance="near_resistance",  # -15
        liquidity="lower_swept",               # +15
        chart_pattern="bullish",               # +10
        kiyotaka_barrier="sell_wall",          # -10
    )
    assert evaluate(seleccion, config).raw_balance == 50, "esta seleccion da 50"

    con_hueco = dataclasses.replace(
        config,
        thresholds=(
            Threshold("no_trade", "NO OPERAR", 0, 49, False),
            Threshold("good", "Buena oportunidad", 51, 100, True),
        ),
    )
    with pytest.raises(ConfigError, match="hueco"):
        evaluate(seleccion, con_hueco)


def test_configuracion_sin_umbrales(config):
    rota = dataclasses.replace(config, thresholds=())
    with pytest.raises(ConfigError, match="umbrales"):
        evaluate(sel(rsi_divergence="regular_bullish"), rota)


# =============================================================================
#  Pureza
# =============================================================================

def test_evaluar_dos_veces_da_exactamente_lo_mismo(config):
    seleccion = sel(rsi_divergence="regular_bullish", weekly_trend="bullish",
                    liquidity="lower_swept")
    assert evaluate(seleccion, config) == evaluate(seleccion, config)


def test_evaluar_no_toca_ni_la_seleccion_ni_la_configuracion(config):
    seleccion = sel(rsi_divergence="regular_bullish")
    copia_seleccion = dict(seleccion)
    copia_config = seed_config()

    evaluate(seleccion, config)

    assert seleccion == copia_seleccion
    assert config == copia_config


def test_el_motor_no_importa_nada_fuera_de_la_stdlib():
    """El aislamiento de app/scoring no es una intención, es una restricción.

    Si alguien mete Pydantic, el driver de Postgres o FastAPI aquí dentro, el
    motor deja de ser reutilizable en el backtesting de la Fase 5 y deja de
    poder testearse sin levantar nada. Este test lo impide.
    """
    import ast
    import pathlib

    raiz = pathlib.Path(__file__).resolve().parents[1] / "app" / "scoring"
    permitidos = {"dataclasses", "typing", "collections", "collections.abc"}

    ficheros = sorted(raiz.glob("*.py"))
    assert ficheros, "no se encontro el paquete app/scoring"

    for fichero in ficheros:
        arbol = ast.parse(fichero.read_text(encoding="utf-8"), filename=str(fichero))
        for nodo in ast.walk(arbol):
            if isinstance(nodo, ast.ImportFrom):
                if nodo.level > 0:          # import relativo, dentro del paquete
                    continue
                modulos = [nodo.module or ""]
            elif isinstance(nodo, ast.Import):
                modulos = [a.name for a in nodo.names]
            else:
                continue

            for modulo in modulos:
                assert modulo in permitidos, (
                    f"{fichero.name}:{nodo.lineno} importa '{modulo}', "
                    f"que no es stdlib permitida"
                )
