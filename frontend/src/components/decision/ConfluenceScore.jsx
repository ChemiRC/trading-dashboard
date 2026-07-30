import { useEffect, useRef, useState } from "react";

import AnimatedNumber from "../ui/AnimatedNumber.jsx";
import Spinner from "../ui/Spinner.jsx";
import { conSigno, tono } from "../../lib/format.js";

/**
 * Desglose de la aportación con signo de cada indicador. El total se lee
 * directamente de `evaluation.raw_balance` -- nunca se recalcula sumando las
 * filas en el cliente -- para que sea imposible que este panel y el
 * Decision Panel se desincronicen: los dos leen el mismo campo.
 *
 * La mini-barra de cada fila usa `ratio` tal cual lo manda el backend
 * (`points / max_weight`, de -1 a 1): ya viene pensada para esto, así que
 * pintarla es leerla, no calcularla.
 */

/**
 * Qué filas cambiaron de opción desde la última vez, para destacarlas un
 * instante. Compara por `indicator_code` -> `option_code`, no por índice: el
 * orden de `contributions` no cambia entre evaluaciones, pero comparar el
 * contenido y no la posición es lo que hace esto correcto si algún día sí lo
 * hiciera. En la primera carga no hay "antes" con que comparar, así que no
 * destaca nada -- solo importa lo que cambia de una evaluación a la siguiente.
 */
function useFilasCambiadas(contributions) {
  const [cambiadas, setCambiadas] = useState(() => new Set());
  const anteriorRef = useRef(null);

  useEffect(() => {
    if (!contributions) return undefined;

    const anterior = anteriorRef.current;
    anteriorRef.current = new Map(contributions.map((c) => [c.indicator_code, c.option_code]));

    if (!anterior) return undefined;

    const nuevas = new Set();
    for (const c of contributions) {
      if (anterior.get(c.indicator_code) !== c.option_code) nuevas.add(c.indicator_code);
    }
    if (nuevas.size === 0) return undefined;

    setCambiadas(nuevas);
    const t = setTimeout(() => setCambiadas(new Set()), 700);
    return () => clearTimeout(t);
  }, [contributions]);

  return cambiadas;
}

/** Barra diminuta centrada en 0, el mismo esquema que la del Decision Panel a escala de fila. */
function MiniBarra({ ratio }) {
  const esLong = ratio > 0;
  const ancho = Math.min(Math.abs(ratio), 1) * 50;

  return (
    <div className="relative h-1 w-16 shrink-0 overflow-hidden rounded-full bg-raised">
      <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
      <div
        className="absolute inset-y-0 left-1/2 rounded-r-full bg-long transition-[width] duration-300 ease-out"
        style={{ width: `${esLong ? ancho : 0}%` }}
      />
      <div
        className="absolute inset-y-0 right-1/2 rounded-l-full bg-short transition-[width] duration-300 ease-out"
        style={{ width: `${!esLong ? ancho : 0}%` }}
      />
    </div>
  );
}

function colorTotal(n) {
  if (n > 0) return "text-long";
  if (n < 0) return "text-short";
  return "text-flat";
}

export default function ConfluenceScore({ status, evaluation, error }) {
  const cargando = status === "cargando";
  const cambiadas = useFilasCambiadas(evaluation?.contributions);

  return (
    <section className="rounded-lg border border-line bg-surface overflow-hidden">
      <h2 className="flex items-center justify-between border-b border-line px-4 py-2.5 text-xs uppercase tracking-widest text-ink-dim">
        Confluence Score
        {cargando && evaluation && <Spinner />}
      </h2>

      {status === "error" && (
        <div className="animate-fade-in px-4 py-4 text-ink-dim">
          {error?.message ?? "No se puede calcular el desglose."}
        </div>
      )}

      {status === "incompleto" && (
        <div className="px-4 py-6 text-ink-dim">
          El desglose aparece en cuanto respondas los seis indicadores.
        </div>
      )}

      {cargando && !evaluation && (
        <div className="animate-pulse px-4 py-6 text-ink-dim">Calculando…</div>
      )}

      {(status === "ok" || cargando) && evaluation && (
        <div className={`transition-opacity duration-200 ${cargando ? "opacity-50" : "opacity-100"}`}>
          <ul className="divide-y divide-line">
            {evaluation.contributions.map((c) => (
              <li
                key={c.indicator_code}
                title={c.option_label}
                className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm ${
                  cambiadas.has(c.indicator_code) ? "animate-flash" : ""
                }`}
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-ink">{c.indicator_name}</span>{" "}
                  <span className="text-ink-dim">{c.option_label}</span>
                </span>
                <MiniBarra ratio={c.ratio} />
                <span className={`w-12 shrink-0 text-right tabular-nums ${tono(c.points)}`}>
                  {conSigno(c.points)}
                </span>
              </li>
            ))}
          </ul>

          <div className="flex items-baseline justify-between border-t border-line bg-raised px-4 py-3">
            <span className="text-xs uppercase tracking-widest text-ink-dim">Total</span>
            <AnimatedNumber
              valor={evaluation.raw_balance}
              formatear={(n) => conSigno(Math.round(n))}
              claseColor={colorTotal}
              className="text-lg tabular-nums"
            />
          </div>
        </div>
      )}
    </section>
  );
}
