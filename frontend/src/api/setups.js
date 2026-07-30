/**
 * Endpoints de evaluación y guardado de setups.
 */

import { request } from "./client";

/**
 * Evalúa una selección sin guardar nada. Es lo que llama el formulario en
 * cada cambio de opción para que el Decision Panel se actualice en vivo.
 *
 * @param {Record<string, string>} selections `{indicator_code: option_code}`.
 */
export function evaluateSetup(selections, options) {
  return request("/api/setups/evaluate", {
    method: "POST",
    body: { selections },
    ...options,
  });
}

/**
 * Evalúa **y guarda**. Va separado de `evaluateSetup` a propósito: previsualizar
 * no puede escribir en el histórico, o se llenaría de setups a medio rellenar y
 * dejaría de medir nada.
 *
 * No se manda ningún balance ni ninguna dirección: el backend reevalúa a partir
 * de las mismas `selections` y congela los puntos que aplicó ese día. Lo que
 * enseña el Decision Panel es una previsualización, no el veredicto que se
 * guarda.
 *
 * `price_at_evaluation` viaja como **texto**, no como número: el campo es un
 * `Decimal` en el backend, y pasar por un float de JavaScript convertiría
 * `67432.55` en `67432.549999…`. El precio al que se evaluó es justo el dato
 * que la Fase 2 comparará con el precio real de entrada en Bybit.
 *
 * @param {object} setup
 * @param {Record<string, string>} setup.selections
 * @param {string} setup.symbol
 * @param {string} [setup.timeframe]
 * @param {string} [setup.price_at_evaluation] Decimal en texto, mayor que 0.
 * @param {string} [setup.notes]
 */
export function createSetup(setup, options) {
  return request("/api/setups", {
    method: "POST",
    body: setup,
    ...options,
  });
}

/** Histórico, con filtros y paginación. */
export function listSetups({ symbol, limit, offset } = {}, options) {
  const query = new URLSearchParams();
  if (symbol) query.set("symbol", symbol);
  if (limit != null) query.set("limit", String(limit));
  if (offset != null) query.set("offset", String(offset));

  const cadena = query.toString();
  return request(`/api/setups${cadena ? `?${cadena}` : ""}`, options);
}

/**
 * Un setup con su desglose congelado: las opciones que se eligieron y los
 * puntos que se aplicaron **aquel día**, no los del catálogo de hoy.
 */
export function getSetup(id, options) {
  return request(`/api/setups/${encodeURIComponent(id)}`, options);
}

/**
 * Registra a mano cómo terminó el setup. Crea la fila de `trades` con
 * source='manual' — el adelanto del registro automático de la Fase 2.
 *
 * El PnL viaja como **texto** por el mismo motivo que el precio al guardar:
 * la columna es numeric y un float de JavaScript rompería los céntimos.
 * Devuelve el detalle completo ya actualizado.
 *
 * @param {string} setupId
 * @param {object} result
 * @param {"WIN"|"LOSS"|"BREAKEVEN"} result.outcome
 * @param {string} [result.pnl_net]
 * @param {string} [result.notes]
 */
export function registerSetupResult(setupId, result, options) {
  return request(`/api/setups/${encodeURIComponent(setupId)}/result`, {
    method: "POST",
    body: result,
    ...options,
  });
}

/** Corrige un resultado ya registrado. Solo viaja lo que cambió. */
export function updateSetupResult(setupId, changes, options) {
  return request(`/api/setups/${encodeURIComponent(setupId)}/result`, {
    method: "PATCH",
    body: changes,
    ...options,
  });
}
