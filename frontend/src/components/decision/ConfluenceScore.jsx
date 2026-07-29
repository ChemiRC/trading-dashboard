import { conSigno, tono } from "../../lib/format.js";

/**
 * Desglose de la aportación con signo de cada indicador. El total se lee
 * directamente de `evaluation.raw_balance` -- nunca se recalcula sumando las
 * filas en el cliente -- para que sea imposible que este panel y el
 * Decision Panel se desincronicen: los dos leen el mismo campo.
 */
export default function ConfluenceScore({ status, evaluation, error }) {
  return (
    <section className="rounded-lg border border-line bg-surface overflow-hidden">
      <h2 className="border-b border-line px-4 py-2.5 text-xs uppercase tracking-widest text-ink-dim">
        Confluence Score
      </h2>

      {status === "error" && (
        <div className="px-4 py-4 text-ink-dim">
          {error?.message ?? "No se puede calcular el desglose."}
        </div>
      )}

      {status === "incompleto" && (
        <div className="px-4 py-6 text-ink-dim">
          El desglose aparece en cuanto respondas los seis indicadores.
        </div>
      )}

      {status === "cargando" && (
        <div className="animate-pulse px-4 py-6 text-ink-dim">Calculando…</div>
      )}

      {status === "ok" && evaluation && (
        <>
          <ul className="divide-y divide-line">
            {evaluation.contributions.map((c) => (
              <li
                key={c.indicator_code}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 py-2.5 text-sm"
              >
                <span>
                  <span className="text-ink">{c.indicator_name}</span>{" "}
                  <span className="text-ink-dim">{c.option_label}</span>
                </span>
                <span className={`tabular-nums ${tono(c.points)}`}>{conSigno(c.points)}</span>
              </li>
            ))}
          </ul>

          <div className="flex items-baseline justify-between border-t border-line bg-raised px-4 py-3">
            <span className="text-xs uppercase tracking-widest text-ink-dim">Total</span>
            <span
              className={`text-lg tabular-nums ${
                evaluation.raw_balance == null ? "text-flat" : tono(evaluation.raw_balance)
              }`}
            >
              {evaluation.raw_balance == null ? "—" : conSigno(evaluation.raw_balance)}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
