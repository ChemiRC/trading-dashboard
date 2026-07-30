import { conSigno, formatFecha, formatNumber, tono } from "../../lib/format.js";
import SetupDetail from "./SetupDetail.jsx";

/**
 * La tabla del histórico. Cada fila es un botón: al pulsarla se expande el
 * desglose congelado debajo, sin salir de la lista -- volver es volver a
 * pulsar, y el resto de filas nunca desaparecen de la vista.
 *
 * El monoespaciado global hace aquí su mejor trabajo: fechas, balances y
 * precios quedan alineados en columna gracias a la rejilla fija de `sm:` en
 * adelante, y `+80` / `−40` ocupan lo mismo.
 */

const ETIQUETA_DECISION = { LONG: "LONG", SHORT: "SHORT", NO_TRADE: "NO TRADE" };

// El mismo tratamiento que el Decision Panel: los NO TRADE en gris `flat`,
// nunca en verde ni rojo, para que se distingan de un vistazo al escanear.
const CLASE_PILDORA = {
  LONG: "border-long/50 bg-long-deep/40 text-long",
  SHORT: "border-short/50 bg-short-deep/40 text-short",
  NO_TRADE: "border-line bg-raised text-flat",
};

// El desenlace, cuando está registrado. En minúscula y sin borde: es un dato
// posterior a la decisión, no compite visualmente con la píldora del veredicto.
const RESULTADO = {
  WIN: { texto: "ganada", clase: "text-long" },
  LOSS: { texto: "perdida", clase: "text-short" },
  BREAKEVEN: { texto: "b/e", clase: "text-flat" },
};

export default function SetupList({ items, abiertoId, onToggle, onActualizado }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((setup) => {
        const abierto = setup.id === abiertoId;
        const resultado = RESULTADO[setup.outcome] ?? null;
        return (
          <li key={setup.id}>
            <button
              type="button"
              onClick={() => onToggle(setup.id)}
              aria-expanded={abierto}
              className="grid w-full grid-cols-2 items-baseline gap-x-4 gap-y-1 px-4 py-3 text-left text-sm transition-colors hover:bg-raised sm:grid-cols-[1rem_9.5rem_minmax(7rem,1fr)_6.5rem_4rem_minmax(7rem,1fr)_4.5rem_auto]"
            >
              <span aria-hidden className="hidden text-ink-faint sm:inline">
                {abierto ? "▾" : "▸"}
              </span>
              <span className="tabular-nums text-ink-dim">
                {formatFecha(setup.evaluated_at)}
              </span>
              <span className="text-ink">
                {setup.symbol}
                {setup.timeframe && (
                  <span className="text-ink-faint"> · {setup.timeframe}</span>
                )}
              </span>
              <span>
                <span
                  className={`inline-block rounded border px-2 py-0.5 text-xs uppercase tracking-wider ${
                    CLASE_PILDORA[setup.decision] ?? CLASE_PILDORA.NO_TRADE
                  }`}
                >
                  {ETIQUETA_DECISION[setup.decision] ?? setup.decision}
                </span>
              </span>
              <span
                className={`tabular-nums sm:text-right ${
                  setup.raw_balance == null ? "text-flat" : tono(setup.raw_balance)
                }`}
              >
                {setup.raw_balance == null ? "—" : conSigno(setup.raw_balance)}
              </span>
              <span className="text-ink-dim">{setup.classification_label ?? "—"}</span>
              <span className={resultado ? resultado.clase : "text-ink-faint"}>
                {resultado ? resultado.texto : "—"}
              </span>
              <span className="tabular-nums text-ink-dim sm:text-right">
                {setup.price_at_evaluation == null
                  ? "—"
                  : formatNumber(Number(setup.price_at_evaluation))}
              </span>
            </button>

            {abierto && <SetupDetail id={setup.id} onActualizado={onActualizado} />}
          </li>
        );
      })}
    </ul>
  );
}
