"""Salud del servicio."""

from fastapi import APIRouter

from app.api.deps import Config, Conn
from app.db import config_repo

router = APIRouter(tags=["salud"])


@router.get("/health", summary="El proceso responde")
def health(settings: Config) -> dict:
    """No toca la base de datos: sirve para el health check del hosting.

    Si comprobase Postgres, una caída de Supabase provocaría que Railway
    reiniciara el contenedor en bucle sin que el contenedor tenga la culpa.
    """
    return {"status": "ok", "env": settings.app_env}


@router.get("/health/db", summary="La base de datos responde y la config es coherente")
def health_db(conn: Conn) -> dict:
    """Comprobación profunda, para el navegador y para diagnosticar.

    Devuelve 200 con `config_ok: false` cuando la configuración tiene un
    problema, en vez de un 5xx: la base de datos está viva, lo que pasa es que
    alguien ha dejado los pesos sin sumar 100. Son dos fallos distintos y
    mezclarlos haría que el de verdad pasara desapercibido.
    """
    salud = config_repo.fetch_config_health(conn)
    banderas = ("suma_es_100", "tiene_puerta", "umbrales_cubren_0_100")
    return {
        "status": "ok",
        "database": "ok",
        "config_ok": all(salud[b] for b in banderas),
        "config": salud,
    }
