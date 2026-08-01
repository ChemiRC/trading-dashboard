/**
 * Las etiquetas cortas de los códigos que devuelve el backend.
 *
 * Viven aquí porque las usan tres sitios —el Permission Panel, el desglose del
 * histórico y el informe en PDF— y una copia por sitio significa que el día
 * que se renombre una regla queden dos pantallas diciendo lo de antes. El
 * texto largo del motivo (`no_trade_message`) sí viene del backend; esto es
 * solo el rótulo.
 */

export const ETIQUETA_MOTIVO = {
  GATE_NO_DIVERGENCE: "Regla A · sin disparador",
  TRIGGER_CONTRADICTION: "Regla B · contradicción",
  ZERO_BALANCE: "Balance cero",
  BELOW_THRESHOLD: "Score bajo",
};

export const ETIQUETA_OUTCOME = {
  WIN: "Ganada",
  LOSS: "Perdida",
  BREAKEVEN: "Breakeven",
};

export const ETIQUETA_DECISION = {
  LONG: "LONG",
  SHORT: "SHORT",
  NO_TRADE: "NO TRADE",
};
