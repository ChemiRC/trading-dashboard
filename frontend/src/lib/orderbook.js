/**
 * El libro de órdenes: mantenerlo y medirlo. Funciones puras.
 *
 * Bybit no manda el libro entero en cada mensaje. Manda **un snapshot** al
 * suscribirse y a partir de ahí **deltas**: solo los niveles de precio que han
 * cambiado. Reconstruir el libro es cosa del cliente, y por eso vive aquí y no
 * dentro del hook: así se puede probar con una tabla de mensajes en vez de con
 * un WebSocket de verdad. `useOrderBook` solo se encarga del socket.
 *
 * **Los precios se guardan como la cadena que mandó Bybit**, no como número.
 * Es la clave con la que llegan los deltas, y `"16493.50"` y `"16493.5"` son
 * el mismo número pero distinta clave: pasar por `Number` y volver a texto
 * dejaría niveles huérfanos que ya no se podrían borrar nunca. De paso, al
 * pintar se enseña el tick exacto del exchange y no lo que decida el `toString`
 * de JavaScript.
 */

/** Libro vacío: el estado antes del primer snapshot. */
export function crearLibro() {
  return { bids: new Map(), asks: new Map(), u: null, seq: null };
}

/** ¿Hay algo que medir? Un libro sin ningún nivel no es un libro equilibrado. */
export function libroVacio(libro) {
  return libro.bids.size === 0 && libro.asks.size === 0;
}

/**
 * Snapshot: reemplaza el libro entero. Nunca se mezcla con lo que hubiera
 * antes -- si Bybit manda un snapshot es justamente porque lo de antes ya no
 * vale.
 */
export function aplicarSnapshot(data) {
  return {
    bids: mapaDeNiveles(data.b),
    asks: mapaDeNiveles(data.a),
    u: data.u ?? null,
    seq: data.seq ?? null,
  };
}

/**
 * Delta: inserta, actualiza o borra los niveles que vengan.
 *
 * **Tamaño 0 significa borrar el nivel**, no "hay 0 contratos": es como Bybit
 * dice que ese precio ha desaparecido del libro. Confundirlo deja niveles
 * fantasma con volumen cero que ensucian el heatmap para siempre.
 */
export function aplicarDelta(libro, data) {
  const bids = new Map(libro.bids);
  const asks = new Map(libro.asks);
  aplicarCambios(bids, data.b);
  aplicarCambios(asks, data.a);
  return { bids, asks, u: data.u ?? libro.u, seq: data.seq ?? libro.seq };
}

/**
 * ¿Este delta encaja justo detrás de lo que ya tenemos?
 *
 * `u` es un contador que Bybit incrementa de uno en uno por tópico. Si llega
 * un salto, se ha perdido un mensaje y **el libro local ya no es el de Bybit**:
 * hay que pedir un snapshot nuevo. Aplicarlo igualmente dejaría niveles viejos
 * que nadie va a volver a tocar, y el error no se ve -- el libro sigue
 * pareciendo un libro, solo que miente.
 *
 * `u = 1` es el caso especial que documenta Bybit: el servicio se ha
 * reiniciado. Cae solo dentro de esta comprobación, porque `u` local ya vale
 * millones.
 */
export function esContiguo(libro, data) {
  if (libro.u === null || data.u === null || data.u === undefined) return false;
  return data.u === libro.u + 1;
}

/**
 * Los niveles de un lado, ordenados **de más cerca del precio a más lejos**:
 * las compras de mayor a menor precio, las ventas de menor a mayor. Ese orden
 * es el que hace que «los N primeros» signifique «los N más cercanos al
 * precio», que es lo que mide la presión.
 */
export function niveles(libro, lado, limite = Infinity) {
  const mapa = lado === "bids" ? libro.bids : libro.asks;
  const lista = [];
  for (const [precio, volumen] of mapa) {
    lista.push({ precio: Number(precio), etiqueta: precio, volumen });
  }
  lista.sort((a, b) => (lado === "bids" ? b.precio - a.precio : a.precio - b.precio));
  return Number.isFinite(limite) ? lista.slice(0, limite) : lista;
}

/**
 * Presión: el desbalance entre compra y venta en los N niveles más cercanos
 * al precio.
 *
 *     (volumen_compra − volumen_venta) / (volumen_compra + volumen_venta)
 *
 * Sale entre −1 y +1, y se lee igual que el balance del Decision Panel: el
 * signo dice hacia dónde se inclina el libro, el valor absoluto cuánto. +1
 * sería un libro sin una sola orden de venta en esos niveles.
 *
 * Solo los N más cercanos, no el libro entero: lejos del precio hay órdenes
 * que nadie va a ejecutar hoy y que, contadas, tapan lo único que se quiere
 * medir -- la intención de quien está operando ahora.
 *
 * Con el libro vacío devuelve `null`, nunca `NaN`: misma convención que
 * `lib/risk.js`, un hueco es un hueco y se pinta como tal.
 */
export function presion(libro, n = 20) {
  const compra = sumaVolumen(niveles(libro, "bids", n));
  const venta = sumaVolumen(niveles(libro, "asks", n));
  const total = compra + venta;
  if (total === 0) return { valor: null, compra: 0, venta: 0, total: 0 };
  return { valor: (compra - venta) / total, compra, venta, total };
}

/**
 * Mejor compra, mejor venta, horquilla y precio medio. El precio medio es lo
 * que se enseña como "precio": el último cruce no viene en este tópico, y el
 * punto medio de la horquilla es la mejor aproximación que da el libro.
 */
export function mejores(libro) {
  const bid = niveles(libro, "bids", 1)[0] ?? null;
  const ask = niveles(libro, "asks", 1)[0] ?? null;
  if (!bid || !ask) return { bid, ask, spread: null, medio: null, spreadPct: null };
  const spread = ask.precio - bid.precio;
  const medio = (ask.precio + bid.precio) / 2;
  return { bid, ask, spread, medio, spreadPct: medio === 0 ? null : (spread / medio) * 100 };
}

/**
 * El nivel con más volumen de un lado -- el "muro". Es lo que hace útil el
 * heatmap: no todos los niveles pesan igual y el mayor es el que marca dónde
 * hay alguien defendiendo un precio.
 */
export function volumenMaximo(listaA, listaB = []) {
  let max = 0;
  for (const nivel of listaA) if (nivel.volumen > max) max = nivel.volumen;
  for (const nivel of listaB) if (nivel.volumen > max) max = nivel.volumen;
  return max;
}

// --- Interno ---------------------------------------------------------------

function mapaDeNiveles(cambios) {
  const mapa = new Map();
  if (!cambios) return mapa;
  for (const [precio, tamano] of cambios) {
    const volumen = Number(tamano);
    // Un snapshot no debería traer ceros, pero si los trae son niveles que no
    // existen: guardarlos sería empezar con basura.
    if (volumen > 0) mapa.set(precio, volumen);
  }
  return mapa;
}

function aplicarCambios(mapa, cambios) {
  if (!cambios) return;
  for (const [precio, tamano] of cambios) {
    const volumen = Number(tamano);
    if (!(volumen > 0)) mapa.delete(precio);
    else mapa.set(precio, volumen);
  }
}

function sumaVolumen(lista) {
  let total = 0;
  for (const nivel of lista) total += nivel.volumen;
  return total;
}
