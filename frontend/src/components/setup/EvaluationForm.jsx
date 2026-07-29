import { useEffect, useState } from "react";

import { getCatalog } from "../../api/config.js";
import { evaluateSetup } from "../../api/setups.js";
import { conSigno, tono } from "../../lib/format.js";
import SaveSetupPanel from "./SaveSetupPanel.jsx";

/**
 * Formulario de evaluación pre-trade.
 *
 * Componente puro: no decide qué hacer con el resultado, solo lo consigue.
 * Los indicadores y sus opciones vienen enteros del catálogo (nada
 * hardcodeado), y cada cambio de opción dispara `POST /api/setups/evaluate`
 * -- sin guardar -- en cuanto hay una respuesta para los seis. El resultado
 * (y el catálogo que lo hizo posible) se pasa hacia arriba por `onResult`;
 * quien monte el formulario decide qué pintar con eso -- hoy el Decision
 * Panel, el Confluence Score y el Permission Panel de `SetupEvaluation.jsx`.
 */
export default function EvaluationForm({ onResult }) {
  const [estado, setEstado] = useState("cargando"); // cargando | ok | error
  const [catalogo, setCatalogo] = useState(null);
  const [errorCatalogo, setErrorCatalogo] = useState(null);
  const [selections, setSelections] = useState({});
  //: Solo para el aviso del panel de guardado, que cambia de texto cuando el
  //: veredicto es NO TRADE. El veredicto que se guarda no sale de aquí: lo
  //: recalcula el backend a partir de las mismas `selections`.
  const [decision, setDecision] = useState(null);

  // El catálogo se pide una vez. Sus defaults son el punto de partida del
  // formulario: el trader solo tiene que tocar lo que discrepe de ellos.
  useEffect(() => {
    const controlador = new AbortController();

    getCatalog({ signal: controlador.signal })
      .then((datos) => {
        setCatalogo(datos);
        setSelections({ ...datos.defaults });
        setEstado("ok");
      })
      .catch((fallo) => {
        if (fallo.isAborted) return;
        setErrorCatalogo(fallo);
        setEstado("error");
      });

    return () => controlador.abort();
  }, []);

  const indicadores = catalogo?.indicators ?? [];
  const completo =
    indicadores.length > 0 && indicadores.every((ind) => ind.code in selections);

  // El backend rechaza con SELECTION_INVALID si falta algún indicador por
  // responder, así que ni se intenta hasta que estén los seis. El catálogo
  // viaja también en cada evento: los paneles que consumen `onResult` lo
  // necesitan (umbrales, max_abs_balance) y no tiene sentido que lo pidan
  // otra vez.
  useEffect(() => {
    if (!completo) {
      setDecision(null);
      onResult?.({
        status: "incompleto",
        evaluation: null,
        error: null,
        selections,
        catalog: catalogo,
      });
      return;
    }

    const controlador = new AbortController();
    onResult?.({
      status: "cargando",
      evaluation: null,
      error: null,
      selections,
      catalog: catalogo,
    });

    evaluateSetup(selections, { signal: controlador.signal })
      .then((evaluation) => {
        setDecision(evaluation.decision);
        onResult?.({ status: "ok", evaluation, error: null, selections, catalog: catalogo });
      })
      .catch((fallo) => {
        if (fallo.isAborted) return;
        onResult?.({
          status: "error",
          evaluation: null,
          error: fallo,
          selections,
          catalog: catalogo,
        });
      });

    return () => controlador.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selections, completo]);

  function elegir(indicatorCode, optionCode) {
    setSelections((prev) => ({ ...prev, [indicatorCode]: optionCode }));
  }

  if (estado === "cargando") {
    return (
      <section className="rounded-lg border border-line bg-surface px-4 py-6">
        <p className="animate-pulse text-ink-dim">Cargando catálogo…</p>
      </section>
    );
  }

  if (estado === "error") {
    return (
      <section className="rounded-lg border border-short/40 bg-short-deep/30 overflow-hidden">
        <h2 className="border-b border-short/30 px-4 py-2.5 text-xs uppercase tracking-widest text-short">
          Sin conexión con el backend
        </h2>
        <div className="space-y-2 px-4 py-4">
          <div className="text-short">{errorCatalogo.code}</div>
          <div className="text-ink">{errorCatalogo.message}</div>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-line bg-surface overflow-hidden">
        <h2 className="border-b border-line px-4 py-2.5 text-xs uppercase tracking-widest text-ink-dim">
          Evaluación de setup
        </h2>
        <ul className="divide-y divide-line">
          {indicadores.map((indicador) => (
            <IndicatorField
              key={indicador.code}
              indicador={indicador}
              valor={selections[indicador.code] ?? null}
              onElegir={(optionCode) => elegir(indicador.code, optionCode)}
            />
          ))}
        </ul>
      </section>

      <SaveSetupPanel selections={selections} completo={completo} decision={decision} />
    </div>
  );
}

function IndicatorField({ indicador, valor, onElegir }) {
  return (
    <li className="px-4 py-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-ink">{indicador.name}</span>
        {indicador.is_gate && (
          <span className="rounded border border-cls-medium/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-cls-medium">
            puerta · regla A
          </span>
        )}
        {valor === null && (
          <span className="rounded border border-short/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-short">
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
              className={`rounded border px-3 py-1.5 text-sm transition-colors ${
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
