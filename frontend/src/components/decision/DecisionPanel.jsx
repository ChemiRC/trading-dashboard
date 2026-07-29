import { conSigno, tono } from "../../lib/format.js";

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

/**
 * Barra divergente centrada en 0. Crece a la derecha (verde) si el balance es
 * positivo, a la izquierda (rojo) si es negativo. Dentro de -5..+5 -- o sin
 * balance todavía, bajo la Regla A -- se pinta neutral: ahí no hay
 * convicción que mostrar.
 */
function BalanceBar({ rawBalance, maxAbsBalance }) {
  const max = maxAbsBalance || 100;
  const esNulo = rawBalance === null || rawBalance === undefined;
  const clamped = esNulo ? 0 : Math.max(-max, Math.min(max, rawBalance));
  const esNeutral = esNulo || Math.abs(clamped) <= 5;
  const esLong = !esNeutral && clamped > 0;
  const anchoMitad = (Math.abs(clamped) / max) * 50;

  return (
    <div>
      <div className="relative h-6 overflow-hidden rounded bg-raised">
        {/* Línea base en 0: separa el lado LONG del lado SHORT. */}
        <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-base" />

        {!esNeutral && esLong && (
          <div
            className="absolute inset-y-0 left-1/2 rounded-r-[4px] bg-long"
            style={{ width: `${anchoMitad}%` }}
          />
        )}
        {!esNeutral && !esLong && (
          <div
            className="absolute inset-y-0 right-1/2 rounded-l-[4px] bg-short"
            style={{ width: `${anchoMitad}%` }}
          />
        )}
        {esNeutral && !esNulo && (
          <div className="absolute inset-y-0 left-1/2 w-2 -translate-x-1/2 rounded-full bg-flat" />
        )}
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
  return (
    <section className="rounded-lg border border-line bg-surface overflow-hidden">
      <h2 className="border-b border-line px-4 py-2.5 text-xs uppercase tracking-widest text-ink-dim">
        Decisión
      </h2>

      {status === "error" && (
        <div className="space-y-2 px-5 py-5">
          <div className="text-short">{error?.code}</div>
          <div className="text-ink">{error?.message}</div>
        </div>
      )}

      {status === "incompleto" && (
        <div className="px-5 py-8 text-ink-dim">
          Responde todos los indicadores para ver el veredicto.
        </div>
      )}

      {status === "cargando" && (
        <div className="animate-pulse px-5 py-8 text-ink-dim">Evaluando…</div>
      )}

      {status === "ok" && evaluation && (
        <div className="px-5 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span
              className={`inline-flex items-center rounded border px-3 py-1 text-sm uppercase tracking-widest ${
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

          <div
            className={`mt-4 text-6xl leading-none tabular-nums ${
              evaluation.raw_balance == null ? "text-flat" : tono(evaluation.raw_balance)
            }`}
          >
            {evaluation.raw_balance == null ? "—" : conSigno(evaluation.raw_balance)}
          </div>

          <div className="mt-6">
            <BalanceBar rawBalance={evaluation.raw_balance} maxAbsBalance={maxAbsBalance} />
          </div>
        </div>
      )}
    </section>
  );
}
