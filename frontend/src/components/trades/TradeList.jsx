import { useState } from "react";

import { formatFecha, formatNumber, tono } from "../../lib/format.js";
import { IconoDireccion } from "../ui/Icons.jsx";
import LinkSetupPicker from "./LinkSetupPicker.jsx";

/**
 * La tabla de operaciones ejecutadas.
 *
 * Misma rejilla de ancho fijo y mismo desliz horizontal que el histórico de
 * setups: son dos tablas densas del mismo dashboard y no tendría sentido que
 * se comportaran distinto.
 *
 * **Sin vínculo no es un error.** Las operaciones importadas de antes de que
 * el trader empezara a evaluar setups aquí no tienen ninguno, y no lo tendrán
 * nunca. Por eso "sin vincular" se pinta en gris `flat` —neutro, informativo—
 * y no en rojo: el hueco es el dato que delata haberse saltado el proceso, no
 * una avería que arreglar.
 */

const CLASE_LADO = {
  LONG: "border-long/50 bg-long-deep/40 text-long",
  SHORT: "border-short/50 bg-short-deep/40 text-short",
};

//: El origen se distingue por forma y no solo por color: `bybit` es un dato
//: objetivo del exchange, `manual` lo tecleó el trader. Saber cuál es cuál de
//: un vistazo importa cuando el PnL de uno es contable y el del otro es
//: declarado.
const ORIGEN = {
  bybit: { texto: "Bybit", clase: "border-line bg-raised text-ink-dim" },
  manual: { texto: "manual", clase: "border-cls-medium/40 bg-cls-medium/10 text-cls-medium" },
};

const CLASE_GRID =
  "grid grid-cols-[1rem_9.5rem_minmax(6.5rem,1fr)_5rem_5rem_minmax(8rem,1fr)_minmax(9rem,1fr)] items-baseline gap-x-4 gap-y-1";

export default function TradeList({ items, onActualizada }) {
  return (
    <div className="overflow-x-auto">
      <div
        className={`${CLASE_GRID} min-w-max border-b border-line px-4 py-2 text-[11px] uppercase tracking-wider text-ink-faint`}
      >
        <span aria-hidden />
        <span>Apertura</span>
        <span>Símbolo</span>
        <span>Lado</span>
        <span>Origen</span>
        <span className="text-right">PnL</span>
        <span>Setup</span>
      </div>

      <ul className="min-w-max divide-y divide-line">
        {items.map((trade) => (
          <FilaTrade key={trade.id} trade={trade} onActualizada={onActualizada} />
        ))}
      </ul>
    </div>
  );
}

function FilaTrade({ trade, onActualizada }) {
  const [vinculando, setVinculando] = useState(false);
  const origen = ORIGEN[trade.source] ?? ORIGEN.bybit;
  const pnl = trade.pnl_net == null ? null : Number(trade.pnl_net);

  return (
    <li>
      <div className={`${CLASE_GRID} px-4 py-3 text-sm transition-colors hover:bg-raised`}>
        <span aria-hidden className="text-ink-faint">
          {trade.setup_id ? "🔗" : ""}
        </span>

        <span className="tabular-nums text-ink-dim">{formatFecha(trade.opened_at)}</span>

        <span className="text-ink">{trade.symbol}</span>

        <span>
          <span
            className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs uppercase tracking-wider ${
              CLASE_LADO[trade.side] ?? "border-line bg-raised text-flat"
            }`}
          >
            <IconoDireccion direccion={trade.side} className="h-3 w-3" />
            {trade.side}
          </span>
        </span>

        <span>
          <span
            className={`inline-block rounded border px-2 py-0.5 text-[10px] uppercase tracking-wider ${origen.clase}`}
          >
            {origen.texto}
          </span>
        </span>

        <span className={`tabular-nums text-right ${pnl == null ? "text-flat" : tono(pnl)}`}>
          {pnl == null ? "—" : `${pnl > 0 ? "+" : ""}${formatNumber(pnl)}`}
        </span>

        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {trade.setup_id ? (
            <>
              <span className="text-ink-dim">
                {trade.setup_symbol} · {formatFecha(trade.setup_evaluated_at)}
              </span>
              <button
                type="button"
                onClick={() => setVinculando((v) => !v)}
                className="text-xs text-ink-faint transition-colors hover:text-ink"
              >
                cambiar
              </button>
            </>
          ) : (
            <>
              <span className="text-flat">sin vincular</span>
              <button
                type="button"
                onClick={() => setVinculando((v) => !v)}
                className="text-xs text-ink-faint underline-offset-2 transition-colors hover:text-ink hover:underline"
              >
                vincular
              </button>
            </>
          )}
        </span>
      </div>

      {/* El cierre desmonta el buscador: no hay estado que conservar y montarlo
          entero al abrir evita mantener cincuenta listas de setups en memoria
          por una tabla de doscientas filas. */}
      {vinculando && (
        <LinkSetupPicker
          trade={trade}
          onCerrar={() => setVinculando(false)}
          onVinculado={(actualizada) => {
            setVinculando(false);
            onActualizada(actualizada);
          }}
        />
      )}
    </li>
  );
}
