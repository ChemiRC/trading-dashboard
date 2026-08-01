"""Tests de la importación de operaciones, contra la base de datos real.

La red **no** se toca: llamar a Bybit desde la suite la haría lenta, no
determinista y dependiente de una cuenta ajena. Lo que se prueba aquí es todo
lo demás —deduplicación, vinculación con setups reales, corrección manual y
las puertas del endpoint— insertando por el repositorio, que es exactamente lo
que hace la ruta después de traducir la respuesta del exchange.

La traducción y la firma se prueban en `test_bybit.py`, sin base de datos.
"""

import os
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

pytest.importorskip("fastapi", reason="requirements.txt no instalado")

from app.adapters import vinculacion  # noqa: E402
from app.db import trades_repo  # noqa: E402

SYMBOL = "ZZTEST"

pytestmark = pytest.mark.skipif(
    not os.environ.get("DATABASE_URL")
    and not os.path.exists(os.path.join(os.path.dirname(__file__), "..", ".env")),
    reason="Sin DATABASE_URL ni backend/.env: no hay base de datos contra la que probar.",
)


def _trade(order_id: str, *, abierta_en: datetime, precio="64000", symbol=SYMBOL):
    """Una operación ya traducida, como la deja `bybit.a_trade()`."""
    return {
        "bybit_order_id": order_id,
        "bybit_exec_id": "Trade",
        "symbol": symbol,
        "side": "LONG",
        "entry_price": Decimal(precio),
        "exit_price": Decimal("65000"),
        "quantity": Decimal("0.1"),
        "leverage": Decimal("10"),
        "opened_at": abierta_en,
        "closed_at": abierta_en + timedelta(hours=6),
        "pnl_net": Decimal("100"),
        "source": "bybit",
    }


def _guarda_setup(client, todo_alcista, *, precio: str) -> dict:
    r = client.post(
        "/api/setups",
        json={
            "selections": todo_alcista,
            "symbol": SYMBOL,
            "timeframe": "4H",
            "price_at_evaluation": precio,
        },
    )
    assert r.status_code == 201
    return r.json()


# ---------------------------------------------------------------------------
#  Puertas del endpoint
# ---------------------------------------------------------------------------


def test_sync_exige_token(anon_client):
    assert anon_client.post("/api/trades/sync").status_code == 401


def test_relink_exige_token(anon_client):
    r = anon_client.patch(f"/api/trades/{uuid.uuid4()}/setup", json={"setup_id": None})
    assert r.status_code == 401


def test_sin_credenciales_de_bybit_el_sync_responde_503(client, monkeypatch):
    """Falla cerrado, igual que la autenticacion: nunca a medias.

    Las credenciales se vacian a proposito en vez de dar por hecho que no las
    hay. La primera version de este test las asumia ausentes y el dia que se
    configuraron de verdad dejo de comprobar el 503 para lanzar una
    sincronizacion real contra la cuenta del trader. Un test que solo prueba
    lo que dice cuando el entorno esta a medio configurar no prueba nada.
    """
    from app.core import get_settings

    monkeypatch.setenv("BYBIT_API_KEY", "")
    monkeypatch.setenv("BYBIT_API_SECRET", "")
    get_settings.cache_clear()
    try:
        r = client.post("/api/trades/sync")
        assert r.status_code == 503
        assert "BYBIT_API_KEY" in r.json()["error"]["message"]
    finally:
        # La cache se vacia tambien al salir: si no, el resto de la suite se
        # quedaria con las credenciales en blanco de este test.
        get_settings.cache_clear()


# ---------------------------------------------------------------------------
#  Deduplicación
# ---------------------------------------------------------------------------


def test_la_misma_operacion_no_se_inserta_dos_veces(db):
    order_id = f"zztest-dup-{uuid.uuid4()}"
    trade = _trade(order_id, abierta_en=datetime.now(UTC))

    primera = trades_repo.insert_trade(db, trade, None)
    segunda = trades_repo.insert_trade(db, trade, None)

    assert primera is not None
    assert segunda is None, "El UNIQUE de bybit_order_id deberia haberla descartado"

    fila = db.execute(
        "select count(*) as n from trades where bybit_order_id = %s", [order_id]
    ).fetchone()
    assert fila["n"] == 1


def test_dos_operaciones_distintas_si_entran_las_dos(db):
    ahora = datetime.now(UTC)
    a = trades_repo.insert_trade(db, _trade(f"zztest-a-{uuid.uuid4()}", abierta_en=ahora), None)
    b = trades_repo.insert_trade(db, _trade(f"zztest-b-{uuid.uuid4()}", abierta_en=ahora), None)
    assert a is not None and b is not None
    assert a["id"] != b["id"]


# ---------------------------------------------------------------------------
#  Vinculación contra setups reales
# ---------------------------------------------------------------------------


def test_vincula_la_operacion_con_el_setup_que_la_anticipo(client, todo_alcista, db):
    setup = _guarda_setup(client, todo_alcista, precio="64000")

    # Abierta una hora después de evaluar, al mismo precio.
    abierta_en = datetime.now(UTC) + timedelta(hours=1)
    trade = _trade(f"zztest-link-{uuid.uuid4()}", abierta_en=abierta_en)

    candidatos = trades_repo.candidatos_para(
        db,
        abierta_en=abierta_en,
        desde=abierta_en - timedelta(hours=vinculacion.VENTANA_HORAS),
    )
    elegido = vinculacion.elegir_setup(trade, candidatos)

    assert elegido is not None
    assert str(elegido["id"]) == setup["id"]

    guardada = trades_repo.insert_trade(db, trade, elegido["id"])
    assert str(guardada["setup_id"]) == setup["id"]


def test_una_operacion_sin_setup_que_la_explique_queda_sin_vincular(client, todo_alcista, db):
    """Operacion improvisada: el esquema ya sabe representarla con setup_id NULL."""
    _guarda_setup(client, todo_alcista, precio="64000")

    abierta_en = datetime.now(UTC) + timedelta(hours=1)
    # Mismo símbolo y hora, pero a un precio que no encaja con ningún setup.
    trade = _trade(f"zztest-nolink-{uuid.uuid4()}", abierta_en=abierta_en, precio="99000")

    candidatos = trades_repo.candidatos_para(
        db,
        abierta_en=abierta_en,
        desde=abierta_en - timedelta(hours=vinculacion.VENTANA_HORAS),
    )
    assert vinculacion.elegir_setup(trade, candidatos) is None

    guardada = trades_repo.insert_trade(db, trade, None)
    assert guardada["setup_id"] is None


def test_un_setup_que_ya_tiene_operacion_deja_de_ser_candidato(client, todo_alcista, db):
    """`trades.setup_id` es UNIQUE: reutilizarlo reventaria el INSERT."""
    setup = _guarda_setup(client, todo_alcista, precio="64000")
    abierta_en = datetime.now(UTC) + timedelta(hours=1)

    trades_repo.insert_trade(
        db, _trade(f"zztest-ocupa-{uuid.uuid4()}", abierta_en=abierta_en), uuid.UUID(setup["id"])
    )

    candidatos = trades_repo.candidatos_para(
        db,
        abierta_en=abierta_en,
        desde=abierta_en - timedelta(hours=vinculacion.VENTANA_HORAS),
    )
    assert all(str(c["id"]) != setup["id"] for c in candidatos)


# ---------------------------------------------------------------------------
#  Corrección manual del vínculo
# ---------------------------------------------------------------------------


def test_se_puede_corregir_el_setup_vinculado(client, todo_alcista, db):
    bueno = _guarda_setup(client, todo_alcista, precio="64000")
    equivocado = _guarda_setup(client, todo_alcista, precio="64100")

    trade = trades_repo.insert_trade(
        db,
        _trade(f"zztest-fix-{uuid.uuid4()}", abierta_en=datetime.now(UTC)),
        uuid.UUID(equivocado["id"]),
    )

    r = client.patch(f"/api/trades/{trade['id']}/setup", json={"setup_id": bueno["id"]})
    assert r.status_code == 200
    assert r.json()["setup_id"] == bueno["id"]


def test_se_puede_desvincular_del_todo(client, todo_alcista, db):
    setup = _guarda_setup(client, todo_alcista, precio="64000")
    trade = trades_repo.insert_trade(
        db,
        _trade(f"zztest-unlink-{uuid.uuid4()}", abierta_en=datetime.now(UTC)),
        uuid.UUID(setup["id"]),
    )

    r = client.patch(f"/api/trades/{trade['id']}/setup", json={"setup_id": None})
    assert r.status_code == 200
    assert r.json()["setup_id"] is None


def test_corregir_una_operacion_inexistente_es_404(client):
    r = client.patch(f"/api/trades/{uuid.uuid4()}/setup", json={"setup_id": None})
    assert r.status_code == 404


def test_el_cuerpo_vacio_no_significa_desvincular(client):
    """`setup_id` es obligatorio en el contrato: mandar {} es un 422, no un
    borrado accidental del vinculo."""
    r = client.patch(f"/api/trades/{uuid.uuid4()}/setup", json={})
    assert r.status_code == 422


# ---------------------------------------------------------------------------
#  Notas de journal
#
#  Se guardan en `trades.comments`, que existia desde 001 y estaba sin usar
#  (ver la migracion 006). Lo que se prueba aqui es el contrato de la API, no
#  la columna: si algun dia se mueve de sitio, estos tests siguen valiendo.
# ---------------------------------------------------------------------------


def test_las_notas_de_journal_exigen_token(anon_client):
    r = anon_client.patch(
        f"/api/trades/{uuid.uuid4()}/notes", json={"journal_notes": "x"}
    )
    assert r.status_code == 401


def test_se_guardan_y_se_releen_las_notas_de_una_operacion(client, db):
    trade = trades_repo.insert_trade(
        db, _trade(f"zztest-notas-{uuid.uuid4()}", abierta_en=datetime.now(UTC)), None
    )

    texto = "Entre por el barrido de liquidez. Sali antes de tiempo."
    r = client.patch(f"/api/trades/{trade['id']}/notes", json={"journal_notes": texto})
    assert r.status_code == 200
    assert r.json()["journal_notes"] == texto

    # Y se releen desde el listado, no solo desde la respuesta del PATCH.
    listado = client.get("/api/trades?limit=200").json()["items"]
    guardada = next(t for t in listado if t["id"] == str(trade["id"]))
    assert guardada["journal_notes"] == texto


def test_las_notas_se_pueden_vaciar(client, db):
    trade = trades_repo.insert_trade(
        db, _trade(f"zztest-vaciar-{uuid.uuid4()}", abierta_en=datetime.now(UTC)), None
    )
    client.patch(f"/api/trades/{trade['id']}/notes", json={"journal_notes": "algo"})

    r = client.patch(f"/api/trades/{trade['id']}/notes", json={"journal_notes": None})
    assert r.status_code == 200
    assert r.json()["journal_notes"] is None


def test_unas_notas_en_blanco_se_guardan_como_null(client, db):
    """"Sin notas" y "notas con espacios" son lo mismo: si no, cada lector
    tendria que comprobar las dos cosas."""
    trade = trades_repo.insert_trade(
        db, _trade(f"zztest-blanco-{uuid.uuid4()}", abierta_en=datetime.now(UTC)), None
    )

    r = client.patch(f"/api/trades/{trade['id']}/notes", json={"journal_notes": "   "})
    assert r.status_code == 200
    assert r.json()["journal_notes"] is None


def test_el_cuerpo_vacio_no_borra_las_notas(client, db):
    """Mismo criterio que el vinculo: {} es 422, no un borrado accidental."""
    trade = trades_repo.insert_trade(
        db, _trade(f"zztest-vacio-{uuid.uuid4()}", abierta_en=datetime.now(UTC)), None
    )
    client.patch(f"/api/trades/{trade['id']}/notes", json={"journal_notes": "importante"})

    r = client.patch(f"/api/trades/{trade['id']}/notes", json={})
    assert r.status_code == 422

    listado = client.get("/api/trades?limit=200").json()["items"]
    guardada = next(t for t in listado if t["id"] == str(trade["id"]))
    assert guardada["journal_notes"] == "importante"


def test_notas_en_una_operacion_inexistente_es_404(client):
    r = client.patch(f"/api/trades/{uuid.uuid4()}/notes", json={"journal_notes": "x"})
    assert r.status_code == 404


def test_las_notas_no_tocan_el_vinculo_ni_el_pnl(client, todo_alcista, db):
    """El journal es del trader; los numeros son del exchange. Editar uno no
    puede mover el otro."""
    setup = _guarda_setup(client, todo_alcista, precio="64000")
    trade = trades_repo.insert_trade(
        db,
        _trade(f"zztest-aparte-{uuid.uuid4()}", abierta_en=datetime.now(UTC)),
        uuid.UUID(setup["id"]),
    )

    r = client.patch(f"/api/trades/{trade['id']}/notes", json={"journal_notes": "nota"})
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["setup_id"] == setup["id"]
    assert cuerpo["pnl_net"] is not None


def test_el_detalle_del_setup_trae_la_operacion_vinculada(client, todo_alcista, db):
    """El puente Historico -> Operaciones: desde un setup se ve con que
    operacion acabo, sin cambiar de pantalla."""
    setup = _guarda_setup(client, todo_alcista, precio="64000")
    trades_repo.insert_trade(
        db,
        _trade(f"zztest-puente-{uuid.uuid4()}", abierta_en=datetime.now(UTC)),
        uuid.UUID(setup["id"]),
    )

    detalle = client.get(f"/api/setups/{setup['id']}").json()
    assert detalle["trade_symbol"] == SYMBOL
    assert detalle["trade_side"] in ("LONG", "SHORT")
    assert detalle["trade_opened_at"] is not None
    assert detalle["trade_entry_price"] is not None


def test_un_setup_sin_operacion_trae_los_campos_del_puente_a_null(client, todo_alcista):
    setup = _guarda_setup(client, todo_alcista, precio="64000")
    detalle = client.get(f"/api/setups/{setup['id']}").json()
    assert detalle["trade_symbol"] is None
    assert detalle["trade_opened_at"] is None
    assert detalle["trade_journal_notes"] is None


def test_no_se_pueden_colgar_dos_operaciones_del_mismo_setup(client, todo_alcista, db):
    setup = _guarda_setup(client, todo_alcista, precio="64000")
    ahora = datetime.now(UTC)

    trades_repo.insert_trade(
        db, _trade(f"zztest-u1-{uuid.uuid4()}", abierta_en=ahora), uuid.UUID(setup["id"])
    )
    otra = trades_repo.insert_trade(db, _trade(f"zztest-u2-{uuid.uuid4()}", abierta_en=ahora), None)

    r = client.patch(f"/api/trades/{otra['id']}/setup", json={"setup_id": setup["id"]})
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "DB_CONSTRAINT"


# ---------------------------------------------------------------------------
#  Listado
# ---------------------------------------------------------------------------


def test_listar_exige_token(anon_client):
    assert anon_client.get("/api/trades").status_code == 401


def test_el_listado_trae_el_setup_vinculado_embebido(client, todo_alcista, db):
    """Sin esto la pantalla pediria cada setup por separado para pintar la lista."""
    setup = _guarda_setup(client, todo_alcista, precio="64000")
    trade = trades_repo.insert_trade(
        db,
        _trade(f"zztest-emb-{uuid.uuid4()}", abierta_en=datetime.now(UTC)),
        uuid.UUID(setup["id"]),
    )
    db.commit()

    pagina = client.get("/api/trades", params={"limit": 200}).json()
    fila = next(t for t in pagina["items"] if t["id"] == str(trade["id"]))

    assert fila["setup_id"] == setup["id"]
    assert fila["setup_symbol"] == SYMBOL
    assert fila["setup_decision"] == "LONG"
    assert fila["setup_evaluated_at"] is not None


def test_una_operacion_sin_vinculo_trae_los_campos_de_setup_a_null(client, db):
    """Es el estado normal de lo importado antes de empezar a evaluar aqui."""
    trade = trades_repo.insert_trade(
        db, _trade(f"zztest-null-{uuid.uuid4()}", abierta_en=datetime.now(UTC)), None
    )
    db.commit()

    pagina = client.get("/api/trades", params={"limit": 200}).json()
    fila = next(t for t in pagina["items"] if t["id"] == str(trade["id"]))

    assert fila["setup_id"] is None
    assert fila["setup_symbol"] is None
    assert fila["setup_decision"] is None


def test_filtro_por_origen(client, db):
    trades_repo.insert_trade(
        db, _trade(f"zztest-src-{uuid.uuid4()}", abierta_en=datetime.now(UTC)), None
    )
    db.commit()

    solo_bybit = client.get("/api/trades", params={"source": "bybit", "limit": 200}).json()
    assert all(t["source"] == "bybit" for t in solo_bybit["items"])

    solo_manual = client.get("/api/trades", params={"source": "manual", "limit": 200}).json()
    assert all(t["source"] == "manual" for t in solo_manual["items"])


def test_filtro_por_vinculadas(client, todo_alcista, db):
    setup = _guarda_setup(client, todo_alcista, precio="64000")
    trades_repo.insert_trade(
        db,
        _trade(f"zztest-fv1-{uuid.uuid4()}", abierta_en=datetime.now(UTC)),
        uuid.UUID(setup["id"]),
    )
    trades_repo.insert_trade(
        db, _trade(f"zztest-fv2-{uuid.uuid4()}", abierta_en=datetime.now(UTC)), None
    )
    db.commit()

    con = client.get("/api/trades", params={"vinculadas": "true", "limit": 200}).json()
    assert con["total"] >= 1
    assert all(t["setup_id"] is not None for t in con["items"])

    sin = client.get("/api/trades", params={"vinculadas": "false", "limit": 200}).json()
    assert sin["total"] >= 1
    assert all(t["setup_id"] is None for t in sin["items"])


def test_el_listado_ordena_por_apertura_descendente(client, db):
    ahora = datetime.now(UTC)
    trades_repo.insert_trade(
        db, _trade(f"zztest-ord1-{uuid.uuid4()}", abierta_en=ahora - timedelta(days=2)), None
    )
    trades_repo.insert_trade(
        db, _trade(f"zztest-ord2-{uuid.uuid4()}", abierta_en=ahora), None
    )
    db.commit()

    items = client.get("/api/trades", params={"limit": 200}).json()["items"]
    fechas = [t["opened_at"] for t in items if t["opened_at"]]
    assert fechas == sorted(fechas, reverse=True)


# ---------------------------------------------------------------------------
#  Marca de sincronización
# ---------------------------------------------------------------------------


def test_la_marca_de_sincronizacion_se_guarda_y_se_relee(db):
    momento = datetime.now(UTC).replace(microsecond=0)
    trades_repo.set_last_synced_at(db, momento)
    db.commit()

    assert trades_repo.get_last_synced_at(db) == momento


def test_la_marca_se_sobrescribe_en_vez_de_duplicarse(db):
    primero = datetime.now(UTC).replace(microsecond=0)
    segundo = primero + timedelta(hours=1)

    trades_repo.set_last_synced_at(db, primero)
    trades_repo.set_last_synced_at(db, segundo)
    db.commit()

    assert trades_repo.get_last_synced_at(db) == segundo
    fila = db.execute("select count(*) as n from sync_state").fetchone()
    assert fila["n"] == 1
