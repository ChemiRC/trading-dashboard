"""Tests del adaptador de Bybit y de la vinculación automática.

Puros: ni red ni base de datos. La firma se comprueba contra un HMAC
calculado a mano, la traducción contra una respuesta real de Bybit copiada
como fixture, y la vinculación con una tabla de casos —el mismo criterio que
`test_engine.py`—.

Lo único que estos tests NO pueden comprobar es que Bybit conteste lo que
creemos: eso necesita credenciales de testnet y está anotado como tal en el
README.
"""

import hashlib
import hmac
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from app.adapters import bybit, vinculacion

# ---------------------------------------------------------------------------
#  Firma y host
# ---------------------------------------------------------------------------


def test_el_host_sale_de_la_bandera_y_nunca_esta_escrito_en_la_llamada():
    assert bybit.host(True) == "https://api-testnet.bybit.com"
    assert bybit.host(False) == "https://api.bybit.com"


def test_la_firma_es_el_hmac_del_esquema_v5():
    """timestamp + api_key + recv_window + query, en ese orden."""
    firmado = bybit._firma("secreto", 1700000000000, "miclave", "category=linear")

    esperado = hmac.new(
        b"secreto",
        f"1700000000000miclave{bybit.RECV_WINDOW_MS}category=linear".encode(),
        hashlib.sha256,
    ).hexdigest()

    assert firmado == esperado


def test_la_firma_cambia_si_cambia_cualquier_parte():
    base = bybit._firma("s", 1, "k", "a=1")
    assert base != bybit._firma("otro", 1, "k", "a=1")
    assert base != bybit._firma("s", 2, "k", "a=1")
    assert base != bybit._firma("s", 1, "otra", "a=1")
    assert base != bybit._firma("s", 1, "k", "a=2")


def test_sin_credenciales_no_se_llega_a_hacer_la_peticion():
    with pytest.raises(bybit.BybitNoConfigurado):
        bybit._get("/v5/position/closed-pnl", {}, api_key="", api_secret="x", testnet=True)
    with pytest.raises(bybit.BybitNoConfigurado):
        bybit._get("/v5/position/closed-pnl", {}, api_key="x", api_secret="", testnet=True)


# ---------------------------------------------------------------------------
#  Traducción
# ---------------------------------------------------------------------------

#: Una fila tal y como la devuelve `GET /v5/position/closed-pnl`.
FILA_BYBIT = {
    "symbol": "BTCUSDT",
    "orderId": "8dc9b6f4-1234-4a1b-9f2e-0000deadbeef",
    "side": "Sell",
    "qty": "0.150",
    "orderPrice": "65100.00",
    "orderType": "Market",
    "execType": "Trade",
    "closedSize": "0.150",
    "avgEntryPrice": "64000.50",
    "cumEntryValue": "9600.075",
    "avgExitPrice": "65100.00",
    "cumExitValue": "9765.00",
    "closedPnl": "164.925",
    "fillCount": "1",
    "leverage": "10",
    "createdTime": "1753000000000",
    "updatedTime": "1753086400000",
}


def test_traduce_los_campos_a_las_columnas_de_trades():
    t = bybit.a_trade(FILA_BYBIT)

    assert t["bybit_order_id"] == "8dc9b6f4-1234-4a1b-9f2e-0000deadbeef"
    assert t["symbol"] == "BTCUSDT"
    assert t["entry_price"] == Decimal("64000.50")
    assert t["exit_price"] == Decimal("65100.00")
    assert t["quantity"] == Decimal("0.150")
    assert t["leverage"] == Decimal("10")
    assert t["pnl_net"] == Decimal("164.925")
    assert t["source"] == "bybit"


def test_el_lado_se_invierte_porque_bybit_da_el_de_la_orden_de_cierre():
    """Una posicion LARGA se cierra VENDIENDO. Sin invertir, todo el historico
    entraria con la direccion al reves."""
    assert bybit.lado_de_la_posicion("Sell") == "LONG"
    assert bybit.lado_de_la_posicion("Buy") == "SHORT"
    assert bybit.a_trade(FILA_BYBIT)["side"] == "LONG"


def test_un_lado_desconocido_no_se_inventa():
    assert bybit.lado_de_la_posicion(None) is None
    assert bybit.lado_de_la_posicion("") is None
    assert bybit.lado_de_la_posicion("Lateral") is None


def test_las_fechas_llegan_en_utc_desde_milisegundos():
    t = bybit.a_trade(FILA_BYBIT)
    assert t["opened_at"] == datetime.fromtimestamp(1753000000, tz=UTC)
    assert t["closed_at"] == datetime.fromtimestamp(1753086400, tz=UTC)
    assert t["closed_at"] > t["opened_at"]


def test_los_campos_que_bybit_no_da_quedan_a_null_y_no_se_inventan():
    """closed-pnl da el PnL ya neto; desglosar fees y funding a ojo produciria
    discrepancias con el extracto real."""
    t = bybit.a_trade(FILA_BYBIT)
    assert "fees" not in t
    assert "funding" not in t
    assert "pnl_gross" not in t


def test_una_fila_incompleta_no_revienta_la_traduccion():
    t = bybit.a_trade({})
    assert t["bybit_order_id"] is None
    assert t["side"] is None
    assert t["entry_price"] is None
    assert t["opened_at"] is None


def test_un_numero_corrupto_no_revienta_la_traduccion():
    t = bybit.a_trade({**FILA_BYBIT, "avgEntryPrice": "no-es-un-numero"})
    assert t["entry_price"] is None
    assert t["exit_price"] == Decimal("65100.00")


# ---------------------------------------------------------------------------
#  Ventanas de paginación
# ---------------------------------------------------------------------------


def test_un_rango_largo_se_trocea_en_ventanas_que_bybit_acepta():
    desde = datetime(2026, 1, 1, tzinfo=UTC)
    hasta = desde + timedelta(days=30)

    ventanas = list(bybit._ventanas(desde, hasta))

    assert all(
        (fin - inicio) <= timedelta(days=bybit.DIAS_POR_VENTANA)
        for inicio, fin in ventanas
    )
    # Sin huecos ni solapes: cada ventana empieza donde acabo la anterior.
    assert ventanas[0][0] == desde
    assert ventanas[-1][1] == hasta
    for (_, fin), (siguiente, _) in zip(ventanas, ventanas[1:]):
        assert fin == siguiente


def test_un_rango_corto_es_una_sola_ventana():
    desde = datetime(2026, 1, 1, tzinfo=UTC)
    assert len(list(bybit._ventanas(desde, desde + timedelta(days=2)))) == 1


def test_la_primera_sincronizacion_cubre_todo_el_historial_que_bybit_conserva():
    """Es la unica oportunidad de traerlo: las siguientes solo miran adelante."""
    assert bybit.DIAS_PRIMERA_SINCRONIZACION == 730


# ---------------------------------------------------------------------------
#  Criba de instrumentos ajenos a la operativa
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "symbol", ["BTCUSDT", "ETHUSDT", "SOLUSDT", "RAVEUSDT", "btcusdt", " ETHUSDT "]
)
def test_los_pares_en_usdt_entran(symbol):
    assert bybit.es_operativa_del_trader(symbol)


@pytest.mark.parametrize("symbol", ["BTCPERP", "ETHPERP", "btcperp", " BTCPERP "])
def test_los_perpetuos_no_entran(symbol):
    """El trader no los opera: no es que no vinculen, es que no son suyos."""
    assert not bybit.es_operativa_del_trader(symbol)


@pytest.mark.parametrize("symbol", ["", None, "   "])
def test_un_simbolo_vacio_no_entra(symbol):
    assert not bybit.es_operativa_del_trader(symbol)


def test_no_hay_lista_blanca_de_pares():
    """Un par nuevo entra solo, sin tocar codigo. Lo que se enumera es lo
    excluido, no lo permitido: una lista blanca dejaria fuera en silencio el
    dia que el trader estrene un par."""
    assert bybit.es_operativa_del_trader("PARQUENADIEHAVISTOUSDT")


# ---------------------------------------------------------------------------
#  Normalización de símbolo
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("entrada", "esperado"),
    [
        ("BTCUSDT", "BTC"),
        ("BTC", "BTC"),
        ("btc", "BTC"),
        ("BTC/USDT", "BTC"),
        ("btc-usdt", "BTC"),
        (" BTCUSDT ", "BTC"),
        ("ETHUSDC", "ETH"),
        ("1000PEPEUSDT", "1000PEPE"),
        ("SOLUSD", "SOL"),
        ("", ""),
        (None, ""),
    ],
)
def test_normaliza_simbolo(entrada, esperado):
    assert vinculacion.normaliza_simbolo(entrada) == esperado


def test_un_simbolo_que_es_solo_la_cotizacion_no_se_queda_vacio():
    """Vaciarlo lo haria emparejar con cualquier cosa."""
    assert vinculacion.normaliza_simbolo("USDT") == "USDT"


def test_perp_no_se_recorta_y_por_tanto_no_empareja_con_el_par_en_usdt():
    """Comparacion estricta: el adaptador ya descarta los perpetuos, asi que
    recortar PERP solo serviria para confundir BTCUSDT con BTCPERP."""
    assert vinculacion.normaliza_simbolo("BTCPERP") == "BTCPERP"
    assert vinculacion.normaliza_simbolo("BTCPERP") != vinculacion.normaliza_simbolo("BTCUSDT")


def test_btc_del_setup_empareja_con_btcusdt_de_bybit():
    assert vinculacion.normaliza_simbolo("BTC") == vinculacion.normaliza_simbolo("BTCUSDT")


def test_simbolos_distintos_no_emparejan():
    assert vinculacion.normaliza_simbolo("ETHUSDT") != vinculacion.normaliza_simbolo("BTCUSDT")


# ---------------------------------------------------------------------------
#  Tolerancia de precio
# ---------------------------------------------------------------------------


def test_el_precio_entra_dentro_de_la_tolerancia():
    # 0.5% de 64000 son 320.
    assert vinculacion.precio_compatible(Decimal("64000"), Decimal("64000"))
    assert vinculacion.precio_compatible(Decimal("64320"), Decimal("64000"))
    assert vinculacion.precio_compatible(Decimal("63680"), Decimal("64000"))


def test_el_precio_fuera_de_la_tolerancia_no_vale():
    assert not vinculacion.precio_compatible(Decimal("64321"), Decimal("64000"))
    assert not vinculacion.precio_compatible(Decimal("63679"), Decimal("64000"))


def test_sin_precio_no_se_da_por_cumplido_el_criterio():
    """No poder comprobar algo no es lo mismo que cumplirlo."""
    assert not vinculacion.precio_compatible(None, Decimal("64000"))
    assert not vinculacion.precio_compatible(Decimal("64000"), None)
    assert not vinculacion.precio_compatible(Decimal("64000"), Decimal("0"))


def test_la_tolerancia_es_ajustable():
    assert not vinculacion.precio_compatible(Decimal("65000"), Decimal("64000"))
    assert vinculacion.precio_compatible(
        Decimal("65000"), Decimal("64000"), tolerancia=Decimal("0.02")
    )


# ---------------------------------------------------------------------------
#  Elección de setup
# ---------------------------------------------------------------------------

APERTURA = datetime(2026, 7, 20, 12, 0, tzinfo=UTC)


def _trade(**cambios):
    base = {
        "symbol": "BTCUSDT",
        "entry_price": Decimal("64000"),
        "opened_at": APERTURA,
    }
    return {**base, **cambios}


def _setup(id_, *, symbol="BTC", precio="64000", horas_antes=2):
    return {
        "id": id_,
        "symbol": symbol,
        "price_at_evaluation": Decimal(precio) if precio is not None else None,
        "evaluated_at": APERTURA - timedelta(hours=horas_antes),
    }


def test_vincula_cuando_se_cumplen_los_tres_criterios():
    elegido = vinculacion.elegir_setup(_trade(), [_setup("s1")])
    assert elegido["id"] == "s1"


def test_no_vincula_si_el_simbolo_es_otro():
    assert vinculacion.elegir_setup(_trade(), [_setup("s1", symbol="ETH")]) is None


def test_no_vincula_si_el_precio_se_aleja_demasiado():
    assert vinculacion.elegir_setup(_trade(), [_setup("s1", precio="60000")]) is None


def test_no_vincula_si_el_setup_se_evaluo_despues_de_abrir_la_operacion():
    """Un setup posterior no anticipo nada, por cerca que caiga."""
    posterior = _setup("s1", horas_antes=-1)
    assert vinculacion.elegir_setup(_trade(), [posterior]) is None


def test_no_vincula_fuera_de_la_ventana():
    assert vinculacion.elegir_setup(_trade(), [_setup("s1", horas_antes=49)]) is None


def test_el_borde_de_la_ventana_entra():
    assert vinculacion.elegir_setup(_trade(), [_setup("s1", horas_antes=48)])["id"] == "s1"


def test_con_varios_candidatos_gana_el_mas_cercano_a_la_apertura():
    candidatos = [
        _setup("lejano", horas_antes=40),
        _setup("cercano", horas_antes=3),
        _setup("intermedio", horas_antes=20),
    ]
    assert vinculacion.elegir_setup(_trade(), candidatos)["id"] == "cercano"


def test_sin_candidatos_la_operacion_queda_sin_vincular():
    """Es una operacion improvisada, y el esquema ya sabe representarla."""
    assert vinculacion.elegir_setup(_trade(), []) is None


def test_un_setup_sin_precio_anotado_no_se_vincula():
    assert vinculacion.elegir_setup(_trade(), [_setup("s1", precio=None)]) is None


def test_una_operacion_sin_hora_de_apertura_no_se_vincula():
    assert vinculacion.elegir_setup(_trade(opened_at=None), [_setup("s1")]) is None


def test_la_ventana_es_ajustable():
    lejano = _setup("s1", horas_antes=60)
    assert vinculacion.elegir_setup(_trade(), [lejano]) is None
    assert vinculacion.elegir_setup(_trade(), [lejano], ventana_horas=72)["id"] == "s1"


def test_el_caso_completo_de_punta_a_punta():
    """Una fila cruda de Bybit, traducida, encuentra su setup."""
    trade = bybit.a_trade(FILA_BYBIT)
    apertura = trade["opened_at"]

    candidatos = [
        {  # otro par: no
            "id": "eth",
            "symbol": "ETHUSDT",
            "price_at_evaluation": Decimal("64000.50"),
            "evaluated_at": apertura - timedelta(hours=1),
        },
        {  # precio lejano: no
            "id": "caro",
            "symbol": "BTC",
            "price_at_evaluation": Decimal("70000"),
            "evaluated_at": apertura - timedelta(hours=1),
        },
        {  # este sí
            "id": "bueno",
            "symbol": "BTC",
            "price_at_evaluation": Decimal("64010"),
            "evaluated_at": apertura - timedelta(hours=5),
        },
    ]

    assert vinculacion.elegir_setup(trade, candidatos)["id"] == "bueno"
