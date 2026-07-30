"""Punto de entrada de la aplicación.

    uvicorn app.main:app --reload
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.errors import register_error_handlers
from app.api.routes import auth as auth_routes
from app.api.routes import config as config_routes
from app.api.routes import health as health_routes
from app.api.routes import setups as setups_routes
from app.core import get_settings
from app.db import close_pool, open_pool

DESCRIPCION = """
Backend del sistema de decisión para swing trading.

**No ejecuta órdenes y no se conecta al exchange para operar.** Su trabajo es
responder una sola pregunta antes de cada operación: *¿hay evidencia suficiente,
o la mejor decisión es esperar?*

El resultado no es un score de 0 a 100 sino un **balance con signo de -100 a
+100**: el signo da la dirección, el valor absoluto la fuerza. El formulario
nunca pregunta LONG o SHORT.

Los pesos, las opciones y los umbrales **no están en este código**: viven en la
base de datos y se editan desde `/api/config`.
"""


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    logging.basicConfig(
        level=settings.log_level.upper(),
        format="%(asctime)s  %(levelname)-7s %(name)s  %(message)s",
    )
    # Bloquea el arranque hasta tener conexión: si las credenciales están mal,
    # preferimos enterarnos aquí y no en la primera petición del trader.
    open_pool(settings)
    logging.getLogger("app").info("Pool abierto. Entorno: %s", settings.app_env)
    try:
        yield
    finally:
        close_pool()


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Trading Dashboard API",
        description=DESCRIPCION,
        version="0.4.0",
        lifespan=lifespan,
        # La documentación interactiva es el contrato vivo con el frontend, pero
        # en producción no tiene por qué estar expuesta.
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else "/openapi.json",
    )

    # Lista blanca explícita, nunca "*": el backend es el único que tiene
    # credenciales de Supabase y de Bybit, así que quién puede llamarlo importa.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    register_error_handlers(app)

    app.include_router(health_routes.router)
    app.include_router(auth_routes.router)
    app.include_router(config_routes.router)
    app.include_router(setups_routes.router)

    return app


app = create_app()
