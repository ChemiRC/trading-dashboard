"""Tests de los endpoints, contra la base de datos real.

No se mockea Postgres. La mitad de las reglas del proyecto —peso contra
opciones, bandas sin solapar, coherencia de los setups— **viven en el esquema**,
y un mock las daría todas por buenas: pasarían los tests y fallaría la
aplicación. Los tests del motor (`test_engine.py`) sí son puros y no tocan nada.

Todo lo que escriben usa el símbolo `ZZTEST` y se borra al terminar.
"""

import os
import uuid

import pytest

pytest.importorskip("fastapi", reason="requirements.txt no instalado")

SYMBOL = "ZZTEST"

pytestmark = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL") and not (
        os.path.exists(os.path.join(os.path.dirname(__file__), "..", ".env"))
    ),
    reason="Sin DATABASE_URL ni backend/.env: no hay base de datos contra la que probar.",
)


# --- Catálogo ---------------------------------------------------------------


def test_health_no_toca_la_base_de_datos(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_health_db_reporta_la_config(client):
    cuerpo = client.get("/health/db").json()
    assert cuerpo["database"] == "ok"
    assert cuerpo["config_ok"] is True, cuerpo["config"]


def test_catalogo_trae_los_seis_indicadores_en_orden(client, catalogo):
    codigos = [i["code"] for i in catalogo["indicators"]]
    assert codigos == [
        "rsi_divergence",
        "weekly_trend",
        "support_resistance",
        "liquidity",
        "chart_pattern",
        "kiyotaka_barrier",
    ]


def test_los_pesos_del_catalogo_suman_100(client, catalogo):
    assert sum(i["max_weight"] for i in catalogo["indicators"]) == 100
    assert catalogo["max_abs_balance"] == 100


def test_hay_exactamente_una_puerta(client, catalogo):
    puertas = [i["code"] for i in catalogo["indicators"] if i["is_gate"]]
    assert puertas == ["rsi_divergence"]
    assert catalogo["gate_indicator_code"] == "rsi_divergence"


def test_la_tendencia_semanal_no_tiene_default(client, catalogo):
    """No es un olvido: no existe estado neutral, hay que mirar el semanal."""
    assert "weekly_trend" not in catalogo["defaults"]
    semanal = next(i for i in catalogo["indicators"] if i["code"] == "weekly_trend")
    assert not any(o["is_default"] for o in semanal["options"])


def test_el_formulario_arranca_en_no_trade(client, catalogo):
    """El default de la puerta vale 0 puntos: se arranca fuera y hay que salir."""
    puerta = next(i for i in catalogo["indicators"] if i["is_gate"])
    default = next(o for o in puerta["options"] if o["is_default"])
    assert default["points"] == 0


def test_ninguna_opcion_supera_el_peso_de_su_indicador(client, catalogo):
    for ind in catalogo["indicators"]:
        for opt in ind["options"]:
            assert abs(opt["points"]) <= ind["max_weight"], (ind["code"], opt["code"])


def test_las_bandas_cubren_0_100_sin_huecos(client, catalogo):
    bandas = sorted(catalogo["thresholds"], key=lambda t: t["min_abs_balance"])
    assert bandas[0]["min_abs_balance"] == 0
    assert bandas[-1]["max_abs_balance"] == 100
    for anterior, siguiente in zip(bandas, bandas[1:]):
        assert siguiente["min_abs_balance"] == anterior["max_abs_balance"] + 1


# --- Evaluación sin guardar -------------------------------------------------


def test_todo_alcista_da_long_de_100(client, todo_alcista):
    r = client.post("/api/setups/evaluate", json={"selections": todo_alcista})
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["decision"] == "LONG"
    assert cuerpo["direction"] == "LONG"
    assert cuerpo["raw_balance"] == 100
    assert cuerpo["strength"] == 100
    assert cuerpo["classification_code"] == "very_strong"


def test_todo_bajista_da_short_de_menos_100(client, todo_bajista):
    cuerpo = client.post("/api/setups/evaluate", json={"selections": todo_bajista}).json()
    assert cuerpo["decision"] == "SHORT"
    assert cuerpo["raw_balance"] == -100
    # La clasificación sale del VALOR ABSOLUTO: la misma banda que el +100.
    assert cuerpo["classification_code"] == "very_strong"


def test_regla_a_corta_sin_calcular_balance(client, todo_alcista):
    cuerpo = client.post(
        "/api/setups/evaluate",
        json={"selections": {**todo_alcista, "rsi_divergence": "none"}},
    ).json()
    assert cuerpo["decision"] == "NO_TRADE"
    assert cuerpo["no_trade_reason"] == "GATE_NO_DIVERGENCE"
    # Lo importante: NO hay balance. La regla dice que no se calcula nada, y
    # devolver un +70 "informativo" invitaría a operarlo igual.
    assert cuerpo["raw_balance"] is None
    assert cuerpo["direction"] is None
    # Las respuestas del formulario sí vuelven: son suyas, no una evaluación.
    assert len(cuerpo["contributions"]) == 6


def test_regla_b_cuando_la_evidencia_contradice_al_disparador(client):
    cuerpo = client.post("/api/setups/evaluate", json={"selections": {
        "rsi_divergence": "hidden_bullish",       # +10, apunta a LONG
        "weekly_trend": "bearish",                # -20
        "support_resistance": "near_resistance",  # -15
        "liquidity": "upper_swept",               # -15
        "chart_pattern": "bearish",               # -10
        "kiyotaka_barrier": "sell_wall",          # -10
    }}).json()
    assert cuerpo["raw_balance"] == -60
    assert cuerpo["decision"] == "NO_TRADE"
    assert cuerpo["no_trade_reason"] == "TRIGGER_CONTRADICTION"
    # La dirección se conserva aunque no se opere: es justo el dato de la Fase 4.
    assert cuerpo["direction"] == "SHORT"


def test_por_debajo_del_umbral_hay_direccion_pero_no_operacion(client, todo_alcista):
    cuerpo = client.post("/api/setups/evaluate", json={"selections": {
        **todo_alcista,
        "rsi_divergence": "hidden_bullish",   # +10
        "weekly_trend": "bearish",            # -20
        "support_resistance": "far",          #   0
        "liquidity": "none",                  #   0
        "chart_pattern": "bullish",           # +10
        "kiyotaka_barrier": "buy_wall",       # +10
    }}).json()
    assert cuerpo["raw_balance"] == 10
    assert cuerpo["direction"] == "LONG"
    assert cuerpo["decision"] == "NO_TRADE"
    assert cuerpo["no_trade_reason"] == "BELOW_THRESHOLD"


def test_balance_exactamente_cero(client):
    cuerpo = client.post("/api/setups/evaluate", json={"selections": {
        "rsi_divergence": "hidden_bullish",   # +10
        "weekly_trend": "bearish",            # -20
        "support_resistance": "near_support",  # +15
        "liquidity": "upper_swept",           # -15
        "chart_pattern": "bullish",           # +10
        "kiyotaka_barrier": "none",           #   0
    }}).json()
    assert cuerpo["raw_balance"] == 0
    assert cuerpo["decision"] == "NO_TRADE"
    assert cuerpo["no_trade_reason"] == "ZERO_BALANCE"
    assert cuerpo["direction"] is None


def test_el_formulario_no_puede_imponer_la_direccion(client, todo_alcista):
    """`direction` no está en el contrato de entrada y mandarlo es un 422.

    Es la regla del proyecto convertida en test: si el trader pudiera decir
    "esto es un LONG", la herramienta dejaría de cuestionar su sesgo.
    """
    r = client.post(
        "/api/setups/evaluate",
        json={"selections": todo_alcista, "direction": "LONG"},
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "REQUEST_INVALID"


def test_opcion_inexistente_es_422(client, todo_alcista):
    r = client.post(
        "/api/setups/evaluate",
        json={"selections": {**todo_alcista, "weekly_trend": "lateral"}},
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "SELECTION_INVALID"


def test_indicador_sin_responder_es_422(client, todo_alcista):
    incompleto = {k: v for k, v in todo_alcista.items() if k != "liquidity"}
    r = client.post("/api/setups/evaluate", json={"selections": incompleto})
    assert r.status_code == 422
    assert "liquidity" in r.json()["error"]["message"]


def test_evaluar_no_guarda_nada(client, todo_alcista):
    antes = client.get("/api/setups", params={"symbol": SYMBOL}).json()["total"]
    client.post("/api/setups/evaluate", json={"selections": todo_alcista})
    despues = client.get("/api/setups", params={"symbol": SYMBOL}).json()["total"]
    assert antes == despues


# --- Guardar ----------------------------------------------------------------


def test_guardar_devuelve_201_con_el_desglose(client, todo_alcista):
    r = client.post("/api/setups", json={
        "selections": todo_alcista,
        "symbol": SYMBOL,
        "timeframe": "4H",
        "price_at_evaluation": "64250.5",
    })
    assert r.status_code == 201
    cuerpo = r.json()
    assert cuerpo["decision"] == "LONG"
    assert cuerpo["raw_balance"] == 100
    assert uuid.UUID(cuerpo["id"])
    assert len(cuerpo["contributions"]) == 6


def test_el_setup_guardado_se_recupera_con_sus_selecciones(client, todo_alcista):
    creado = client.post("/api/setups", json={
        "selections": todo_alcista, "symbol": SYMBOL, "notes": "test",
    }).json()

    detalle = client.get(f"/api/setups/{creado['id']}").json()
    assert detalle["decision"] == "LONG"
    assert detalle["raw_balance"] == 100
    assert len(detalle["selections"]) == 6
    # Los puntos guardados son los que se aplicaron, indicador a indicador.
    assert sum(s["points_applied"] for s in detalle["selections"]) == 100


def test_la_regla_a_se_guarda_sin_balance(client, todo_alcista):
    """El CHECK del esquema lo exige; aquí se comprueba de punta a punta."""
    creado = client.post("/api/setups", json={
        "selections": {**todo_alcista, "rsi_divergence": "none"},
        "symbol": SYMBOL,
    }).json()

    detalle = client.get(f"/api/setups/{creado['id']}").json()
    assert detalle["decision"] == "NO_TRADE"
    assert detalle["no_trade_reason"] == "GATE_NO_DIVERGENCE"
    assert detalle["raw_balance"] is None
    assert detalle["direction"] is None
    # Aun sin balance, queda registrado QUÉ contestó: seis selecciones.
    assert len(detalle["selections"]) == 6


def test_el_setup_se_guarda_sin_resultado(client, todo_alcista):
    """Decisión de diseño central: se evalúa antes de saber si ganó."""
    creado = client.post(
        "/api/setups", json={"selections": todo_alcista, "symbol": SYMBOL}
    ).json()
    detalle = client.get(f"/api/setups/{creado['id']}").json()
    assert detalle["outcome"] is None
    assert detalle["trade_id"] is None


def test_guardar_sin_symbol_es_422(client, todo_alcista):
    r = client.post("/api/setups", json={"selections": todo_alcista})
    assert r.status_code == 422


def test_setup_inexistente_es_404(client):
    r = client.get(f"/api/setups/{uuid.uuid4()}")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "HTTP_ERROR"


def test_filtro_por_decision(client, todo_alcista):
    client.post("/api/setups", json={"selections": todo_alcista, "symbol": SYMBOL})
    client.post("/api/setups", json={
        "selections": {**todo_alcista, "rsi_divergence": "none"}, "symbol": SYMBOL,
    })

    solo_long = client.get(
        "/api/setups", params={"symbol": SYMBOL, "decision": "LONG"}
    ).json()
    assert solo_long["total"] >= 1
    assert all(i["decision"] == "LONG" for i in solo_long["items"])

    por_motivo = client.get("/api/setups", params={
        "symbol": SYMBOL, "no_trade_reason": "GATE_NO_DIVERGENCE",
    }).json()
    assert por_motivo["total"] >= 1
    assert all(i["no_trade_reason"] == "GATE_NO_DIVERGENCE" for i in por_motivo["items"])


# --- Configuración ----------------------------------------------------------


def test_el_trigger_impide_bajar_el_peso_por_debajo_de_sus_opciones(client):
    r = client.patch("/api/config/indicators/rsi_divergence", json={"max_weight": 5})
    assert r.status_code == 409
    # El mensaje del trigger llega íntegro al cliente, no un "error de validación".
    assert "Divergencia RSI" in r.json()["error"]["message"]


def test_el_exclude_impide_bandas_solapadas(client):
    r = client.patch(
        "/api/config/thresholds/good",
        json={"min_abs_balance": 85, "max_abs_balance": 100},
    )
    assert r.status_code == 409
    assert r.json()["error"]["constraint"] == "classification_thresholds_int4range_excl"
    assert "solapar" in r.json()["error"]["message"]


def test_solo_puede_haber_un_indicador_puerta(client):
    r = client.patch("/api/config/indicators/liquidity", json={"is_gate": True})
    assert r.status_code == 409


def test_renombrar_un_indicador_no_cambia_su_code(client):
    """El trader renombra desde ajustes; el motor referencia `code`."""
    original = next(
        i for i in client.get("/api/config/catalog").json()["indicators"]
        if i["code"] == "kiyotaka_barrier"
    )
    try:
        r = client.patch(
            "/api/config/indicators/kiyotaka_barrier", json={"name": "Muros de ordenes"}
        )
        assert r.status_code == 200
        assert r.json()["name"] == "Muros de ordenes"
        assert r.json()["code"] == "kiyotaka_barrier"
    finally:
        client.patch(
            "/api/config/indicators/kiyotaka_barrier", json={"name": original["name"]}
        )


def test_indicador_inexistente_es_404(client):
    r = client.patch("/api/config/indicators/no_existe", json={"max_weight": 10})
    assert r.status_code == 404


def test_patch_vacio_es_422(client):
    r = client.patch("/api/config/indicators/liquidity", json={})
    assert r.status_code == 422


def test_patch_con_campo_desconocido_es_422(client):
    r = client.patch("/api/config/indicators/liquidity", json={"peso": 20})
    assert r.status_code == 422
