/**
 * Operaciones ejecutadas: importarlas de Bybit y consultarlas.
 *
 * Nada de esto ejecuta órdenes ni puede hacerlo: el backend solo llama a un
 * endpoint de consulta del exchange (ver README, Seguridad).
 */

import { request } from "./client";

/**
 * Importa el historial cerrado de Bybit. Manual y explícito: lo dispara el
 * trader, no un proceso en segundo plano.
 *
 * Puede tardar bastante —la primera vez recorre dos años en ventanas de siete
 * días— así que el timeout se sube muy por encima del de una petición normal.
 * Con el de 15 s por defecto, la primera sincronización se cortaría sola justo
 * cuando estaba funcionando.
 */
export function syncTrades(options) {
  return request("/api/trades/sync", {
    method: "POST",
    timeoutMs: 180000,
    ...options,
  });
}

/**
 * Listado de operaciones, de la más reciente a la más antigua.
 *
 * @param {object} [filtros]
 * @param {"bybit"|"manual"} [filtros.source]
 * @param {boolean} [filtros.vinculadas] `false` trae solo las que no tienen setup.
 */
export function listTrades({ source, vinculadas, limit, offset } = {}, options) {
  const query = new URLSearchParams();
  if (source) query.set("source", source);
  if (vinculadas != null) query.set("vinculadas", String(vinculadas));
  if (limit != null) query.set("limit", String(limit));
  if (offset != null) query.set("offset", String(offset));

  const cadena = query.toString();
  return request(`/api/trades${cadena ? `?${cadena}` : ""}`, options);
}

/**
 * Corrige a mano el setup vinculado. `setupId` a `null` desvincula.
 *
 * Existe porque la vinculación automática es una heurística: dos setups del
 * mismo par el mismo día son indistinguibles para ella.
 */
export function relinkTrade(tradeId, setupId, options) {
  return request(`/api/trades/${encodeURIComponent(tradeId)}/setup`, {
    method: "PATCH",
    body: { setup_id: setupId },
    ...options,
  });
}
