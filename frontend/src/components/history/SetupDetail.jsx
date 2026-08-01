import { useEffect, useState } from "react";

import {
  deleteSetup,
  getSetup,
  registerSetupResult,
  updateSetupResult,
} from "../../api/setups.js";
import { ETIQUETA_MOTIVO, ETIQUETA_OUTCOME } from "../../lib/etiquetas.js";
import { conSigno, formatFecha, formatNumber, tono } from "../../lib/format.js";
import { IconoDireccion, IconoVinculo } from "../ui/Icons.jsx";

/**
 * Desglose completo de un setup guardado, vía `GET /api/setups/{id}`.
 *
 * Lo que se pinta son los puntos **congelados** -- `points_applied`, los que
 * se aplicaron el día de la evaluación -- no los del catálogo de hoy. Si el
 * trader cambió un peso la semana pasada, este desglose no se mueve: es la
 * garantía que hace comparable el histórico entre meses, y por eso el rótulo
 * lo dice explícitamente.
 *
 * Aquí vive también el registro manual del resultado (adelanto de la Fase 2).
 * La evaluación original es intocable desde esta pantalla a propósito: no hay
 * ni un control que edite selecciones o balance -- el valor del sistema
 * depende de que el setup se evaluó ANTES de saber cómo terminó, y lo único
 * que se añade a posteriori es el desenlace.
 */

const CLASE_OUTCOME = {
  WIN: "border-long/50 bg-long-deep/40 text-long",
  LOSS: "border-short/50 bg-short-deep/40 text-short",
  BREAKEVEN: "border-line bg-raised text-flat",
};

export default function SetupDetail({ id, onActualizado, onBorrado, irA }) {
  const [estado, setEstado] = useState("cargando");
  const [setup, setSetup] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controlador = new AbortController();

    getSetup(id, { signal: controlador.signal })
      .then((datos) => {
        setSetup(datos);
        setEstado("ok");
      })
      .catch((fallo) => {
        if (fallo.isAborted) return;
        setError(fallo);
        setEstado("error");
      });

    return () => controlador.abort();
  }, [id]);

  function actualizado(nuevo) {
    setSetup(nuevo);
    onActualizado?.(nuevo);
  }

  if (estado === "cargando") {
    return (
      <div className="border-t border-line px-4 py-4">
        <p className="animate-pulse text-sm text-ink-dim">Cargando desglose…</p>
      </div>
    );
  }

  if (estado === "error") {
    return (
      <div className="space-y-1 border-t border-line px-4 py-4">
        <div className="text-xs text-short">{error.code}</div>
        <div className="text-sm text-ink">{error.message}</div>
      </div>
    );
  }

  return (
    <div className="border-t border-line bg-base/40 px-4 py-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[11px] uppercase tracking-wider text-ink-faint">
          Desglose congelado — los puntos del día de la evaluación, no los de hoy
        </span>
        {setup.classification_label && (
          <span className="text-xs text-ink-dim">{setup.classification_label}</span>
        )}
      </div>

      <ul className="divide-y divide-line/60">
        {setup.selections.map((s) => (
          <li
            key={s.indicator_code}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2 text-sm"
          >
            <span>
              <span className="text-ink">{s.indicator_name}</span>{" "}
              <span className="text-ink-dim">{s.option_label}</span>
            </span>
            <span className="tabular-nums">
              <span className={tono(s.points_applied)}>{conSigno(s.points_applied)}</span>
              <span className="text-ink-faint"> / {s.max_weight}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="flex items-baseline justify-between border-t border-line py-2.5">
        <span className="text-xs uppercase tracking-widest text-ink-dim">Balance</span>
        <span
          className={`tabular-nums ${
            setup.raw_balance == null ? "text-flat" : tono(setup.raw_balance)
          }`}
        >
          {setup.raw_balance == null ? "— (Regla A: no se calculó)" : conSigno(setup.raw_balance)}
        </span>
      </div>

      {setup.decision === "NO_TRADE" && setup.no_trade_reason && (
        <div className="mt-2 rounded border border-line bg-raised px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-wider text-ink-faint">
            {ETIQUETA_MOTIVO[setup.no_trade_reason] ?? setup.no_trade_reason}
          </div>
          <div className="mt-1 text-sm leading-relaxed text-ink">{setup.no_trade_message}</div>
        </div>
      )}

      {setup.notes && (
        <div className="mt-3">
          <div className="text-[11px] uppercase tracking-wider text-ink-faint">Notas</div>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-dim">
            {setup.notes}
          </p>
        </div>
      )}

      {setup.price_at_evaluation != null && (
        <div className="mt-3 text-xs text-ink-faint">
          Precio al evaluar:{" "}
          <span className="tabular-nums text-ink-dim">
            {formatNumber(Number(setup.price_at_evaluation))}
          </span>
        </div>
      )}

      <OperacionVinculada setup={setup} irA={irA} />
      <ResultSection setup={setup} onActualizado={actualizado} />
      <DeleteSection setup={setup} onBorrado={onBorrado} />
    </div>
  );
}

/**
 * La operación en la que acabó este setup, si acabó en alguna.
 *
 * **El puente entre las dos pantallas, no su fusión.** El Histórico sigue
 * respondiendo «¿qué decidí?» y Operaciones «¿qué hice?»; lo que faltaba era
 * poder ver, desde un setup, con qué operación terminó, sin cambiar de
 * pantalla y buscarla a ojo entre doscientas. Aquí va lo justo para
 * reconocerla —lado, precios, fechas— y un enlace para verla entera.
 *
 * Un NO TRADE no enseña nada de esto: quedarse fuera no tiene operación. Si
 * hubiera uno vinculado sería que el trader operó en contra del veredicto, y
 * entonces sí conviene verlo, así que se enseña igual cuando existe.
 */
function OperacionVinculada({ setup, irA }) {
  if (!setup.trade_id) return null;

  const pnl = setup.pnl_net == null ? null : Number(setup.pnl_net);
  const importada = setup.trade_source === "bybit";

  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="inline-flex items-baseline gap-1.5 text-[11px] uppercase tracking-wider text-ink-faint">
          <IconoVinculo className="h-3 w-3 shrink-0 self-center" />
          Operación vinculada
        </span>
        {irA && (
          <button
            type="button"
            onClick={() => irA("operaciones")}
            className="text-xs text-ink-faint underline-offset-2 transition-colors hover:text-ink hover:underline"
          >
            Verla en Operaciones →
          </button>
        )}
      </div>

      <div className="mt-2 rounded border border-line bg-surface px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="text-sm text-ink">{setup.trade_symbol ?? setup.symbol}</span>
          {setup.trade_side && (
            <span
              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs uppercase tracking-wider ${
                CLASE_LADO_TRADE[setup.trade_side] ?? "border-line bg-raised text-flat"
              }`}
            >
              <IconoDireccion direccion={setup.trade_side} className="h-3 w-3" />
              {setup.trade_side}
            </span>
          )}
          <span className="rounded border border-line bg-raised px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink-dim">
            {importada ? "Bybit" : "manual"}
          </span>
          {pnl != null && (
            <span className={`ml-auto tabular-nums text-sm ${tono(pnl)}`}>
              {pnl > 0 ? "+" : ""}
              {formatNumber(pnl)} USDT
            </span>
          )}
        </div>

        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
          <DatoOperacion etiqueta="Entrada" valor={numero(setup.trade_entry_price)} />
          <DatoOperacion etiqueta="Salida" valor={numero(setup.trade_exit_price)} />
          <DatoOperacion
            etiqueta="Abierta"
            valor={setup.trade_opened_at ? formatFecha(setup.trade_opened_at) : "—"}
          />
          <DatoOperacion
            etiqueta="Cerrada"
            valor={setup.trade_closed_at ? formatFecha(setup.trade_closed_at) : "—"}
          />
        </dl>

        {setup.trade_journal_notes && (
          <p className="mt-2 whitespace-pre-wrap border-t border-line pt-2 text-xs leading-relaxed text-ink-dim">
            {setup.trade_journal_notes}
          </p>
        )}
      </div>

      {/* El precio al que se evaluó contra el precio real de entrada: la
          diferencia entre el plan y la ejecución, que es lo que la Fase 5
          existe para medir. Solo se enseña si están los dos. */}
      {setup.price_at_evaluation != null && setup.trade_entry_price != null && (
        <p className="mt-2 text-[11px] text-ink-faint">
          Evaluado a{" "}
          <span className="tabular-nums text-ink-dim">
            {formatNumber(Number(setup.price_at_evaluation))}
          </span>{" "}
          y entrada real a{" "}
          <span className="tabular-nums text-ink-dim">
            {formatNumber(Number(setup.trade_entry_price))}
          </span>{" "}
          ({desvio(setup)}).
        </p>
      )}
    </div>
  );
}

const CLASE_LADO_TRADE = {
  LONG: "border-long/50 bg-long-deep/40 text-long",
  SHORT: "border-short/50 bg-short-deep/40 text-short",
};

function DatoOperacion({ etiqueta, valor }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wider text-ink-faint">{etiqueta}</dt>
      <dd className="truncate tabular-nums text-ink-dim">{valor}</dd>
    </div>
  );
}

const numero = (v) => (v == null ? "—" : formatNumber(Number(v)));

function desvio(setup) {
  const evaluado = Number(setup.price_at_evaluation);
  const real = Number(setup.trade_entry_price);
  if (!Number.isFinite(evaluado) || evaluado === 0) return "—";
  const pct = ((real - evaluado) / evaluado) * 100;
  const signo = pct > 0 ? "+" : "";
  return `${signo}${pct.toFixed(2)} %`;
}

/**
 * Borrado, en dos pasos y al final del panel a propósito.
 *
 * El histórico solo mide algo si está completo: borrar los setups que
 * salieron mal es la forma más rápida de convertirlo en un álbum de aciertos
 * y de que la pregunta de la Fase 5 —¿el balance predice algo?— deje de tener
 * respuesta. Por eso esto no es un icono cómodo en cada fila de la lista sino
 * un botón discreto, abajo del todo, que además pide confirmación.
 */
function DeleteSection({ setup, onBorrado }) {
  const [confirmando, setConfirmando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState(null);

  async function borrar() {
    setBorrando(true);
    setError(null);
    try {
      await deleteSetup(setup.id);
      onBorrado?.(setup.id);
    } catch (fallo) {
      if (fallo.isAborted) return;
      setError(fallo);
      setBorrando(false);
      setConfirmando(false);
    }
  }

  return (
    <div className="mt-4 border-t border-line pt-3">
      {!confirmando && (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="text-xs text-ink-faint transition-colors hover:text-short"
        >
          Borrar este setup
        </button>
      )}

      {confirmando && (
        <div className="animate-fade-in rounded border border-short/40 bg-short-deep/20 px-3 py-2.5">
          <p className="text-sm leading-relaxed text-ink">
            ¿Borrar este setup? Se va con su desglose
            {setup.outcome ? " y su resultado registrado" : ""}, y no se puede
            deshacer.
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-faint">
            Un histórico al que se le quitan los setups que salieron mal deja de
            poder medir nada. Bórralo si fue una prueba, un duplicado o un error
            de captura.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={borrar}
              disabled={borrando}
              className="rounded border border-short/60 px-3 py-1.5 text-sm text-short transition-colors hover:bg-short-deep/40 disabled:cursor-not-allowed disabled:text-ink-faint"
            >
              {borrando ? "Borrando…" : "Sí, borrar"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className="text-xs text-ink-faint transition-colors hover:text-ink"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="animate-fade-in mt-2 rounded border border-short/40 bg-short-deep/30 px-3 py-2">
          <div className="text-xs text-short">{error.code}</div>
          <div className="mt-0.5 text-sm leading-relaxed text-ink">{error.message}</div>
        </div>
      )}
    </div>
  );
}

/**
 * El desenlace: se muestra si existe, se registra si no, y se corrige si el
 * trader se equivocó al capturarlo -- con la fecha de la corrección visible.
 */
function ResultSection({ setup, onActualizado }) {
  const [editando, setEditando] = useState(false);

  // Un NO TRADE es quedarse fuera: no hay operación cuyo resultado registrar.
  // Si el trader operó igualmente, es una operación improvisada y llegará por
  // la vía de Bybit en la Fase 2 (trade sin setup vinculado).
  if (setup.decision === "NO_TRADE") {
    return (
      <div className="mt-4 border-t border-line pt-3 text-xs text-ink-faint">
        NO TRADE: no hay operación cuyo resultado registrar.
      </div>
    );
  }

  const corregido =
    setup.result_updated_at &&
    setup.result_created_at &&
    setup.result_updated_at !== setup.result_created_at;

  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-[11px] uppercase tracking-wider text-ink-faint">
          Resultado
        </span>
        {setup.outcome && !editando && setup.trade_source === "manual" && (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="text-xs text-ink-faint transition-colors hover:text-ink"
          >
            Corregir
          </button>
        )}
      </div>

      {!setup.outcome && !editando && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="rounded border border-ink px-3 py-1.5 text-sm text-ink transition-colors hover:bg-raised"
          >
            Registrar resultado
          </button>
          <span className="text-xs text-ink-faint">
            La operación se cerró y quieres dejar constancia de cómo terminó.
          </span>
        </div>
      )}

      {setup.outcome && !editando && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span
            className={`inline-block rounded border px-2.5 py-0.5 text-sm ${
              CLASE_OUTCOME[setup.outcome] ?? CLASE_OUTCOME.BREAKEVEN
            }`}
          >
            {ETIQUETA_OUTCOME[setup.outcome] ?? setup.outcome}
          </span>
          {setup.pnl_net != null && (
            <span className={`tabular-nums text-sm ${tono(Number(setup.pnl_net))}`}>
              {Number(setup.pnl_net) > 0 ? "+" : ""}
              {formatNumber(Number(setup.pnl_net))} USDT
            </span>
          )}
          <span className="text-xs text-ink-faint">
            registrado el {formatFecha(setup.result_created_at)}
            {corregido && (
              <span className="text-cls-medium">
                {" "}
                · corregido el {formatFecha(setup.result_updated_at)}
              </span>
            )}
          </span>
        </div>
      )}

      {setup.outcome && !editando && setup.result_notes && (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-dim">
          {setup.result_notes}
        </p>
      )}

      {editando && (
        <ResultForm
          setup={setup}
          onGuardado={(nuevo) => {
            setEditando(false);
            onActualizado(nuevo);
          }}
          onCancelar={() => setEditando(false)}
        />
      )}
    </div>
  );
}

function ResultForm({ setup, onGuardado, onCancelar }) {
  const esCorreccion = setup.outcome != null;
  const [outcome, setOutcome] = useState(setup.outcome ?? null);
  const [pnl, setPnl] = useState(setup.pnl_net == null ? "" : String(Number(setup.pnl_net)));
  const [notas, setNotas] = useState(setup.result_notes ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const pnlTexto = pnl.trim();
  const pnlValido = pnlTexto === "" || Number.isFinite(Number(pnlTexto));
  const puedeGuardar = outcome !== null && pnlValido && !guardando;

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const cuerpo = {
        outcome,
        pnl_net: pnlTexto === "" ? null : pnlTexto,
        notes: notas.trim() === "" ? null : notas.trim(),
      };
      const nuevo = esCorreccion
        ? await updateSetupResult(setup.id, cuerpo)
        : await registerSetupResult(setup.id, cuerpo);
      onGuardado(nuevo);
    } catch (fallo) {
      if (fallo.isAborted) return;
      setError(fallo);
      setGuardando(false);
    }
  }

  return (
    <div className="mt-3 rounded border border-line bg-surface px-3 py-3">
      <div className="flex flex-wrap gap-2">
        {["WIN", "LOSS", "BREAKEVEN"].map((codigo) => {
          const activa = outcome === codigo;
          return (
            <button
              key={codigo}
              type="button"
              onClick={() => setOutcome(codigo)}
              aria-pressed={activa}
              className={`rounded border px-3 py-1.5 text-sm transition-colors ${
                activa
                  ? CLASE_OUTCOME[codigo]
                  : "border-line text-ink-dim hover:border-ink-faint hover:text-ink"
              }`}
            >
              {ETIQUETA_OUTCOME[codigo]}
            </button>
          );
        })}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-[11px] uppercase tracking-wider text-ink-faint">
            PnL neto (opcional, puede ser negativo)
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={pnl}
            onChange={(e) => setPnl(e.target.value)}
            placeholder="-25.75"
            className={`mt-1 w-full rounded border bg-base px-3 py-2 text-sm text-ink tabular-nums outline-none focus:border-ink-faint ${
              pnlValido ? "border-line" : "border-short/60"
            }`}
          />
          {!pnlValido && (
            <span className="mt-1 block text-xs text-short">No es un número válido.</span>
          )}
        </label>

        <label className="block">
          <span className="text-[11px] uppercase tracking-wider text-ink-faint">
            Notas de cierre (opcional)
          </span>
          <input
            type="text"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            maxLength={2000}
            placeholder="Cerró en el stop, salida anticipada…"
            className="mt-1 w-full rounded border border-line bg-base px-3 py-2 text-sm text-ink outline-none focus:border-ink-faint"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={guardar}
          disabled={!puedeGuardar}
          className="rounded border border-ink px-3 py-1.5 text-sm text-ink transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:border-line disabled:text-ink-faint"
        >
          {guardando ? "Guardando…" : esCorreccion ? "Guardar corrección" : "Guardar resultado"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="text-xs text-ink-faint transition-colors hover:text-ink"
        >
          Cancelar
        </button>
        {outcome === null && (
          <span className="text-xs text-ink-faint">Elige cómo terminó.</span>
        )}
      </div>

      {error && (
        <div className="animate-fade-in mt-3 rounded border border-short/40 bg-short-deep/30 px-3 py-2">
          <div className="text-xs text-short">{error.code}</div>
          <div className="mt-0.5 text-sm leading-relaxed text-ink">{error.message}</div>
        </div>
      )}
    </div>
  );
}
