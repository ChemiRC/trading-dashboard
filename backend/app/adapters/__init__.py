"""Fuentes de datos externas.

Hoy solo Bybit, y solo de lectura. La carpeta existía vacía desde la Fase 1
reservando el sitio; esta es la entrega que la estrena.

Lo que entra por aquí se traduce al modelo del proyecto **antes** de llegar a
`app/db`: ni los repositorios ni las rutas saben qué forma tiene un JSON de
Bybit. Si mañana hay un segundo exchange, lo que cambia es este paquete.
"""

from .bybit import (
    BybitError,
    BybitNoConfigurado,
    Descarga,
    a_trade,
    es_operativa_del_trader,
    fetch_closed_pnl,
    host,
)
from .vinculacion import (
    TOLERANCIA_PRECIO,
    VENTANA_HORAS,
    elegir_setup,
    normaliza_simbolo,
    precio_compatible,
)

__all__ = [
    "BybitError",
    "BybitNoConfigurado",
    "Descarga",
    "a_trade",
    "es_operativa_del_trader",
    "fetch_closed_pnl",
    "host",
    "TOLERANCIA_PRECIO",
    "VENTANA_HORAS",
    "elegir_setup",
    "normaliza_simbolo",
    "precio_compatible",
]
