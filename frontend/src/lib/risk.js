/**
 * Cálculos de gestión de riesgo.
 *
 * Funciones puras: mismos argumentos, mismo resultado siempre. No validan
 * -- el componente ya filtra los inputs vacíos, negativos o con entrada =
 * stop antes de llamarlas -- pero sí devuelven `null` en vez de
 * `NaN`/`Infinity` cuando una división no tiene sentido (riesgo en pips
 * igual a 0, ATR sin rellenar), para que la interfaz pueda pintar "—" sin
 * comprobaciones adicionales. Verificadas en `tests/test_risk.mjs`.
 */

export function calculateRiskReward(entry, stop, tp) {
  const riskDistance = Math.abs(entry - stop);
  if (riskDistance === 0) return null;

  const rewardDistance = Math.abs(tp - entry);
  return rewardDistance / riskDistance;
}

export function calculatePositionSize(maxLoss, riskDistance) {
  if (riskDistance === 0) return null;
  return maxLoss / riskDistance;
}

/** Solo tiene sentido si hay ATR: null en vez de dividir por 0 o por algo que no se rellenó. */
export function calculateAtrRatio(distance, atr) {
  if (!atr || atr <= 0) return null;
  return Math.abs(distance) / atr;
}

/**
 * El paquete completo para los cinco inputs obligatorios.
 *
 * `potentialProfit` va en valor absoluto: la calculadora es agnóstica a si
 * el setup descrito es un largo o un corto (un stop por encima de la
 * entrada sigue funcionando), así que un take profit "detrás" de la
 * entrada en un corto no puede convertirse en un beneficio negativo solo
 * por el orden de la resta.
 */
export function calculateRisk(capital, riskPercent, entry, stop, tp) {
  const maxLoss = capital * (riskPercent / 100);
  const riskDistance = Math.abs(entry - stop);
  const rewardDistance = Math.abs(tp - entry);

  if (riskDistance === 0) {
    return {
      maxLoss,
      riskDistance: 0,
      rewardDistance,
      riskRewardRatio: null, // no hay riesgo definido, no hay ratio que calcular
      positionSize: null,
      potentialProfit: Math.abs(rewardDistance * (capital / entry)),
    };
  }

  return {
    maxLoss,
    riskDistance,
    rewardDistance,
    riskRewardRatio: rewardDistance / riskDistance,
    positionSize: maxLoss / riskDistance,
    potentialProfit: Math.abs(rewardDistance * (capital / entry)),
  };
}
