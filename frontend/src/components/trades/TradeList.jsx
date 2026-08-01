import { useState } from "react";

import { formatFecha, formatNumber, tono } from "../../lib/format.js";
import { IconoDireccion, IconoJournal, IconoVinculo } from "../ui/Icons.jsx";
import LinkSetupPicker from "./LinkSetupPicker.jsx";
import TradeJournal from "./TradeJournal.jsx";

/**
 * Las operaciones ejecutadas.
 *
 * **Dos formas para dos pantallas.** En escritorio es una tabla densa —una
 * rejilla de ancho fijo, igual que el histórico— porque doscientas
 * operaciones se comparan leyendo columnas. En móvil no: una tabla de siete
 * columnas en 375 px obliga a desplazar en horizontal para leer una sola
 * fila, así que cada operación pasa a ser una tarjeta con lo importante
 * arriba y el resto dentro. No es la tabla encogida: es otra disposición de
 * los mismos datos, y por eso las dos se escriben aparte en vez de forzar una
 * sola rejilla a hacer de las dos cosas.
 *
 * Cada fila se despliega —tanto en móvil como en escritorio— y dentro está lo
 * que no cabe de un vistazo: el journal de la operación y el vínculo con su
 * setup.
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
  "grid grid-cols-[1.25rem_9.5rem_minmax(6.5rem,1fr)_5rem_5rem_minmax(8rem,1fr)_minmax(9rem,1fr)] items-baseline gap-x-4";

export default function TradeList({ items, onActualizada }) {
  return (
    <div>
      {/* Cabecera solo en escritorio: en la vista de tarjetas cada dato lleva
          su propia etiqueta y una fila de títulos no encabezaría nada. */}
      <div className="hidden overflow-x-auto sm:block">
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
      </div>

      <ul className="divide-y divide-line">
        {items.map((trade) => (
          <FilaTrade key={trade.id} trade={trade} onActualizada={onActualizada} />
        ))}
      </ul>
    </div>
  );
}

function FilaTrade({ trade, onActualizada }) {
  const [abierta, setAbierta] = useState(false);
  const origen = ORIGEN[trade.source] ?? ORIGEN.bybit;
  const pnl = trade.pnl_net == null ? null : Number(trade.pnl_net);
  const conJournal = Boolean(trade.journal_notes);

  return (
    <li>
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        className={`w-full text-left transition-colors hover:bg-raised ${
          abierta ? "bg-raised/60" : ""
        }`}
      >
        {/* --- Tarjeta (móvil) --- */}
        <div className="flex flex-col gap-1.5 px-4 py-3 sm:hidden">
          <div className="flex items-center gap-2">
            <Cursor abierta={abierta} />
            <span className="text-sm text-ink">{trade.symbol}</span>
            <Lado side={trade.side} />
            <Origen origen={origen} />
            <span className="ml-auto flex items-center gap-1.5">
              {conJournal && <IconoJournal className="h-3.5 w-3.5 text-ink-faint" />}
              <Pnl pnl={pnl} className="text-sm" />
            </span>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pl-6 text-xs">
            <span className="tabular-nums text-ink-faint">{formatFecha(trade.opened_at)}</span>
            <Vinculo trade={trade} />
          </div>
        </div>

        {/* --- Fila de tabla (escritorio) --- */}
        <div className="hidden overflow-x-auto sm:block">
          <div className={`${CLASE_GRID} min-w-max px-4 py-3 text-sm`}>
            <span className="flex items-center gap-1">
              <Cursor abierta={abierta} />
            </span>
            <span className="tabular-nums text-ink-dim">{formatFecha(trade.opened_at)}</span>
            <span className="flex items-baseline gap-1.5 text-ink">
              {trade.symbol}
              {conJournal && (
                <IconoJournal className="h-3 w-3 shrink-0 self-center text-ink-faint" />
              )}
            </span>
            <span>
              <Lado side={trade.side} />
            </span>
            <span>
              <Origen origen={origen} />
            </span>
            <span className="text-right">
              <Pnl pnl={pnl} />
            </span>
            <span className="text-xs">
              <Vinculo trade={trade} />
            </span>
          </div>
        </div>
      </button>

      {/* El cierre desmonta el detalle: no hay estado que conservar y montarlo
          entero al abrir evita mantener cincuenta buscadores de setups en
          memoria por una tabla de doscientas filas. */}
      {abierta && (
        <Detalle trade={trade} pnl={pnl} onActualizada={onActualizada} />
      )}
    </li>
  );
}

function Detalle({ trade, pnl, onActualizada }) {
  const [vinculando, setVinculando] = useState(false);

  return (
    <div className="animate-fade-in space-y-4 border-t border-line bg-base/40 px-4 py-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
        <Dato etiqueta="Entrada" valor={precio(trade.entry_price)} />
        <Dato etiqueta="Salida" valor={precio(trade.exit_price)} />
        <Dato etiqueta="Cantidad" valor={precio(trade.quantity)} />
        <Dato
          etiqueta="Cierre"
          valor={trade.closed_at ? formatFecha(trade.closed_at) : "—"}
        />
      </dl>

      {/* --- Vínculo con el setup ---
          Con botón propio y no un enlace de texto: es la acción que arregla
          una vinculación equivocada, y estaba escondida entre las columnas de
          una tabla densa. */}
      <div className="rounded border border-line bg-surface px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
            <span className="uppercase tracking-wider text-ink-faint">Setup</span>
            {trade.setup_id ? (
              <span className="inline-flex items-baseline gap-1.5 text-ink-dim">
                <IconoVinculo className="h-3 w-3 shrink-0 self-center text-ink-faint" />
                {trade.setup_symbol} · {formatFecha(trade.setup_evaluated_at)}
                {trade.setup_raw_balance != null && (
                  <span className={tono(trade.setup_raw_balance)}>
                    {trade.setup_raw_balance > 0 ? "+" : ""}
                    {trade.setup_raw_balance}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-flat">
                sin vincular — no hubo setup previo, o no se encontró
              </span>
            )}
          </span>

          <button
            type="button"
            onClick={() => setVinculando((v) => !v)}
            className="shrink-0 rounded border border-line px-2.5 py-1 text-xs text-ink-dim transition-colors hover:border-ink-faint hover:text-ink"
          >
            {vinculando
              ? "Cerrar"
              : trade.setup_id
                ? "Cambiar setup"
                : "Vincular con un setup"}
          </button>
        </div>

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
      </div>

      <TradeJournal trade={trade} onActualizada={onActualizada} />

      {pnl != null && (
        <p className="text-[11px] leading-relaxed text-ink-faint">
          El PnL{" "}
          {trade.source === "bybit"
            ? "es el neto que da Bybit y no se edita desde aquí."
            : "lo tecleaste tú al registrar el resultado en el Histórico."}
        </p>
      )}
    </div>
  );
}

// --- Piezas compartidas por las dos disposiciones --------------------------

function Cursor({ abierta }) {
  return (
    <span
      aria-hidden
      className={`inline-block text-ink-faint transition-transform duration-150 ${
        abierta ? "rotate-90" : ""
      }`}
    >
      ▸
    </span>
  );
}

function Lado({ side }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs uppercase tracking-wider ${
        CLASE_LADO[side] ?? "border-line bg-raised text-flat"
      }`}
    >
      <IconoDireccion direccion={side} className="h-3 w-3" />
      {side}
    </span>
  );
}

function Origen({ origen }) {
  return (
    <span
      className={`inline-block rounded border px-2 py-0.5 text-[10px] uppercase tracking-wider ${origen.clase}`}
    >
      {origen.texto}
    </span>
  );
}

function Pnl({ pnl, className = "" }) {
  return (
    <span className={`tabular-nums ${pnl == null ? "text-flat" : tono(pnl)} ${className}`}>
      {pnl == null ? "—" : `${pnl > 0 ? "+" : ""}${formatNumber(pnl)}`}
    </span>
  );
}

function Vinculo({ trade }) {
  if (!trade.setup_id) return <span className="text-flat">sin vincular</span>;
  return (
    <span className="inline-flex items-baseline gap-1 text-ink-dim">
      <IconoVinculo className="h-3 w-3 shrink-0 self-center text-ink-faint" />
      {trade.setup_symbol} · {formatFecha(trade.setup_evaluated_at)}
    </span>
  );
}

function Dato({ etiqueta, valor }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wider text-ink-faint">{etiqueta}</dt>
      <dd className="truncate tabular-nums text-ink-dim">{valor}</dd>
    </div>
  );
}

const precio = (v) => (v == null ? "—" : formatNumber(Number(v), 2));
