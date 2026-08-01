"""Fixtures compartidas.

La primera mitad es la configuración de prueba del motor: **espejo exacto** de
backend/sql/002_seed.sql. Si cambian los pesos o el catálogo en el seed, hay que
cambiarlos aquí. Es duplicación deliberada: los tests tienen que fallar cuando
alguien toque el catálogo sin darse cuenta de lo que arrastra. Un test que lee la
configuración de la misma fuente que el código no comprueba nada.

La segunda mitad son las fixtures de los tests de API, que sí hablan con la base
de datos real. FastAPI y psycopg se importan **dentro** de las funciones: así los
tests del motor siguen corriendo con `pip install pytest` y nada más, que es lo
que dice `requirements-dev.txt`.
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


# ===========================================================================
#  Fixtures de los tests de API  (test_api.py)
# ===========================================================================

#: Símbolo reservado para las pruebas. Todo lo que se escriba con él se borra
#: al terminar la sesión.
SYMBOL_PRUEBAS = "ZZTEST"


#: Credenciales de la suite. Se inyectan por entorno —que en pydantic-settings
#: gana al `.env`— para no depender de lo que cada quien tenga configurado en
#: local ni de que en CI exista un `.env` en absoluto.
PASSWORD_PRUEBAS = "zztest-password"
SECRETO_PRUEBAS = "zztest-secreto-de-firma-solo-para-la-suite"


@pytest.fixture(scope="session")
def auth_env():
    """Configura la autenticación de la suite y limpia la caché de settings.

    `get_settings` está cacheada con `lru_cache`: sin vaciarla, la app leería
    la configuración que se hubiera resuelto antes de tocar el entorno.
    """
    import os

    from app.core import get_settings

    previos = {
        "APP_PASSWORD": os.environ.get("APP_PASSWORD"),
        "APP_TOKEN_SECRET": os.environ.get("APP_TOKEN_SECRET"),
    }
    os.environ["APP_PASSWORD"] = PASSWORD_PRUEBAS
    os.environ["APP_TOKEN_SECRET"] = SECRETO_PRUEBAS
    get_settings.cache_clear()

    yield

    for clave, valor in previos.items():
        if valor is None:
            os.environ.pop(clave, None)
        else:
            os.environ[clave] = valor
    get_settings.cache_clear()


@pytest.fixture(scope="session")
def anon_client(auth_env):
    """Cliente **sin** token, para comprobar que lo protegido está protegido."""
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def client(anon_client):
    """Cliente HTTP autenticado, con el lifespan de la app activo.

    De sesión: abrir y cerrar el pool contra Supabase en cada test multiplicaría
    por cien el tiempo de la suite sin comprobar nada más.

    El token se obtiene del endpoint real de login, no fabricándolo a mano: así
    la suite entera depende de que el login funcione de verdad, y las decenas
    de tests que ya existían siguen escritos igual —la cabecera va por defecto
    en el cliente, no en cada llamada—.
    """
    from fastapi.testclient import TestClient

    from app.main import app

    r = anon_client.post("/auth/login", json={"password": PASSWORD_PRUEBAS})
    assert r.status_code == 200, f"El login de la suite fallo: {r.text}"
    token = r.json()["token"]

    with TestClient(app, headers={"Authorization": f"Bearer {token}"}) as c:
        yield c


@pytest.fixture
def db():
    """Conexión directa a la base de datos real, para probar los repositorios.

    Los tests de importación de Bybit necesitan escribir operaciones sin pasar
    por el exchange —la alternativa sería llamar a la API de verdad desde la
    suite, que la haría lenta, no determinista y dependiente de una cuenta
    ajena—. La red se prueba aparte, en `test_bybit.py`, sin tocarla.
    """
    import psycopg
    from psycopg.rows import dict_row

    from app.core import get_settings

    with psycopg.connect(
        get_settings().database_url, sslmode="require", row_factory=dict_row
    ) as conn:
        yield conn


@pytest.fixture(scope="session", autouse=True)
def limpia_setups_de_prueba():
    """Borra los setups y trades del símbolo de pruebas al acabar.

    Se ejecuta también antes, por si una ejecución anterior murió a mitad. El
    borrado de setups arrastra `setup_selections` por el ON DELETE CASCADE,
    pero NO las trades: ese FK es ON DELETE SET NULL (una operación real
    sobrevive a su setup), así que las trades de prueba se borran aparte y
    primero. Nada más se toca: el filtro es siempre el símbolo reservado.
    """
    def borra() -> int:
        try:
            import psycopg

            from app.core import get_settings
        except ImportError:
            return 0
        with psycopg.connect(get_settings().database_url, sslmode="require") as conn:
            n = conn.execute(
                "delete from trades where symbol = %s", [SYMBOL_PRUEBAS]
            ).rowcount
            n += conn.execute(
                "delete from setups where symbol = %s", [SYMBOL_PRUEBAS]
            ).rowcount
            conn.commit()
        return n

    borra()
    yield
    borra()


@pytest.fixture(scope="session", autouse=True)
def preserva_marca_de_sincronizacion():
    """Deja `sync_state` como estaba antes de la suite.

    Los tests de la marca de agua escriben en la fila real de `bybit` —el
    CHECK de la tabla no admite un `source` de pruebas— así que sin esto una
    ejecución de la suite dejaría al trader con una marca falsa y su siguiente
    sincronización miraría 24 horas atrás en vez de los 90 días de la primera.
    No rompería nada (la deduplicación aguanta), pero le escondería historial.
    """
    try:
        import psycopg

        from app.core import get_settings
    except ImportError:
        yield
        return

    url = get_settings().database_url
    with psycopg.connect(url, sslmode="require") as conn:
        fila = conn.execute(
            "select last_synced_at from sync_state where source = 'bybit'"
        ).fetchone()
        original = fila[0] if fila else None

    yield

    with psycopg.connect(url, sslmode="require") as conn:
        if original is None:
            conn.execute("delete from sync_state where source = 'bybit'")
        else:
            conn.execute(
                """
                insert into sync_state (source, last_synced_at) values ('bybit', %s)
                on conflict (source) do update set last_synced_at = excluded.last_synced_at
                """,
                [original],
            )
        conn.commit()


@pytest.fixture(scope="session")
def catalogo(client):
    return client.get("/api/config/catalog").json()


@pytest.fixture
def todo_alcista() -> dict[str, str]:
    """Selección que da exactamente +100: el máximo teórico."""
    return {
        "rsi_divergence": "regular_bullish",   # +30
        "weekly_trend": "bullish",             # +20
        "support_resistance": "near_support",  # +15
        "liquidity": "lower_swept",            # +15
        "chart_pattern": "bullish",            # +10
        "kiyotaka_barrier": "buy_wall",        # +10
    }


@pytest.fixture
def todo_bajista() -> dict[str, str]:
    """El espejo exacto: -100."""
    return {
        "rsi_divergence": "regular_bearish",
        "weekly_trend": "bearish",
        "support_resistance": "near_resistance",
        "liquidity": "upper_swept",
        "chart_pattern": "bearish",
        "kiyotaka_barrier": "sell_wall",
    }
