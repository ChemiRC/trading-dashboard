"""Persistencia y consulta de setups evaluados.

Guardar un setup es copiar la salida del motor, campo por campo, a la tabla
`setups`. Los nombres coinciden a propósito (ver `app/scoring/result.py`): no
hay capa de traducción donde se pueda colar un desfase entre lo que decidió el
motor y lo que quedó escrito.
"""

from typing import Any
from uuid import UUID

from psycopg import Connection

from app.scoring import EngineConfig, Evaluation

_SQL_INSERT_SETUP = """
    insert into setups (
        symbol, timeframe, price_at_evaluation,
        raw_balance, direction, decision, no_trade_reason,
        classification_id, classification_code, classification_label,
        notes
    )
    values (
        %(symbol)s, %(timeframe)s, %(price_at_evaluation)s,
        %(raw_balance)s, %(direction)s, %(decision)s, %(no_trade_reason)s,
        (select id from classification_thresholds where code = %(classification_code)s),
        %(classification_code)s, %(classification_label)s,
        %(notes)s
    )
    returning id, evaluated_at
"""

_SQL_INSERT_SELECTION = """
    insert into setup_selections (
        setup_id, indicator_id, option_id, points_applied, option_label
    )
    values (%s, %s, %s, %s, %s)
"""


def save_setup(
    conn: Connection,
    *,
    evaluation: Evaluation,
    config: EngineConfig,
    symbol: str,
    timeframe: str | None = None,
    price_at_evaluation: Any = None,
    notes: str | None = None,
) -> dict[str, Any]:
    """Guarda el setup y sus selecciones en una sola transacción.

    O queda el veredicto con su desglose completo, o no queda nada. Un setup sin
    selecciones no se podría auditar después, que es justo para lo que existe.
    """
    # Las contribuciones traen el `code` de la opción, no su id: el motor no
    # conoce claves primarias. Se resuelven contra la misma configuración con la
    # que se evaluó, no releyendo la base de datos, para que un UPDATE
    # concurrente no pueda hacer que se guarde un id distinto del que se usó.
    ids: dict[str, tuple[int, int]] = {
        f"{indicador.code}/{opcion.code}": (indicador.id, opcion.id)
        for indicador in config.indicators
        for opcion in indicador.options
        if indicador.id is not None and opcion.id is not None
    }

    filas = []
    for c in evaluation.contributions:
        clave = f"{c.indicator_code}/{c.option_code}"
        if clave not in ids:
            raise KeyError(f"La opcion '{clave}' no tiene id en la configuracion cargada.")
        indicator_id, option_id = ids[clave]
        filas.append((indicator_id, option_id, c.points, c.option_label))

    with conn.transaction():
        with conn.cursor() as cur:
            cur.execute(
                _SQL_INSERT_SETUP,
                {
                    "symbol": symbol,
                    "timeframe": timeframe,
                    "price_at_evaluation": price_at_evaluation,
                    "raw_balance": evaluation.raw_balance,
                    "direction": evaluation.direction,
                    "decision": evaluation.decision,
                    "no_trade_reason": evaluation.no_trade_reason,
                    "classification_code": evaluation.classification_code,
                    "classification_label": evaluation.classification_label,
                    "notes": notes,
                },
            )
            creado = cur.fetchone()
            setup_id = creado["id"]

            cur.executemany(
                _SQL_INSERT_SELECTION, [(setup_id, *fila) for fila in filas]
            )

    return {"id": setup_id, "evaluated_at": creado["evaluated_at"]}


# ---------------------------------------------------------------------------
#  Consulta
# ---------------------------------------------------------------------------

#: Columnas del resumen: lo que pinta la tabla del histórico.
_COLUMNAS_RESUMEN = """
    id, evaluated_at, symbol, timeframe, price_at_evaluation,
    raw_balance, direction, decision, no_trade_reason,
    classification_code, classification_label, notes,
    trade_id, pnl_net, outcome,
    result_notes, trade_source, result_created_at, result_updated_at
"""

#: Y las de la operación vinculada, solo para el detalle. No van en la lista
#: porque la tabla no enseña nada de eso: traerlas en cada fila de una página
#: de veinte sería pagar por lo que solo mira quien despliega una.
_COLUMNAS_OPERACION = """
    trade_symbol, trade_side, trade_opened_at, trade_closed_at,
    trade_entry_price, trade_exit_price, trade_quantity, trade_journal_notes
"""

_SQL_LISTA_BASE = f"select {_COLUMNAS_RESUMEN} from v_setups_with_outcome"


def list_setups(
    conn: Connection,
    *,
    symbol: str | None = None,
    decision: str | None = None,
    no_trade_reason: str | None = None,
    desde: Any = None,
    hasta: Any = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict[str, Any]], int]:
    """Devuelve la página pedida y el total que cumple los filtros.

    El total va aparte porque el frontend necesita paginar sin traerse el
    histórico entero para contarlo.
    """
    condiciones: list[str] = []
    params: dict[str, Any] = {}

    if symbol:
        condiciones.append("upper(symbol) = upper(%(symbol)s)")
        params["symbol"] = symbol
    if decision:
        condiciones.append("decision = %(decision)s")
        params["decision"] = decision
    if no_trade_reason:
        condiciones.append("no_trade_reason = %(no_trade_reason)s")
        params["no_trade_reason"] = no_trade_reason
    if desde:
        condiciones.append("evaluated_at >= %(desde)s")
        params["desde"] = desde
    if hasta:
        condiciones.append("evaluated_at <= %(hasta)s")
        params["hasta"] = hasta

    where = (" where " + " and ".join(condiciones)) if condiciones else ""

    with conn.cursor() as cur:
        cur.execute(f"select count(*) as total from v_setups_with_outcome{where}", params)
        total = cur.fetchone()["total"]

        cur.execute(
            f"{_SQL_LISTA_BASE}{where} order by evaluated_at desc, id desc "
            "limit %(limit)s offset %(offset)s",
            {**params, "limit": limit, "offset": offset},
        )
        filas = cur.fetchall()

    return filas, total


# ---------------------------------------------------------------------------
#  Resultado manual
#
#  Una fila en `trades` con source='manual', la estructura que el esquema ya
#  dejaba preparada para la Fase 2. `opened_at`/`closed_at` quedan a NULL a
#  propósito: el trader registra a posteriori y no sabemos cuándo cerró de
#  verdad — `created_at` ya dice cuándo se registró, y escribir un `now()` en
#  `closed_at` sería inventar un dato que Bybit sí traerá de verdad.
# ---------------------------------------------------------------------------

#: Contrato → columna. Las notas de cierre van a `exit_reason`, el campo
#: subjetivo que el esquema reserva para "por qué/cómo salió".
_COLUMNAS_RESULTADO = {
    "outcome": "manual_outcome",
    "pnl_net": "pnl_net",
    "notes": "exit_reason",
}


def save_result(
    conn: Connection,
    setup_id: UUID,
    *,
    symbol: str,
    side: str,
    outcome: str,
    pnl_net: Any = None,
    notes: str | None = None,
) -> dict[str, Any]:
    """Registra el desenlace. El UNIQUE de `trades.setup_id` impide un segundo."""
    with conn.transaction():
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into trades (setup_id, symbol, side, manual_outcome,
                                    pnl_net, exit_reason, source)
                values (%s, %s, %s, %s, %s, %s, 'manual')
                returning id
                """,
                [str(setup_id), symbol, side, outcome, pnl_net, notes],
            )
            return cur.fetchone()


def update_result(
    conn: Connection, setup_id: UUID, changes: dict[str, Any]
) -> str | None:
    """Corrige un resultado registrado a mano.

    Devuelve `"ok"` si actualizó, `"bybit"` si el trade vinculado vino del
    exchange (esos no se editan desde aquí: la resincronización de la Fase 2
    los pisaría), y `None` si el setup no tiene resultado que corregir.
    """
    sets = ", ".join(
        f"{_COLUMNAS_RESULTADO[campo]} = %({campo})s" for campo in changes
    )
    with conn.transaction():
        with conn.cursor() as cur:
            cur.execute(
                f"update trades set {sets} "
                "where setup_id = %(setup_id)s and source = 'manual' "
                "returning id",
                {**changes, "setup_id": str(setup_id)},
            )
            if cur.fetchone() is not None:
                return "ok"

            cur.execute(
                "select source from trades where setup_id = %s", [str(setup_id)]
            )
            fila = cur.fetchone()
            return "bybit" if fila is not None else None


def delete_setup(conn: Connection, setup_id: UUID) -> bool:
    """Borra un setup. Devuelve False si no existía.

    Sus `setup_selections` caen por el ON DELETE CASCADE. La trade vinculada
    **no** cae —el FK es ON DELETE SET NULL, porque una operación real
    sobrevive a su setup— así que hay que decidir qué hacer con ella:

    - `source='manual'`: se borra. Solo existía como el resultado de este
      setup; sin él no representa nada y quedaría como una operación
      improvisada que nunca ocurrió.
    - `source='bybit'`: se conserva, y su `setup_id` queda a NULL. Es un dato
      real del exchange y borrarlo sería perder contabilidad; el hueco lo deja
      exactamente como lo que el esquema ya llama operación sin setup previo.
    """
    with conn.transaction():
        with conn.cursor() as cur:
            cur.execute(
                "delete from trades where setup_id = %s and source = 'manual'",
                [str(setup_id)],
            )
            cur.execute("delete from setups where id = %s", [str(setup_id)])
            return cur.rowcount > 0


_SQL_DETALLE = (
    f"select {_COLUMNAS_RESUMEN}, {_COLUMNAS_OPERACION} from v_setups_with_outcome"
)


def get_setup(conn: Connection, setup_id: UUID) -> dict[str, Any] | None:
    with conn.cursor() as cur:
        cur.execute(f"{_SQL_DETALLE} where id = %s", [str(setup_id)])
        setup = cur.fetchone()
        if setup is None:
            return None

        # Se leen los valores CONGELADOS de setup_selections (points_applied,
        # option_label), no los de indicator_options. El JOIN solo aporta el
        # nombre del indicador y el orden de presentación. Si el trader cambió
        # los pesos después, este setup sigue mostrando lo que valió aquel día.
        cur.execute(
            """
            select s.indicator_id, i.code as indicator_code, i.name as indicator_name,
                   i.max_weight, s.option_id, o.code as option_code,
                   s.option_label, s.points_applied
            from setup_selections s
            join indicators i        on i.id = s.indicator_id
            join indicator_options o on o.id = s.option_id
            where s.setup_id = %s
            order by i.display_order, i.id
            """,
            [str(setup_id)],
        )
        setup["selections"] = cur.fetchall()

    return setup
