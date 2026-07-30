import AnimatedNumber from "../ui/AnimatedNumber.jsx";
import Spinner from "../ui/Spinner.jsx";
import { conSigno } from "../../lib/format.js";

/**
 * Veredicto principal: decisión, dirección deducida, balance con signo y la
 * barra que lo hace comparable de un vistazo. Es el primer panel que mira el
 * trader, así que la barra es el elemento dominante -- ocupa el ancho
 * completo y es lo último y más grande que se pinta.
 */

const ETIQUETA_DECISION = {
  LONG: "LONG",
  SHORT: "SHORT",
  NO_TRADE: "NO TRADE",
};

const CLASE_PILDORA = {
  LONG: "border-long/50 bg-long-deep/40 text-long",
  SHORT: "border-short/50 bg-short-deep/40 text-short",
  NO_TRADE: "border-line bg-raised text-flat",
};

function colorDireccion(direction) {
  if (direction === "LONG") return "text-long";
  if (direction === "SHORT") return "text-short";
  return "text-flat";
}

function colorBalance(n) {
  if (n > 0) return "text-long";
  if (n < 0) return "text-short";
  return "text-flat";
}

/**
 * Barra divergente centrada en 0. Crece a la derecha (verde) si el balance es
 * positivo, a la izquierda (rojo) si es negativo. Dentro de -5..+5 -- o sin
 * balance todavía, bajo la Regla A -- se pinta neutral: ahí no hay
 * convicción que mostrar.
 *
 * Los dos rellenos (long/short) se pintan SIEMPRE, con ancho 0 cuando no
 * aplican, en vez de montarse y desmontarse condicionalmente. Es lo que
 * permite animar la transición: si el div del lado LONG desapareciera del DOM
 * al pasar a SHORT, no habría nada que el navegador pudiera interpolar -- el
 * cambio de ancho de 0% a X% sobre el MISMO elemento sí se anima, como el
 * movimiento de una aguja entre dos lecturas.
 */
function BalanceBar({ rawBalance, maxAbsBalance }) {
  const max = maxAbsBalance || 100;
  const esNulo = rawBalance === null || rawBalance === undefined;
  const clamped = esNulo ? 0 : Math.max(-max, Math.min(max, rawBalance));
  const esNeutral = esNulo || Math.abs(clamped) <= 5;
  const esLong = !esNeutral && clamped > 0;
  const anchoMitad = esNeutral ? 0 : (Math.abs(clamped) / max) * 50;

  return (
    <div>
      <div className="relative h-6 overflow-hidden rounded bg-raised">
        {/* Línea base en 0: separa el lado LONG del lado SHORT. */}
        <div className="absolute inset-y-0 left-1/2 z-10 w-0.5 -translate-x-1/2 bg-base" />

        <div
          className="absolute inset-y-0 left-1/2 rounded-r-[4px] bg-long transition-[width] duration-300 ease-out"
          style={{ width: `${esLong ? anchoMitad : 0}%` }}
        />
        <div
          className="absolute inset-y-0 right-1/2 rounded-l-[4px] bg-short transition-[width] duration-300 ease-out"
          style={{ width: `${!esLong && !esNeutral ? anchoMitad : 0}%` }}
        />
        <div
          className={`absolute inset-y-0 left-1/2 w-2 -translate-x-1/2 rounded-full bg-flat transition-opacity duration-300 ${
            esNeutral && !esNulo ? "opacity-100" : "opacity-0"
          }`}
        />
      </div>

      <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-ink-faint">
        <span>SHORT −{max}</span>
        <span>0</span>
        <span>LONG +{max}</span>
      </div>
    </div>
  );
}

export default function DecisionPanel({ status, evaluation, error, maxAbsBalance }) {
  const cargando = status === "cargando";
  const esNoTrade = evaluation?.decision === "NO_TRADE";

  return (
    <section
      className={`rounded-lg border overflow-hidden transition-colors duration-300 ${
        status === "ok" && esNoTrade
          ? "border-flat/40 bg-flat/5"
          : "border-line bg-surface"
      }`}
    >
      <h2 className="flex items-center justify-between border-b border-line px-4 py-2.5 text-xs uppercase tracking-widest text-ink-dim">
        Decisión
        {cargando && evaluation && <Spinner />}
      </h2>

      {status === "error" && (
        <div className="animate-fade-in space-y-2 px-5 py-5">
          <div className="text-short">{error?.code}</div>
          <div className="text-ink">{error?.message}</div>
        </div>
      )}

      {status === "incompleto" && (
        <div className="px-5 py-8 text-ink-dim">
          Responde todos los indicadores para ver el veredicto.
        </div>
      )}

      {cargando && !evaluation && (
        <div className="animate-pulse px-5 py-8 text-ink-dim">Evaluando…</div>
      )}

      {(status === "ok" || cargando) && evaluation && (
        <div
          className={`px-5 py-5 transition-opacity duration-200 ${
            cargando ? "opacity-50" : "opacity-100"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span
              className={`inline-flex items-center rounded border px-3 py-1 text-sm uppercase tracking-widest transition-colors duration-300 ${
                CLASE_PILDORA[evaluation.decision] ?? CLASE_PILDORA.NO_TRADE
              }`}
            >
              {ETIQUETA_DECISION[evaluation.decision] ?? evaluation.decision}
            </span>
            <span className="text-xs text-ink-faint">
              dirección deducida:{" "}
              <span className={colorDireccion(evaluation.direction)}>
                {evaluation.direction ?? "—"}
              </span>
            </span>
          </div>

          <AnimatedNumber
            valor={evaluation.raw_balance}
            formatear={(n) => conSigno(Math.round(n))}
            claseColor={colorBalance}
            className="mt-4 block text-6xl leading-none tabular-nums"
          />

          <div className="mt-6">
            <BalanceBar rawBalance={evaluation.raw_balance} maxAbsBalance={maxAbsBalance} />
          </div>
        </div>
      )}
    </section>
  );
}
