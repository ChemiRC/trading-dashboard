"""Traducción de errores internos a respuestas HTTP.

Todas las respuestas de error tienen la misma forma —`{"error": {code, message}}`—
incluidas las que genera FastAPI por su cuenta. Un cliente que tiene que mirar
en `detail` unas veces y en `error.message` otras acaba enseñando "[object
Object]" al usuario.

Los mensajes de la base de datos se propagan tal cual siempre que sean útiles.
Los triggers del esquema están escritos en castellano y explican qué regla se
incumplió ("No se puede bajar el peso de X a 5: ya tiene una opcion de 30 puntos
absolutos"); sustituirlos por un "error de validación" genérico tiraría a la
basura la parte que sirve.
"""

import logging

import psycopg
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.scoring import ConfigError, SelectionError

log = logging.getLogger("app.api")

#: Las constraints que no traen mensaje propio. PostgreSQL las rechaza en
#: inglés y nombrando el índice, que no le dice nada al trader. Los triggers no
#: están aquí porque ya lanzan su propio texto explicando el caso concreto.
MENSAJES_CONSTRAINT: dict[str, str] = {
    "classification_thresholds_int4range_excl": (
        "Las bandas de clasificacion no pueden solaparse: el rango que intentas "
        "guardar pisa a otra banda existente."
    ),
    "indicators_single_gate_idx": (
        "Solo puede haber un indicador puerta. Quita la marca del actual antes "
        "de asignarla a otro."
    ),
    "indicator_options_single_default_idx": (
        "Un indicador solo puede tener una opcion por defecto."
    ),
    "setup_selections_option_id_fkey": (
        "Esa opcion la usan setups ya guardados y no se puede borrar. "
        "Desactivala (is_active = false) para retirarla del formulario."
    ),
    "setup_selections_indicator_id_fkey": (
        "Ese indicador lo usan setups ya guardados y no se puede borrar. "
        "Desactivalo (is_active = false) para retirarlo del formulario."
    ),
    "indicators_display_order_key": (
        "Ya hay otro indicador en esa posicion del formulario."
    ),
    "indicator_options_order_key": (
        "Ya hay otra opcion en esa posicion dentro del mismo indicador."
    ),
    "trades_setup_id_key": (
        "Este setup ya tiene un resultado registrado. Corrige el existente en "
        "vez de registrar otro."
    ),
    "trades_manual_outcome_coherente": (
        "El resultado declarado y el PnL se contradicen: un PnL positivo es una "
        "operacion ganada, uno negativo perdida y cero breakeven. Corrige uno "
        "de los dos."
    ),
}


def _payload(code: str, message: str, **extra) -> dict:
    return {"error": {"code": code, "message": message, **extra}}


async def _selection_error(request: Request, exc: SelectionError) -> JSONResponse:
    # Culpa del cliente: mandó opciones que no están en el catálogo, o dejó
    # indicadores sin responder.
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content=_payload("SELECTION_INVALID", str(exc)),
    )


async def _config_error(request: Request, exc: ConfigError) -> JSONResponse:
    # Culpa del sistema: la configuración guardada es incoherente. No se
    # devuelve un balance "aproximado": no hay balance.
    log.error("Configuracion incoherente: %s", exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=_payload(
            "CONFIG_INVALID",
            str(exc),
            hint="Revisa la pantalla de configuracion o consulta v_config_health.",
        ),
    )


async def _regla_rechazada(request: Request, exc: psycopg.Error) -> JSONResponse:
    """Una regla del esquema ha dicho que no.

    Cubre las dos formas que tiene el esquema de negarse, que llegan como
    excepciones de familias distintas:

    - constraints (`IntegrityError`): bandas solapadas por el EXCLUDE, dos
      indicadores puerta, un setup incoherente, borrar una opción histórica.
    - triggers (`RaiseException`, SQLSTATE P0001): las comprobaciones de peso
      contra opciones, que un CHECK no puede hacer porque miran otra tabla.

    Desde fuera son lo mismo —la petición contradice una regla— así que ambas
    son 409.
    """
    constraint = (exc.diag.constraint_name or "").strip()
    original = (exc.diag.message_primary or str(exc)).strip()
    mensaje = MENSAJES_CONSTRAINT.get(constraint, original)

    log.warning("Rechazado por la base de datos [%s]: %s", constraint or "trigger", original)
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content=_payload("DB_CONSTRAINT", mensaje, constraint=constraint or None),
    )


async def _db_error(request: Request, exc: psycopg.OperationalError) -> JSONResponse:
    # La base de datos no está disponible. Se registra entero y se devuelve un
    # mensaje corto: el detalle de conexión no le sirve al navegador.
    log.exception("Fallo de conexion con la base de datos")
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content=_payload(
            "DB_UNAVAILABLE", "La base de datos no esta disponible ahora mismo."
        ),
    )


async def _http_error(request: Request, exc: HTTPException) -> JSONResponse:
    """Los 404 y demás `HTTPException` de las rutas, en el sobre común."""
    return JSONResponse(
        status_code=exc.status_code,
        content=_payload("HTTP_ERROR", str(exc.detail)),
        headers=getattr(exc, "headers", None),
    )


async def _validation_error(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """El cuerpo no cumple el contrato de Pydantic.

    Se conserva la lista `details` de FastAPI —dice exactamente qué campo
    falla— pero envuelta igual que el resto.
    """
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content=_payload(
            "REQUEST_INVALID",
            "El cuerpo de la peticion no es valido.",
            # `errors()` puede traer excepciones dentro de `ctx`, que no son
            # serializables; el encoder de FastAPI las aplana.
            details=jsonable_encoder(exc.errors()),
        ),
    )


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(SelectionError, _selection_error)
    app.add_exception_handler(ConfigError, _config_error)
    app.add_exception_handler(psycopg.errors.IntegrityError, _regla_rechazada)
    # RaiseException hereda de ProgrammingError, no de IntegrityError: sin esta
    # línea los mensajes de los triggers de peso acabarían en un 500 mudo.
    app.add_exception_handler(psycopg.errors.RaiseException, _regla_rechazada)
    app.add_exception_handler(psycopg.OperationalError, _db_error)
    app.add_exception_handler(HTTPException, _http_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
