"""Dependencias compartidas por las rutas.

Son síncronas, como las rutas. Ver la explicación en `app/db/pool.py`.
"""

from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends
from psycopg import Connection

from app.core import Settings, get_settings
from app.db import config_repo, connection
from app.scoring import EngineConfig


def db_connection() -> Iterator[Connection]:
    with connection() as conn:
        yield conn


Conn = Annotated[Connection, Depends(db_connection)]
Config = Annotated[Settings, Depends(get_settings)]


def engine_config(conn: Conn, settings: Config) -> EngineConfig:
    """La configuración vigente, releída en cada petición.

    Sin caché a propósito: el trader edita pesos y umbrales desde la propia
    aplicación, y evaluar con una copia vieja daría un balance que ya no se
    corresponde con lo que la pantalla de ajustes muestra.
    """
    return config_repo.load_engine_config(conn, rule_b_enabled=settings.rule_b_enabled)


EngineCfg = Annotated[EngineConfig, Depends(engine_config)]
