import { useEffect, useState } from "react";

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

// Una sola rejilla, siempre con las ocho columnas -- no una versión "de
// escritorio" y otra "de móvil" distintas. Por debajo de su ancho natural el
// contenedor desliza en horizontal (ver `overflow-x-auto` más abajo) en vez
// de reordenar las columnas, que es lo que ya hacía ilegible una tabla tan
// densa la primera vez que se probó en una pantalla más estrecha.
const CLASE_GRID =
  "grid grid-cols-[1rem_9.5rem_minmax(7rem,1fr)_6.5rem_4rem_minmax(7rem,1fr)_4.5rem_auto] items-baseline gap-x-4 gap-y-1";

/** Duración del cierre en milisegundos. Tiene que coincidir con `duration-300` de abajo: es lo que le dice a React cuándo ya puede desmontar el detalle sin que se note el corte. */
const DURACION_CIERRE = 300;

export const COLUMNAS = [
  { campo: "evaluated_at", etiqueta: "Fecha" },
  { campo: "symbol", etiqueta: "Símbolo" },
  { campo: "decision", etiqueta: "Decisión" },
  { campo: "raw_balance", etiqueta: "Balance" },
  { campo: "classification_label", etiqueta: "Clasificación" },
  { campo: "outcome", etiqueta: "Resultado" },
  { campo: "price_at_evaluation", etiqueta: "Precio" },
];

export default function SetupList({
  items,
  abiertoId,
  onToggle,
  onActualizado,
  onBorrado,
  ordenPor,
  ordenAsc,
  onOrdenar,
}) {
  return (
    // `overflow-x-auto` aquí y no en la página: en una pantalla angosta la
    // rejilla de columnas fijas (pensada para leerse en columna, no para
    // encogerse) no cabe, y es la TABLA la que se desliza -- la cabecera, la
    // pestaña activa y el resto de la pantalla se quedan quietos.
    <div className="overflow-x-auto">
      <div className={`${CLASE_GRID} min-w-max border-b border-line px-4 py-2`}>
        <span aria-hidden />
        {COLUMNAS.map((col) => (
          <button
            key={col.campo}
            type="button"
            onClick={() => onOrdenar(col.campo)}
            className={`flex items-center gap-1 text-left text-[11px] uppercase tracking-wider transition-colors hover:text-ink ${
              col.campo === "raw_balance" || col.campo === "price_at_evaluation"
                ? "justify-end text-right"
                : ""
            } ${ordenPor === col.campo ? "text-ink" : "text-ink-faint"}`}
          >
            {col.etiqueta}
            {ordenPor === col.campo && <span aria-hidden>{ordenAsc ? "▲" : "▼"}</span>}
          </button>
        ))}
      </div>

      <ul className="min-w-max divide-y divide-line">
        {items.map((setup) => (
          <FilaSetup
            key={setup.id}
            setup={setup}
            abierto={setup.id === abiertoId}
            onToggle={() => onToggle(setup.id)}
            onActualizado={onActualizado}
            onBorrado={onBorrado}
          />
        ))}
      </ul>
    </div>
  );
}

function FilaSetup({ setup, abierto, onToggle, onActualizado, onBorrado }) {
  const resultado = RESULTADO[setup.outcome] ?? null;
  // El detalle sigue montado durante el cierre para que la animación de
  // altura tenga contenido real que reducir en vez de colapsar sobre hueco
  // vacío -- se desmonta justo después, cuando la transición ya terminó.
  const [montado, setMontado] = useState(abierto);

  useEffect(() => {
    if (abierto) {
      setMontado(true);
      return undefined;
    }
    const t = setTimeout(() => setMontado(false), DURACION_CIERRE);
    return () => clearTimeout(t);
  }, [abierto]);

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abierto}
        className={`${CLASE_GRID} w-full px-4 py-3 text-left text-sm transition-colors hover:bg-raised`}
      >
        <span aria-hidden className="text-ink-faint">
          {abierto ? "▾" : "▸"}
        </span>
        <span className="tabular-nums text-ink-dim">{formatFecha(setup.evaluated_at)}</span>
        <span className="text-ink">
          {setup.symbol}
          {setup.timeframe && <span className="text-ink-faint"> · {setup.timeframe}</span>}
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
          className={`tabular-nums text-right ${
            setup.raw_balance == null ? "text-flat" : tono(setup.raw_balance)
          }`}
        >
          {setup.raw_balance == null ? "—" : conSigno(setup.raw_balance)}
        </span>
        <span className="text-ink-dim">{setup.classification_label ?? "—"}</span>
        <span className={resultado ? resultado.clase : "text-ink-faint"}>
          {resultado ? resultado.texto : "—"}
        </span>
        <span className="tabular-nums text-right text-ink-dim">
          {setup.price_at_evaluation == null ? "—" : formatNumber(Number(setup.price_at_evaluation))}
        </span>
      </button>

      {/* El truco del grid: animar `grid-template-rows` de 0fr a 1fr da una
          altura que se anima sin medir el contenido en JS, que aquí no se
          conoce de antemano -- el desglose llega async y su longitud varía
          con el número de notas y si hay resultado registrado o no. */}
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: abierto ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          {montado && (
            <SetupDetail id={setup.id} onActualizado={onActualizado} onBorrado={onBorrado} />
          )}
        </div>
      </div>
    </li>
  );
}
