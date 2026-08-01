"""Persistencia de operaciones importadas y de la marca de sincronización.

La deduplicación no se decide aquí: se delega en el `UNIQUE` de
`trades.bybit_order_id` mediante `on conflict do nothing`. Comprobar antes con
un SELECT y luego insertar dejaría una ventana entre las dos consultas; el
índice único no la tiene. Es el mismo criterio que el resto del proyecto —las
reglas que la base de datos puede hacer cumplir, las hace cumplir ella.
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from psycopg import Connection

# ---------------------------------------------------------------------------
#  Marca de sincronización
# ---------------------------------------------------------------------------


def get_last_synced_at(conn: Connection, source: str = "bybit") -> datetime | None:
    with conn.cursor() as cur:
        cur.execute("select last_synced_at from sync_state where source = %s", [source])
        fila = cur.fetchone()
        return fila["last_synced_at"] if fila else None


def set_last_synced_at(
    conn: Connection, momento: datetime, source: str = "bybit"
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into sync_state (source, last_synced_at)
            values (%s, %s)
            on conflict (source) do update set last_synced_at = excluded.last_synced_at
            """,
            [source, momento],
        )


# ---------------------------------------------------------------------------
#  Candidatos a vincular
# ---------------------------------------------------------------------------

#: Setups que todavía no tienen operación vinculada, dentro de una ventana
#: temporal. El filtro de símbolo y el de precio se aplican en Python
#: (`adapters/vinculacion.py`) porque la normalización de símbolo —"BTC" tiene
#: que emparejar con "BTCUSDT"— no es una comparación que SQL haga bien, y
#: tenerla en un solo sitio y probada a mano vale más que ahorrarse unas filas.
_SQL_CANDIDATOS = """
    select s.id, s.symbol, s.evaluated_at, s.price_at_evaluation, s.decision
    from setups s
    left join trades t on t.setup_id = s.id
    where t.id is null
      and s.evaluated_at <= %(abierta_en)s
      and s.evaluated_at >= %(desde)s
    order by s.evaluated_at desc
"""


def candidatos_para(
    conn: Connection, abierta_en: datetime, desde: datetime
) -> list[dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(_SQL_CANDIDATOS, {"abierta_en": abierta_en, "desde": desde})
        return cur.fetchall()


# ---------------------------------------------------------------------------
#  Inserción
# ---------------------------------------------------------------------------

_SQL_INSERT_TRADE = """
    insert into trades (
        bybit_order_id, bybit_exec_id, symbol, side,
        entry_price, exit_price, quantity, leverage,
        opened_at, closed_at, pnl_net,
        setup_id, source, synced_at
    )
    values (
        %(bybit_order_id)s, %(bybit_exec_id)s, %(symbol)s, %(side)s,
        %(entry_price)s, %(exit_price)s, %(quantity)s, %(leverage)s,
        %(opened_at)s, %(closed_at)s, %(pnl_net)s,
        %(setup_id)s, 'bybit', now()
    )
    on conflict (bybit_order_id) do nothing
    returning id, setup_id
"""


def insert_trade(
    conn: Connection, trade: dict[str, Any], setup_id: UUID | None
) -> dict[str, Any] | None:
    """Inserta si no existía ya. Devuelve None si era un duplicado.

    Cada operación va en su propia transacción (`with conn.transaction()`) a
    propósito: una fila que la base de datos rechace —un símbolo raro, un lado
    que no encaje en el CHECK— no puede tumbar la importación entera y
    obligar a resincronizar desde cero. La que falle, falla sola.
    """
    with conn.transaction():
        with conn.cursor() as cur:
            cur.execute(_SQL_INSERT_TRADE, {**trade, "setup_id": setup_id})
            return cur.fetchone()


# ---------------------------------------------------------------------------
#  Corrección manual del vínculo
# ---------------------------------------------------------------------------


def relink_trade(
    conn: Connection, trade_id: UUID, setup_id: UUID | None
) -> dict[str, Any] | None:
    """Cambia (o quita, con `None`) el setup vinculado. None si no existe el trade."""
    with conn.transaction():
        with conn.cursor() as cur:
            cur.execute(
                """
                update trades set setup_id = %s
                where id = %s
                returning id, setup_id, symbol, side, bybit_order_id,
                          opened_at, closed_at, pnl_net, source
                """,
                [str(setup_id) if setup_id else None, str(trade_id)],
            )
            return cur.fetchone()


# ---------------------------------------------------------------------------
#  Consulta
# ---------------------------------------------------------------------------

#: El setup vinculado viaja embebido en la misma consulta. Sin esto la pantalla
#: tendría que pedir cada setup por separado —doscientas peticiones para pintar
#: una lista— o enseñar un identificador que no le dice nada al trader.
_SQL_LISTA_TRADES = """
    select t.id, t.setup_id, t.symbol, t.side, t.bybit_order_id,
           t.opened_at, t.closed_at, t.pnl_net, t.source,
           t.entry_price, t.exit_price, t.quantity,
           s.symbol       as setup_symbol,
           s.evaluated_at as setup_evaluated_at,
           s.decision     as setup_decision,
           s.raw_balance  as setup_raw_balance
    from trades t
    left join setups s on s.id = t.setup_id
"""


def list_trades(
    conn: Connection,
    *,
    source: str | None = None,
    vinculadas: bool | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict[str, Any]], int]:
    """Página de operaciones y el total que cumple los filtros.

    Se ordenan por apertura descendente —lo más reciente arriba, como el
    histórico de setups— y las que no tienen fecha de apertura van al final en
    vez de desaparecer.
    """
    condiciones: list[str] = []
    params: dict[str, Any] = {}

    if source:
        condiciones.append("t.source = %(source)s")
        params["source"] = source
    if vinculadas is True:
        condiciones.append("t.setup_id is not null")
    elif vinculadas is False:
        condiciones.append("t.setup_id is null")

    where = (" where " + " and ".join(condiciones)) if condiciones else ""

    with conn.cursor() as cur:
        cur.execute(f"select count(*) as total from trades t{where}", params)
        total = cur.fetchone()["total"]

        cur.execute(
            f"{_SQL_LISTA_TRADES}{where} "
            "order by t.opened_at desc nulls last, t.id desc "
            "limit %(limit)s offset %(offset)s",
            {**params, "limit": limit, "offset": offset},
        )
        return cur.fetchall(), total


def get_trade(conn: Connection, trade_id: UUID) -> dict[str, Any] | None:
    with conn.cursor() as cur:
        cur.execute(
            """
            select id, setup_id, symbol, side, bybit_order_id,
                   opened_at, closed_at, pnl_net, source
            from trades where id = %s
            """,
            [str(trade_id)],
        )
        return cur.fetchone()
