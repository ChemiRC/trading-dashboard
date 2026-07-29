"""Lectura y edición de la configuración vigente.

Traduce las filas de `indicators`, `indicator_options` y
`classification_thresholds` a los dataclasses del motor. Es la única frontera
entre PostgreSQL y `app/scoring`: el motor no sabe que existe una base de datos.
"""

from typing import Any

from psycopg import Connection

from app.scoring import EngineConfig, Indicator, Option, Threshold

# Solo lo activo: desactivar un indicador lo saca del formulario y del cálculo,
# pero la fila sigue ahí porque hay setups históricos apuntándola.
_SQL_INDICADORES = """
    select i.id, i.code, i.name, i.description, i.max_weight,
           i.display_order, i.is_gate,
           coalesce(
             jsonb_agg(
               jsonb_build_object(
                 'id', o.id, 'code', o.code, 'label', o.label,
                 'points', o.points, 'is_default', o.is_default,
                 'display_order', o.display_order
               ) order by o.display_order, o.id
             ) filter (where o.id is not null),
             '[]'::jsonb
           ) as options
    from indicators i
    left join indicator_options o
           on o.indicator_id = i.id and o.is_active
    where i.is_active
    group by i.id
    order by i.display_order, i.id
"""

_SQL_UMBRALES = """
    select id, code, label, min_abs_balance, max_abs_balance,
           is_tradeable, display_order, color_token
    from classification_thresholds
    order by display_order, min_abs_balance
"""


def fetch_indicator_rows(conn: Connection) -> list[dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(_SQL_INDICADORES)
        return cur.fetchall()


def fetch_threshold_rows(conn: Connection) -> list[dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute(_SQL_UMBRALES)
        return cur.fetchall()


def load_engine_config(conn: Connection, *, rule_b_enabled: bool) -> EngineConfig:
    """Construye la configuración que consume `evaluate()`.

    Se lee entera en cada petición a propósito. El trader edita pesos y umbrales
    desde la propia aplicación: una caché aquí significaría evaluar un setup con
    una configuración que ya no es la vigente, y ese es exactamente el tipo de
    desfase silencioso que el proyecto intenta evitar.
    """
    indicator_rows = fetch_indicator_rows(conn)
    threshold_rows = fetch_threshold_rows(conn)

    indicators = tuple(
        Indicator(
            id=row["id"],
            code=row["code"],
            name=row["name"],
            max_weight=row["max_weight"],
            display_order=row["display_order"],
            is_gate=row["is_gate"],
            options=tuple(
                Option(
                    id=opt["id"],
                    code=opt["code"],
                    label=opt["label"],
                    points=opt["points"],
                    is_default=opt["is_default"],
                )
                for opt in row["options"]
            ),
        )
        for row in indicator_rows
    )

    thresholds = tuple(
        Threshold(
            code=row["code"],
            label=row["label"],
            min_abs=row["min_abs_balance"],
            max_abs=row["max_abs_balance"],
            is_tradeable=row["is_tradeable"],
        )
        for row in threshold_rows
    )

    return EngineConfig(
        indicators=indicators,
        thresholds=thresholds,
        rule_b_enabled=rule_b_enabled,
    )


def fetch_config_health(conn: Connection) -> dict[str, Any]:
    with conn.cursor() as cur:
        cur.execute("select * from v_config_health")
        return cur.fetchone()


# ---------------------------------------------------------------------------
#  Edición (pantalla de configuración)
#
#  Los UPDATE son parciales: solo se tocan las columnas que vienen en el cuerpo.
#  Las reglas (peso >= opciones, un solo default, bandas sin solapar) NO se
#  reimplementan aquí: las hace cumplir la base de datos con triggers y
#  constraints, y el mensaje que devuelven se propaga tal cual al cliente.
#  Validarlas también en Python sería duplicar la verdad en dos sitios.
#
#  Los nombres de columna nunca vienen del cliente: salen de los campos
#  declarados en los modelos Pydantic, que llevan `extra="forbid"`. Cualquier
#  clave que no esté en el contrato se rechaza con un 422 antes de llegar aquí.
# ---------------------------------------------------------------------------


def _build_update(table: str, fields: dict[str, Any], where: str) -> tuple[str, list]:
    sets = ", ".join(f"{col} = %s" for col in fields)
    return f"update {table} set {sets} where {where} returning *", list(fields.values())


def update_indicator(
    conn: Connection, code: str, fields: dict[str, Any]
) -> dict[str, Any] | None:
    sql, params = _build_update("indicators", fields, "code = %s")
    with conn.cursor() as cur:
        cur.execute(sql, [*params, code])
        return cur.fetchone()


def update_option(
    conn: Connection, option_id: int, fields: dict[str, Any]
) -> dict[str, Any] | None:
    sql, params = _build_update("indicator_options", fields, "id = %s")
    with conn.cursor() as cur:
        cur.execute(sql, [*params, option_id])
        return cur.fetchone()


def update_threshold(
    conn: Connection, code: str, fields: dict[str, Any]
) -> dict[str, Any] | None:
    sql, params = _build_update("classification_thresholds", fields, "code = %s")
    with conn.cursor() as cur:
        cur.execute(sql, [*params, code])
        return cur.fetchone()
