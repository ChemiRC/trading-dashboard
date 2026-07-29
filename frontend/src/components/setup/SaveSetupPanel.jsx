import { useState } from "react";

import { createSetup } from "../../api/setups.js";

/**
 * Guardado del setup en el histórico.
 *
 * Separado del resto del formulario porque es una acción **deliberada**:
 * marcar opciones evalúa en vivo y no escribe nada; guardar solo ocurre
 * cuando el trader lo pide. Si previsualizar guardase, el histórico se
 * llenaría de setups a medio rellenar y dejaría de medir nada.
 *
 * Lo que se manda son las mismas `selections` que ya se estaban evaluando,
 * más el contexto que el veredicto no puede deducir: qué instrumento, en qué
 * temporalidad y a qué precio. El balance **no** viaja: lo recalcula el
 * backend, que es lo que hace comprobable el histórico.
 */

const VACIO = { symbol: "", timeframe: "", price: "", notes: "" };

/** Temporalidades habituales; el campo sigue siendo libre por si usa otra. */
const TIMEFRAMES = ["15m", "1H", "4H", "1D", "1W"];

function Campo({ etiqueta, children, pista }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider text-ink-faint">
        {etiqueta}
        {pista && <span className="ml-1 normal-case">{pista}</span>}
      </span>
      {children}
    </label>
  );
}

const CLASE_INPUT =
  "mt-1 w-full rounded border border-line bg-base px-3 py-2 text-sm text-ink outline-none focus:border-ink-faint";

export default function SaveSetupPanel({ selections, completo, decision }) {
  const [campos, setCampos] = useState(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [guardado, setGuardado] = useState(null);

  function set(campo, valor) {
    setCampos((prev) => ({ ...prev, [campo]: valor }));
    // Un cambio después de guardar significa que viene otro setup: la
    // confirmación anterior deja de describir lo que hay en pantalla.
    setGuardado(null);
    setError(null);
  }

  const symbol = campos.symbol.trim();
  const timeframe = campos.timeframe.trim();
  const precioTexto = campos.price.trim();
  const precio = Number(precioTexto);
  const precioValido = precioTexto !== "" && Number.isFinite(precio) && precio > 0;
  const notes = campos.notes.trim();

  // Los tres obligatorios lo son por decisión de esta pantalla, no del
  // contrato: el backend acepta timeframe y precio nulos. Un setup sin
  // instrumento, temporalidad ni precio no sirve para comparar nada después,
  // que es justo para lo que se guarda.
  const faltan = [];
  if (!completo) faltan.push("responder todos los indicadores");
  if (!symbol) faltan.push("símbolo");
  if (!timeframe) faltan.push("timeframe");
  if (!precioValido) faltan.push("precio válido");

  const puedeGuardar = faltan.length === 0 && !guardando;

  async function guardar() {
    setGuardando(true);
    setError(null);
    setGuardado(null);

    try {
      const cuerpo = {
        selections,
        symbol,
        timeframe,
        price_at_evaluation: precioTexto,
      };
      if (notes) cuerpo.notes = notes;

      const creado = await createSetup(cuerpo);
      setGuardado(creado);
      // El símbolo y la temporalidad se conservan —lo normal es encadenar
      // varias evaluaciones del mismo instrumento— y se limpian el precio y
      // las notas, que son de este setup y solo de este. De paso, obliga a
      // volver a escribir el precio antes de un segundo guardado, lo que
      // hace muy difícil duplicar un setup por pulsar dos veces.
      setCampos((prev) => ({ ...prev, price: "", notes: "" }));
    } catch (fallo) {
      if (fallo.isAborted) return;
      setError(fallo);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="rounded-lg border border-line bg-surface overflow-hidden">
      <h2 className="border-b border-line px-4 py-2.5 text-xs uppercase tracking-widest text-ink-dim">
        Guardar en el histórico
      </h2>

      <div className="grid gap-4 px-4 py-4 sm:grid-cols-3">
        <Campo etiqueta="Símbolo">
          <input
            type="text"
            value={campos.symbol}
            onChange={(e) => set("symbol", e.target.value)}
            placeholder="BTCUSDT"
            maxLength={20}
            className={`${CLASE_INPUT} uppercase`}
          />
        </Campo>

        <Campo etiqueta="Timeframe">
          <input
            type="text"
            value={campos.timeframe}
            onChange={(e) => set("timeframe", e.target.value)}
            placeholder="4H"
            maxLength={10}
            list="timeframes-habituales"
            className={CLASE_INPUT}
          />
          <datalist id="timeframes-habituales">
            {TIMEFRAMES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Campo>

        <Campo etiqueta="Precio" pista="al evaluar">
          <input
            type="text"
            inputMode="decimal"
            value={campos.price}
            onChange={(e) => set("price", e.target.value)}
            placeholder="67432.55"
            className={`${CLASE_INPUT} tabular-nums`}
          />
        </Campo>

        <div className="sm:col-span-3">
          <Campo etiqueta="Notas" pista="(opcional)">
            <textarea
              value={campos.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Qué viste, qué te hizo dudar…"
              className={`${CLASE_INPUT} resize-y`}
            />
          </Campo>
        </div>
      </div>

      <div className="border-t border-line px-4 py-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={guardar}
            disabled={!puedeGuardar}
            className="rounded border border-ink bg-raised px-4 py-2 text-sm text-ink transition-colors hover:bg-line disabled:cursor-not-allowed disabled:border-line disabled:bg-transparent disabled:text-ink-faint"
          >
            {guardando ? "Guardando…" : "Guardar setup"}
          </button>

          {/* Tras un guardado correcto el aviso se calla: el precio y las notas
              se acaban de limpiar a propósito, y decir "falta el precio" justo
              al lado de "✓ guardado" se lee como si algo hubiera fallado.
              Cualquier cambio en un campo descarta la confirmación y lo
              devuelve. */}
          {faltan.length > 0 && !guardado && (
            <span className="text-xs text-ink-faint">Falta {faltan.join(", ")}.</span>
          )}
        </div>

        {/* El motivo por el que un NO TRADE también se guarda. Sin esto, el
            trader asume que registrar algo que no va a operar no sirve de
            nada, y justo esos son los que miden si se contuvo. */}
        <p className="mt-3 text-xs leading-relaxed text-ink-faint">
          {decision === "NO_TRADE" ? (
            <>
              Este setup es <span className="text-flat">NO TRADE</span>, y guardarlo es
              intencionado: registra las veces que te contuviste teniendo evidencia
              parcial. Es la parte del histórico que mide tu disciplina, no tus aciertos.
            </>
          ) : (
            <>
              Se guarda <span className="text-ink-dim">antes</span> de saber el resultado, y
              con los puntos congelados de hoy. Guardar también los NO TRADE ayuda a medir
              tu disciplina.
            </>
          )}
        </p>

        {guardado && (
          <div className="mt-3 rounded border border-long/40 bg-long-deep/30 px-3 py-2.5">
            <div className="text-sm text-long">
              ✓ Setup guardado · {guardado.decision === "NO_TRADE" ? "NO TRADE" : guardado.decision}
            </div>
            <div className="mt-1 text-xs text-ink-dim">
              {guardado.symbol}
              {guardado.timeframe ? ` · ${guardado.timeframe}` : ""} ·{" "}
              <code className="text-ink-faint">{String(guardado.id).slice(0, 8)}</code> ·{" "}
              {new Date(guardado.evaluated_at).toLocaleString("es-ES")}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 rounded border border-short/40 bg-short-deep/30 px-3 py-2.5">
            <div className="text-xs text-short">{error.code}</div>
            <div className="mt-0.5 text-sm leading-relaxed text-ink">{error.message}</div>
          </div>
        )}
      </div>
    </section>
  );
}
