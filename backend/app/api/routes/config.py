"""Catálogo y pantalla de configuración.

Estos endpoints son la razón de que no haya ni un peso escrito en el frontend:
el JS pide el catálogo y pinta lo que le digan. Añadir un indicador nuevo es un
INSERT en la base de datos, y aparece solo.
"""

from fastapi import APIRouter, HTTPException, status

from app.api.deps import Config, Conn, EngineCfg
from app.db import config_repo
from app.models import (
    CatalogOut,
    ConfigHealthOut,
    IndicatorOut,
    IndicatorPatch,
    OptionOut,
    OptionPatch,
    ThresholdOut,
    ThresholdPatch,
)

router = APIRouter(prefix="/api/config", tags=["configuracion"])


@router.get("/catalog", response_model=CatalogOut, summary="Todo lo que pinta el formulario")
def get_catalog(conn: Conn, config: EngineCfg, settings: Config) -> CatalogOut:
    filas = config_repo.fetch_indicator_rows(conn)
    umbrales = config_repo.fetch_threshold_rows(conn)

    descripciones = {f["code"]: f["description"] for f in filas}

    indicadores = [
        IndicatorOut(
            id=ind.id,
            code=ind.code,
            name=ind.name,
            description=descripciones.get(ind.code),
            max_weight=ind.max_weight,
            display_order=ind.display_order,
            is_gate=ind.is_gate,
            options=[
                OptionOut(
                    id=o.id,
                    code=o.code,
                    label=o.label,
                    points=o.points,
                    is_default=o.is_default,
                )
                for o in ind.options
            ],
        )
        for ind in config.indicators
    ]

    # Los indicadores sin default no entran en el diccionario. Ese hueco es
    # deliberado y es la traducción a JSON de "la tendencia semanal no tiene
    # estado neutro": el formulario no puede arrancar con una respuesta que el
    # trader no ha dado.
    defaults = {
        ind.code: o.code for ind in config.indicators for o in ind.options if o.is_default
    }

    gate = config.gate
    return CatalogOut(
        indicators=indicadores,
        thresholds=[ThresholdOut(**u) for u in umbrales],
        defaults=defaults,
        gate_indicator_code=gate.code if gate else None,
        max_abs_balance=config.max_abs_balance,
        rule_b_enabled=settings.rule_b_enabled,
    )


@router.get("/thresholds", response_model=list[ThresholdOut], summary="Bandas de clasificacion")
def get_thresholds(conn: Conn) -> list[ThresholdOut]:
    filas = config_repo.fetch_threshold_rows(conn)
    return [ThresholdOut(**f) for f in filas]


@router.get("/health", response_model=ConfigHealthOut, summary="v_config_health")
def get_config_health(conn: Conn, settings: Config) -> ConfigHealthOut:
    """La vista `v_config_health`, más si la Regla B está activa.

    La pantalla de ajustes la usa para avisar cuando el trader deja los pesos
    sin sumar 100: sin este aviso, el "máximo ±100" del README pasaría a ser
    mentira sin que nadie se enterase. `rule_b_enabled` viene de la
    configuración del proceso, no de la vista: sin él, un `RULE_B_ENABLED=false`
    puesto por accidente no se nota en ningún sitio.
    """
    return ConfigHealthOut(
        **config_repo.fetch_config_health(conn),
        rule_b_enabled=settings.rule_b_enabled,
    )


# ---------------------------------------------------------------------------
#  Edición
#
#  Aquí no se valida ninguna regla de negocio. Las cuatro que importan
#  —|points| <= max_weight, un solo default, una sola puerta, bandas sin
#  solapar— las hace cumplir el esquema, y sus mensajes llegan al cliente como
#  409 desde app/api/errors.py. Repetirlas en Python sería tener la misma
#  verdad en dos sitios que se pueden desincronizar.
# ---------------------------------------------------------------------------


@router.patch(
    "/indicators/{code}",
    response_model=IndicatorOut,
    summary="Editar un indicador (peso, nombre, orden, activo)",
)
def patch_indicator(code: str, cambios: IndicatorPatch, conn: Conn) -> IndicatorOut:
    fila = config_repo.update_indicator(conn, code, cambios.changes())
    if fila is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail=f"No existe el indicador '{code}'."
        )
    # Se releen las opciones para devolver el indicador completo: el frontend
    # sustituye la ficha entera y así no se queda con una copia a medias.
    filas = config_repo.fetch_indicator_rows(conn)
    actual = next((f for f in filas if f["code"] == code), None)
    if actual is None:
        # Acaba de desactivarse: ya no forma parte del catálogo vigente.
        return IndicatorOut(**fila, options=[])
    return IndicatorOut(
        **{k: v for k, v in actual.items() if k != "options"},
        options=[OptionOut(**o) for o in actual["options"]],
    )


@router.patch(
    "/options/{option_id}",
    response_model=OptionOut,
    summary="Editar una opcion (etiqueta, puntos, default, activa)",
)
def patch_option(option_id: int, cambios: OptionPatch, conn: Conn) -> OptionOut:
    fila = config_repo.update_option(conn, option_id, cambios.changes())
    if fila is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail=f"No existe la opcion {option_id}."
        )
    return OptionOut(**fila)


@router.patch(
    "/thresholds/{code}",
    response_model=ThresholdOut,
    summary="Editar una banda de clasificacion",
)
def patch_threshold(code: str, cambios: ThresholdPatch, conn: Conn) -> ThresholdOut:
    fila = config_repo.update_threshold(conn, code, cambios.changes())
    if fila is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail=f"No existe la banda '{code}'."
        )
    return ThresholdOut(**fila)
