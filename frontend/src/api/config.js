/**
 * Endpoints de catálogo y configuración.
 *
 * Envoltorios de una línea a propósito: su valor no es la lógica, es que las
 * rutas del backend estén escritas en un solo sitio. Una ruta repetida a mano
 * por los componentes es una ruta que alguien acabará cambiando en cuatro
 * sitios y olvidando en el quinto.
 */

import { request } from "./client";

/**
 * Todo lo que el formulario necesita para pintarse: indicadores, opciones con
 * sus puntos, umbrales, defaults y cuál es el indicador puerta.
 *
 * Es la razón de que en este frontend no haya ni un peso escrito: el catálogo
 * viene entero de la base de datos. Añadir un indicador allí lo hace aparecer
 * aquí sin tocar JavaScript.
 */
export function getCatalog(options) {
  return request("/api/config/catalog", options);
}

/** La vista `v_config_health`: si los pesos suman 100, si hay puerta, etc. */
export function getConfigHealth(options) {
  return request("/api/config/health", options);
}

/** Comprobación profunda: la BD responde y la configuración es coherente. */
export function getBackendHealth(options) {
  return request("/health/db", options);
}

// ---------------------------------------------------------------------------
//  Edición
//
//  Los tres son PATCH: se manda solo lo que cambió. Ninguno valida nada aquí
//  —que el peso cubra sus opciones, que las bandas no se solapen, que solo
//  haya un default— porque esas reglas viven en los triggers del esquema y
//  llegan de vuelta como un 409 con el mensaje ya escrito. Comprobarlas
//  también en JavaScript sería tener la misma verdad en dos sitios que se
//  pueden desincronizar.
// ---------------------------------------------------------------------------

/** Peso, nombre, orden de presentación o activo de un indicador. */
export function patchIndicator(code, changes, options) {
  return request(`/api/config/indicators/${encodeURIComponent(code)}`, {
    method: "PATCH",
    body: changes,
    ...options,
  });
}

/** Etiqueta, puntos, opción por defecto o activa. Va por id, no por code: el code solo es único dentro de su indicador. */
export function patchOption(optionId, changes, options) {
  return request(`/api/config/options/${optionId}`, {
    method: "PATCH",
    body: changes,
    ...options,
  });
}

/** Etiqueta y rango de una banda de clasificación. */
export function patchThreshold(code, changes, options) {
  return request(`/api/config/thresholds/${encodeURIComponent(code)}`, {
    method: "PATCH",
    body: changes,
    ...options,
  });
}
