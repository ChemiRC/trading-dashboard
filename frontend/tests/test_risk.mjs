/**
 * Tests numéricos de `src/lib/risk.js`. Sin framework: node:assert basta
 * para funciones puras. Ejecutar con `node tests/test_risk.mjs` desde
 * `frontend/`.
 */

import assert from "node:assert/strict";

import {
  calculateAtrRatio,
  calculatePositionSize,
  calculateRisk,
  calculateRiskReward,
} from "../src/lib/risk.js";

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

// --- Ejemplo principal: entry=1000 stop=950 tp=1050 capital=10000 risk%=2 atr=35.5 ---

caso("ejemplo principal: R:R = 1.0 (riesgo y beneficio iguales, 50 y 50)", () => {
  const r = calculateRisk(10000, 2, 1000, 950, 1050);
  cercaDe(r.riskRewardRatio, 1.0);
});

caso("ejemplo principal: pérdida máxima = 200 (10000 * 2%)", () => {
  const r = calculateRisk(10000, 2, 1000, 950, 1050);
  cercaDe(r.maxLoss, 200);
});

caso("ejemplo principal: tamaño de posición = 4 (200 / 50)", () => {
  const r = calculateRisk(10000, 2, 1000, 950, 1050);
  cercaDe(r.positionSize, 4);
});

caso("ejemplo principal: ratios ATR ~= 1.41x (50 / 35.5)", () => {
  const r = calculateRisk(10000, 2, 1000, 950, 1050);
  const stopRatio = calculateAtrRatio(r.riskDistance, 35.5);
  const tpRatio = calculateAtrRatio(r.rewardDistance, 35.5);
  cercaDe(stopRatio, 50 / 35.5);
  cercaDe(tpRatio, 50 / 35.5);
  assert.ok(Math.abs(stopRatio - 1.41) < 0.01, `esperaba ~1.41, obtuve ${stopRatio}`);
});

// --- R:R distinto de 1 ---

caso("R:R = 3.0 cuando el beneficio triplica al riesgo (150 / 50)", () => {
  const r = calculateRisk(10000, 1, 1000, 950, 1150);
  cercaDe(r.riskRewardRatio, 3.0);
});

// --- Caso agnóstico largo/corto ---

caso("agnóstico: stop por encima de la entrada sigue dando distancias positivas", () => {
  const r = calculateRisk(10000, 2, 1000, 1050, 950); // stop arriba, tp abajo (corto)
  cercaDe(r.riskDistance, 50);
  cercaDe(r.rewardDistance, 50);
  cercaDe(r.riskRewardRatio, 1.0);
});

caso("agnóstico: potentialProfit nunca es negativo aunque tp < entry", () => {
  const r = calculateRisk(10000, 2, 1000, 1050, 950);
  assert.ok(r.potentialProfit >= 0, `esperaba >= 0, obtuve ${r.potentialProfit}`);
  cercaDe(r.potentialProfit, 500);
});

// --- División por cero: entry === stop ---

caso("calculateRiskReward: entry === stop devuelve null, no Infinity/NaN", () => {
  assert.equal(calculateRiskReward(1000, 1000, 1050), null);
});

caso("calculatePositionSize: riskDistance = 0 devuelve null", () => {
  assert.equal(calculatePositionSize(200, 0), null);
});

caso("calculateRisk: entry === stop deja riskRewardRatio y positionSize en null", () => {
  const r = calculateRisk(10000, 2, 1000, 1000, 1050);
  assert.equal(r.riskRewardRatio, null);
  assert.equal(r.positionSize, null);
  assert.equal(r.riskDistance, 0);
  // El beneficio potencial no depende del riesgo: sigue siendo calculable.
  assert.ok(Number.isFinite(r.potentialProfit));
});

// --- ATR opcional ---

caso("calculateAtrRatio: ATR null -> null", () => {
  assert.equal(calculateAtrRatio(50, null), null);
});

caso("calculateAtrRatio: ATR undefined -> null", () => {
  assert.equal(calculateAtrRatio(50, undefined), null);
});

caso("calculateAtrRatio: ATR = 0 -> null", () => {
  assert.equal(calculateAtrRatio(50, 0), null);
});

caso("calculateAtrRatio: ATR negativo -> null", () => {
  assert.equal(calculateAtrRatio(50, -10), null);
});

caso("calculateAtrRatio: ATR positivo -> ratio numérico (cómodo, cerca, ajustado)", () => {
  cercaDe(calculateAtrRatio(50, 25), 2.0); // > 2.0: cómodo
  cercaDe(calculateAtrRatio(50, 100), 0.5); // < 1.0: muy ajustado
});

console.log(`\n${pasados} OK, ${fallidos} FALLO(S)`);
process.exit(fallidos === 0 ? 0 : 1);
