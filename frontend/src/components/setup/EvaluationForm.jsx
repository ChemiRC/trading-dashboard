import { conSigno, tono } from "../../lib/format.js";

/**
 * Formulario de evaluación pre-trade: las seis preguntas y sus opciones.
 *
 * Presentacional del todo. No pide el catálogo, no llama a `/evaluate` y no
 * guarda nada: recibe lo que hay que pintar y avisa de lo que el trader
 * marca. El estado vive en `useEvaluacion`, por encima de las pestañas, para
 * que salir de «Evaluación» y volver no lo tire (ver ese hook).
 *
 * Los indicadores y sus opciones vienen enteros del catálogo: aquí no hay ni
 * un peso ni un nombre escrito.
 */
export default function EvaluationForm({
  estadoCatalogo,
  errorCatalogo,
  indicadores,
  selections,
  onElegir,
}) {
  if (estadoCatalogo === "cargando") {
    return (
      <section className="rounded-lg border border-line bg-surface px-4 py-6">
        <p className="animate-pulse text-ink-dim">Cargando catálogo…</p>
      </section>
    );
  }

  if (estadoCatalogo === "error") {
    return (
      <section className="animate-fade-in rounded-lg border border-short/40 bg-short-deep/30 overflow-hidden">
        <h2 className="border-b border-short/30 px-4 py-2.5 text-xs uppercase tracking-widest text-short">
          Sin conexión con el backend
        </h2>
        <div className="space-y-2 px-4 py-4">
          <div className="text-short">{errorCatalogo?.code}</div>
          <div className="text-ink">{errorCatalogo?.message}</div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-line bg-surface overflow-hidden">
      <h2 className="border-b border-line px-4 py-2.5 text-xs uppercase tracking-widest text-ink-dim">
        Qué ves en el gráfico
      </h2>
      <ul className="divide-y divide-line">
        {indicadores.map((indicador) => (
          <IndicatorField
            key={indicador.code}
            indicador={indicador}
            valor={selections[indicador.code] ?? null}
            onElegir={(optionCode) => onElegir(indicador.code, optionCode)}
          />
        ))}
      </ul>
    </section>
  );
}

function IndicatorField({ indicador, valor, onElegir }) {
  return (
    <li
      className={`px-4 py-4 ${
        // El indicador puerta es estructuralmente distinto -- puede bloquear
        // todo el resultado (Regla A) -- así que se insinúa con un acento en
        // el borde izquierdo antes de que nadie llegue a leer la etiqueta.
        // El resto de la fila no lleva tinte: solo el canto, para que siga
        // leyéndose como parte de la misma lista y no como una tarjeta aparte.
        indicador.is_gate ? "border-l-2 border-l-cls-medium bg-cls-medium/[0.03]" : ""
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-ink">{indicador.name}</span>
        {indicador.is_gate && (
          <span className="rounded border border-cls-medium/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-cls-medium">
            puerta · regla A
          </span>
        )}
        {valor === null && (
          <span className="animate-fade-in rounded border border-short/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-short">
            sin responder
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {indicador.options.map((opcion) => {
          const activa = opcion.code === valor;
          return (
            <button
              key={opcion.code}
              type="button"
              onClick={() => onElegir(opcion.code)}
              aria-pressed={activa}
              className={`rounded border px-3 py-1.5 text-sm transition-all duration-150 active:scale-[0.96] ${
                activa
                  ? "border-ink bg-raised text-ink"
                  : "border-line text-ink-dim hover:border-ink-faint hover:text-ink"
              }`}
            >
              <span>{opcion.label}</span>
              <span className={`ml-2 tabular-nums ${tono(opcion.points)}`}>
                {conSigno(opcion.points)}
              </span>
            </button>
          );
        })}
      </div>
    </li>
  );
}
