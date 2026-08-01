/**
 * Tests de `src/lib/orderbook.js`. Sin framework: node:assert basta para
 * funciones puras. Ejecutar con `node tests/test_orderbook.mjs` desde
 * `frontend/`.
 *
 * Aquí no se abre ningún WebSocket. Mantener el libro con snapshots y deltas
 * es la parte que se puede equivocar en silencio -- un nivel que no se borra
 * no rompe nada, solo miente -- así que se prueba con mensajes escritos a
 * mano, con la forma exacta que manda Bybit.
 */

import assert from "node:assert/strict";

import {
  aplicarDelta,
  aplicarSnapshot,
  crearLibro,
  esContiguo,
  libroVacio,
  mejores,
  niveles,
  presion,
  volumenMaximo,
} from "../src/lib/orderbook.js";

let pasados = 0;
let fallidos = 0;

function caso(nombre, fn) {
  try {
    fn();
    console.log(`OK    ${nombre}`);
    pasados += 1;
  } catch (err) {
    console.error(`FALLO ${nombre}`);
    console.error(`      ${err.message}`);
    fallidos += 1;
  }
}

function cercaDe(actual, esperado, tolerancia = 1e-9) {
  assert.ok(
    Math.abs(actual - esperado) < tolerancia,
    `esperaba ${esperado}, obtuve ${actual}`,
  );
}

// Snapshot con la forma real de `orderbook.50.BTCUSDT`: `b` compras, `a`
// ventas, cada nivel `[precio, tamaño]` como texto, y `u`/`seq` de control.
const SNAPSHOT = {
  s: "BTCUSDT",
  b: [
    ["16493.50", "0.006"],
    ["16493.00", "0.100"],
    ["16492.50", "0.200"],
  ],
  a: [
    ["16494.00", "0.004"],
    ["16494.50", "0.050"],
    ["16495.00", "0.300"],
  ],
  u: 18521288,
  seq: 7961638724,
};

// --- Snapshot --------------------------------------------------------------

caso("libro nuevo: vacío y sin marca de actualización", () => {
  const libro = crearLibro();
  assert.equal(libroVacio(libro), true);
  assert.equal(libro.u, null);
});

caso("snapshot: carga los dos lados y su marca", () => {
  const libro = aplicarSnapshot(SNAPSHOT);
  assert.equal(libro.bids.size, 3);
  assert.equal(libro.asks.size, 3);
  assert.equal(libro.u, 18521288);
  assert.equal(libroVacio(libro), false);
});

caso("snapshot: reemplaza, no mezcla con el libro anterior", () => {
  const primero = aplicarSnapshot(SNAPSHOT);
  const segundo = aplicarSnapshot({ b: [["100.0", "1"]], a: [["101.0", "2"]], u: 5 });
  assert.equal(segundo.bids.size, 1);
  assert.equal(segundo.asks.size, 1);
  assert.equal(primero.bids.size, 3); // el original no se toca
});

caso("snapshot: un nivel con tamaño 0 no entra en el libro", () => {
  const libro = aplicarSnapshot({ b: [["100.0", "0"], ["99.0", "1"]], a: [], u: 1 });
  assert.equal(libro.bids.size, 1);
  assert.equal(libro.bids.has("100.0"), false);
});

// --- Orden de los niveles --------------------------------------------------

caso("niveles: las compras salen de mayor a menor precio", () => {
  const libro = aplicarSnapshot(SNAPSHOT);
  const bids = niveles(libro, "bids");
  assert.deepEqual(
    bids.map((n) => n.precio),
    [16493.5, 16493.0, 16492.5],
  );
});

caso("niveles: las ventas salen de menor a mayor precio", () => {
  const libro = aplicarSnapshot(SNAPSHOT);
  const asks = niveles(libro, "asks");
  assert.deepEqual(
    asks.map((n) => n.precio),
    [16494.0, 16494.5, 16495.0],
  );
});

caso("niveles: el límite recorta por el lado cercano al precio", () => {
  const libro = aplicarSnapshot(SNAPSHOT);
  assert.deepEqual(
    niveles(libro, "bids", 2).map((n) => n.precio),
    [16493.5, 16493.0],
  );
  assert.deepEqual(
    niveles(libro, "asks", 2).map((n) => n.precio),
    [16494.0, 16494.5],
  );
});

caso("niveles: conserva la cadena original del precio para pintarla", () => {
  const libro = aplicarSnapshot(SNAPSHOT);
  assert.equal(niveles(libro, "bids", 1)[0].etiqueta, "16493.50");
  assert.equal(niveles(libro, "bids", 1)[0].precio, 16493.5);
});

// --- Deltas ----------------------------------------------------------------

caso("delta: actualiza el volumen de un nivel existente", () => {
  const libro = aplicarDelta(aplicarSnapshot(SNAPSHOT), {
    b: [["16493.50", "0.500"]],
    a: [],
    u: 18521289,
  });
  assert.equal(libro.bids.get("16493.50"), 0.5);
  assert.equal(libro.bids.size, 3);
});

caso("delta: inserta un nivel nuevo", () => {
  const libro = aplicarDelta(aplicarSnapshot(SNAPSHOT), {
    b: [["16493.75", "0.010"]],
    a: [],
    u: 18521289,
  });
  assert.equal(libro.bids.size, 4);
  assert.equal(niveles(libro, "bids", 1)[0].precio, 16493.75);
});

caso("delta: tamaño 0 BORRA el nivel, no lo deja a cero", () => {
  const libro = aplicarDelta(aplicarSnapshot(SNAPSHOT), {
    b: [["16493.50", "0"]],
    a: [],
    u: 18521289,
  });
  assert.equal(libro.bids.has("16493.50"), false);
  assert.equal(libro.bids.size, 2);
});

caso("delta: mueve la marca de actualización", () => {
  const libro = aplicarDelta(aplicarSnapshot(SNAPSHOT), { b: [], a: [], u: 18521289 });
  assert.equal(libro.u, 18521289);
});

caso("delta: no muta el libro que recibe", () => {
  const antes = aplicarSnapshot(SNAPSHOT);
  aplicarDelta(antes, { b: [["16493.50", "0"]], a: [["16600.00", "9"]], u: 18521289 });
  assert.equal(antes.bids.size, 3);
  assert.equal(antes.asks.size, 3);
});

caso("delta: un lado ausente no borra ese lado", () => {
  const libro = aplicarDelta(aplicarSnapshot(SNAPSHOT), { b: [["16493.00", "0.7"]], u: 18521289 });
  assert.equal(libro.asks.size, 3);
});

// --- Continuidad de la secuencia -------------------------------------------

caso("esContiguo: u = anterior + 1 encaja", () => {
  const libro = aplicarSnapshot(SNAPSHOT);
  assert.equal(esContiguo(libro, { u: 18521289 }), true);
});

caso("esContiguo: un salto en u NO encaja (se perdió un mensaje)", () => {
  const libro = aplicarSnapshot(SNAPSHOT);
  assert.equal(esContiguo(libro, { u: 18521291 }), false);
});

caso("esContiguo: u repetido no encaja", () => {
  const libro = aplicarSnapshot(SNAPSHOT);
  assert.equal(esContiguo(libro, { u: 18521288 }), false);
});

caso("esContiguo: u = 1 (reinicio del servicio de Bybit) no encaja", () => {
  const libro = aplicarSnapshot(SNAPSHOT);
  assert.equal(esContiguo(libro, { u: 1 }), false);
});

caso("esContiguo: sin libro previo no encaja nada", () => {
  assert.equal(esContiguo(crearLibro(), { u: 2 }), false);
});

// --- Presión ---------------------------------------------------------------

caso("presión: libro equilibrado -> 0", () => {
  const libro = aplicarSnapshot({ b: [["100", "5"]], a: [["101", "5"]], u: 1 });
  cercaDe(presion(libro).valor, 0);
});

caso("presión: solo compras -> +1", () => {
  const libro = aplicarSnapshot({ b: [["100", "5"]], a: [], u: 1 });
  cercaDe(presion(libro).valor, 1);
});

caso("presión: solo ventas -> −1", () => {
  const libro = aplicarSnapshot({ b: [], a: [["101", "5"]], u: 1 });
  cercaDe(presion(libro).valor, -1);
});

caso("presión: 3 de compra contra 1 de venta -> +0.5", () => {
  const libro = aplicarSnapshot({ b: [["100", "3"]], a: [["101", "1"]], u: 1 });
  cercaDe(presion(libro).valor, 0.5);
});

caso("presión: el libro vacío devuelve null, nunca NaN", () => {
  const p = presion(crearLibro());
  assert.equal(p.valor, null);
  assert.equal(p.total, 0);
});

caso("presión: N recorta a los niveles más cercanos al precio", () => {
  // Lejos hay un muro de venta enorme; con N=1 no debe contar.
  const libro = aplicarSnapshot({
    b: [["100", "1"]],
    a: [
      ["101", "1"],
      ["150", "1000"],
    ],
    u: 1,
  });
  cercaDe(presion(libro, 1).valor, 0); // 1 contra 1
  const conMuro = presion(libro, 2);
  assert.ok(conMuro.valor < -0.99, `esperaba muy negativo, obtuve ${conMuro.valor}`);
});

caso("presión: devuelve también los volúmenes que sumó", () => {
  const libro = aplicarSnapshot({ b: [["100", "3"]], a: [["101", "1"]], u: 1 });
  const p = presion(libro, 20);
  cercaDe(p.compra, 3);
  cercaDe(p.venta, 1);
  cercaDe(p.total, 4);
});

caso("presión: siempre queda dentro de −1..+1", () => {
  const libro = aplicarSnapshot({
    b: [["100", "999999"], ["99", "1"]],
    a: [["101", "0.00001"]],
    u: 1,
  });
  const v = presion(libro, 50).valor;
  assert.ok(v <= 1 && v >= -1, `fuera de rango: ${v}`);
});

// --- Mejores precios y horquilla -------------------------------------------

caso("mejores: bid, ask, horquilla y precio medio", () => {
  const m = mejores(aplicarSnapshot(SNAPSHOT));
  assert.equal(m.bid.precio, 16493.5);
  assert.equal(m.ask.precio, 16494.0);
  cercaDe(m.spread, 0.5);
  cercaDe(m.medio, 16493.75);
});

caso("mejores: con un lado vacío no inventa horquilla", () => {
  const m = mejores(aplicarSnapshot({ b: [["100", "1"]], a: [], u: 1 }));
  assert.equal(m.ask, null);
  assert.equal(m.spread, null);
  assert.equal(m.medio, null);
});

caso("mejores: libro vacío -> todo null, sin reventar", () => {
  const m = mejores(crearLibro());
  assert.equal(m.bid, null);
  assert.equal(m.ask, null);
  assert.equal(m.spreadPct, null);
});

// --- Escala del heatmap ----------------------------------------------------

caso("volumenMaximo: el mayor de los dos lados juntos", () => {
  const libro = aplicarSnapshot(SNAPSHOT);
  cercaDe(volumenMaximo(niveles(libro, "bids"), niveles(libro, "asks")), 0.3);
});

caso("volumenMaximo: sin niveles -> 0 (y quien divida ya lo comprueba)", () => {
  assert.equal(volumenMaximo([], []), 0);
});

// --- Un ciclo completo, como llega de verdad --------------------------------

caso("ciclo real: snapshot, tres deltas y un borrado dejan el libro correcto", () => {
  let libro = aplicarSnapshot(SNAPSHOT);
  libro = aplicarDelta(libro, { b: [["16493.50", "0.900"]], a: [], u: 18521289 });
  libro = aplicarDelta(libro, { b: [], a: [["16494.00", "0"]], u: 18521290 });
  libro = aplicarDelta(libro, { b: [["16493.60", "0.050"]], a: [], u: 18521291 });

  assert.equal(libro.u, 18521291);
  assert.equal(libro.bids.get("16493.50"), 0.9);
  assert.equal(libro.asks.has("16494.00"), false);
  assert.equal(niveles(libro, "asks", 1)[0].precio, 16494.5); // la mejor venta subió
  assert.equal(niveles(libro, "bids", 1)[0].precio, 16493.6); // y entró una compra mejor
});

console.log(`\n${pasados} OK, ${fallidos} FALLO(S)`);
process.exit(fallidos === 0 ? 0 : 1);
