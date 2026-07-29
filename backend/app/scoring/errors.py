"""Errores del motor de decisión.

Se distinguen dos familias porque la culpa es de sitios distintos:

- `ConfigError`    → la configuración de la base de datos es incoherente.
                     Es un fallo del sistema: 500.
- `SelectionError` → lo que mandó el formulario no encaja con el catálogo.
                     Es un fallo del cliente: 422.

El motor **nunca** se inventa un valor por defecto para salir del paso. Si algo
no cuadra, revienta: un balance calculado sobre datos que no cuadran es peor que
no tener balance.
"""


class EngineError(Exception):
    """Raíz de todos los errores del motor."""


class ConfigError(EngineError):
    """El catálogo o los umbrales guardados en la BD son incoherentes."""


class SelectionError(EngineError):
    """Las opciones elegidas no encajan con el catálogo vigente."""
