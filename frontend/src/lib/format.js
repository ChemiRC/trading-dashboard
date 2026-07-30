/**
 * Formato compartido de puntos con signo.
 *
 * Se usa en cualquier sitio que enseñe la puntuación de una opción del
 * catálogo: la pantalla de diagnóstico, el formulario de evaluación y, más
 * adelante, el Confluence Score. Un solo sitio evita que "+30" se escriba de
 * una forma en un componente y de otra en el siguiente.
 */

export function conSigno(puntos) {
  return puntos > 0 ? `+${puntos}` : String(puntos);
}

/** El signo de los puntos es lo único que marca la dirección. También al pintar. */
export function tono(puntos) {
  if (puntos > 0) return "text-long";
  if (puntos < 0) return "text-short";
  return "text-flat";
}

/**
 * Formato numérico para la calculadora de riesgo: separador de miles con
 * coma y punto decimal, igual en todo el panel aunque el resto de la
 * interfaz esté en castellano -- es la notación habitual en herramientas de
 * trading y la que espera leer el trader.
 */
export function formatNumber(valor, decimales = 2) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "—";
  return valor.toLocaleString("en-US", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

/**
 * Cantidades del activo (tamaño de posición): siempre al menos 2 decimales,
 * hasta 6 si hacen falta -- una fracción de BTC no cabe en dos decimales,
 * pero rellenar de ceros un número que no los tiene es ruido.
 */
export function formatQuantity(valor) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "—";
  return valor.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

/**
 * Fecha y hora compactas y de ancho fijo: `29/07/2026 19:13`. A mano y no con
 * `toLocaleString` porque el formato dependería del navegador, y en la tabla
 * del histórico las fechas se leen en columna -- con anchos distintos dejarían
 * de alinearse, que es lo único que se les pide.
 */
export function formatFecha(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
