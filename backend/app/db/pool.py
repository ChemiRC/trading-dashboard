"""Pool de conexiones a PostgreSQL.

Un único pool por proceso, abierto en el arranque y cerrado al parar. Abrir una
conexión por petición contra un Supabase que está al otro lado de Internet
añadiría el TLS handshake a cada request.

**El pool es síncrono y las rutas se declaran con `def`, no con `async def`.**
Es deliberado. psycopg en modo asíncrono necesita `add_reader` sobre sockets, y
el `ProactorEventLoop` con el que Windows arranca asyncio no lo implementa: en
local el pool no llega a abrir ni una conexión. Se puede forzar
`WindowsSelectorEventLoopPolicy`, pero hay que hacerlo antes de que uvicorn cree
el bucle —es decir, fuera de este código— y quien arranque con el `uvicorn
app.main:app` que documenta el README se encontraría el servidor colgado sin
pista de por qué.

Con rutas `def`, FastAPI las ejecuta en su threadpool y el driver bloqueante es
exactamente lo que corresponde. La concurrencia sigue siendo real, y para un
dashboard de un solo usuario cuyo cuello de botella es la latencia hasta
ca-central-1 la diferencia frente a async es inmedible. A cambio, funciona igual
en Windows, en Linux y bajo pytest.
"""

from collections.abc import Iterator
from contextlib import contextmanager

from psycopg import Connection
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app.core import Settings

_pool: ConnectionPool | None = None


def create_pool(settings: Settings) -> ConnectionPool:
    return ConnectionPool(
        conninfo=settings.database_url,
        min_size=settings.db_pool_min_size,
        max_size=settings.db_pool_max_size,
        open=False,
        kwargs={
            "row_factory": dict_row,
            "autocommit": True,
            # Supabase obliga a TLS; explícito para no depender del default de
            # libpq (`prefer`, que aceptaría texto plano si el servidor lo
            # ofreciera).
            "sslmode": "require",
            # PgBouncer en modo transaction (puerto 6543) no mantiene el estado
            # de sesión, así que las sentencias preparadas del lado del servidor
            # se rompen entre peticiones. Desactivarlas hace que la misma
            # configuración sirva para el session pooler y para el transaction
            # pooler, que es justo el cambio de puerto que separa desarrollo de
            # producción.
            "prepare_threshold": None,
        },
        # Una conexión parada mucho rato puede haber sido cortada por el pooler;
        # se comprueba antes de entregarla en vez de descubrirlo con un 500 a
        # mitad de petición.
        check=ConnectionPool.check_connection,
        timeout=15,
    )


def open_pool(settings: Settings) -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = create_pool(settings)
        # Se espera a que haya conexión: si las credenciales están mal,
        # preferimos enterarnos al arrancar y no en la primera petición.
        _pool.open(wait=True, timeout=30)
    return _pool


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


def get_pool() -> ConnectionPool:
    if _pool is None:
        raise RuntimeError("El pool no esta abierto; falta el lifespan de la app.")
    return _pool


@contextmanager
def connection() -> Iterator[Connection]:
    """Una conexión del pool, en autocommit.

    Quien necesite atomicidad abre una transacción explícita con
    `with conn.transaction():`. Ver `setups_repo.save_setup`.
    """
    with get_pool().connection() as conn:
        yield conn
