import { useEffect, useState } from "react";

import { API_BASE_URL } from "../api/client.js";
import { getCatalog } from "../api/config.js";
import { conSigno, tono } from "../lib/format.js";

/**
 * Pantalla de diagnóstico. NO es un panel del producto.
 *
 * Existe para responder una sola pregunta antes de construir nada visual: ¿el
 * frontend arranca, llama al backend real, recibe el catálogo que hay sembrado
 * en Supabase y lo pinta? Cuando la entrega 6 traiga el formulario de verdad,
 * esta pantalla se queda como herramienta de diagnóstico o se borra.
 *
 * Por eso enseña los datos crudos y sin interpretar: aquí no se decide nada,
 * solo se demuestra que la cadena completa funciona de punta a punta.
 */

/**
 * Los `color_token` vienen de la base de datos ('strong', 'good', 'medium',
 * 'none'). El mapa es explícito y con las clases escritas enteras porque
 * Tailwind rastrea el código fuente buscando literales: un `text-cls-${token}`
 * construido al vuelo no generaría ninguna de estas clases.
 */
const CLASE_POR_TOKEN = {
  strong: "text-cls-strong",
  good: "text-cls-good",
  medium: "text-cls-medium",
  none: "text-cls-none",
};

function Panel({ titulo, children, className = "" }) {
  return (
    <section
      className={`rounded-lg border border-line bg-surface overflow-hidden ${className}`}
    >
      <h2 className="border-b border-line px-4 py-2.5 text-xs uppercase tracking-widest text-ink-dim">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Dato({ etiqueta, valor, className = "text-ink" }) {
  return (
    <div className="px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-ink-faint">
        {etiqueta}
      </div>
      <div className={`mt-1 text-lg ${className}`}>{valor}</div>
    </div>
  );
}

export default function ConnectionCheck() {
  const [estado, setEstado] = useState("cargando");
  const [catalogo, setCatalogo] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controlador = new AbortController();

    getCatalog({ signal: controlador.signal })
      .then((datos) => {
        setCatalogo(datos);
        setEstado("ok");
      })
      .catch((fallo) => {
        // StrictMode monta, desmonta y vuelve a montar en desarrollo, así que
        // la primera petición se cancela siempre. Eso no es un fallo que
        // enseñar: la segunda es la que cuenta.
        if (fallo.isAborted) return;
        setError(fallo);
        setEstado("error");
      });

    return () => controlador.abort();
  }, []);

  const sumaPesos = catalogo
    ? catalogo.indicators.reduce((total, i) => total + i.max_weight, 0)
    : null;

  return (
    <div className="min-h-screen bg-base px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-wrap items-baseline justify-between gap-3 pr-14 sm:pr-0">
          <div>
            <h1 className="text-xl text-ink">Trading Dashboard</h1>
            <p className="mt-1 text-sm text-ink-dim">
              Comprobación de conexión con el backend
            </p>
          </div>
          <code className="rounded border border-line bg-surface px-2.5 py-1 text-xs text-ink-dim">
            {API_BASE_URL}
          </code>
        </header>

        {estado === "cargando" && (
          <Panel titulo="Estado">
            <p className="animate-pulse px-4 py-6 text-ink-dim">
              Pidiendo <span className="text-ink">GET /api/config/catalog</span>…
            </p>
          </Panel>
        )}

        {estado === "error" && (
          <section className="rounded-lg border border-short/40 bg-short-deep/30 overflow-hidden">
            <h2 className="border-b border-short/30 px-4 py-2.5 text-xs uppercase tracking-widest text-short">
              Sin conexión con el backend
            </h2>
            <div className="space-y-3 px-4 py-4">
              <div>
                <span className="text-[11px] uppercase tracking-wider text-ink-faint">
                  Código
                </span>
                <div className="mt-0.5 text-short">{error.code}</div>
              </div>
              <div>
                <span className="text-[11px] uppercase tracking-wider text-ink-faint">
                  Mensaje
                </span>
                <div className="mt-0.5 leading-relaxed text-ink">{error.message}</div>
              </div>
              <p className="border-t border-short/20 pt-3 text-sm text-ink-dim">
                Levanta el backend con{" "}
                <code className="text-ink">uvicorn app.main:app --reload</code> desde{" "}
                <code className="text-ink">backend/</code> y recarga esta página.
              </p>
            </div>
          </section>
        )}

        {estado === "ok" && (
          <>
            <section className="rounded-lg border border-long/40 bg-long-deep/30 px-4 py-3">
              <span className="text-long">✓ Conectado.</span>{" "}
              <span className="text-ink-dim">
                El catálogo viene de Supabase, no del código de este frontend.
              </span>
            </section>

            <Panel titulo="Resumen">
              <div className="grid grid-cols-2 divide-x divide-line sm:grid-cols-4">
                <Dato etiqueta="Indicadores" valor={catalogo.indicators.length} />
                <Dato
                  etiqueta="Suma de pesos"
                  valor={sumaPesos}
                  className={
                    sumaPesos === 100 ? "text-lg text-long" : "text-lg text-cls-medium"
                  }
                />
                <Dato
                  etiqueta="Máximo teórico"
                  valor={`±${catalogo.max_abs_balance}`}
                />
                <Dato
                  etiqueta="Regla B"
                  valor={catalogo.rule_b_enabled ? "activa" : "desactivada"}
                  className={
                    catalogo.rule_b_enabled ? "text-lg text-ink" : "text-lg text-flat"
                  }
                />
              </div>
            </Panel>

            <Panel titulo={`Indicadores y opciones (${catalogo.indicators.length})`}>
              <ul className="divide-y divide-line">
                {catalogo.indicators.map((indicador) => (
                  <li key={indicador.code} className="px-4 py-4">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-ink">{indicador.name}</span>
                      <code className="text-xs text-ink-faint">{indicador.code}</code>
                      <span className="text-xs text-ink-dim">
                        peso {indicador.max_weight}
                      </span>
                      {indicador.is_gate && (
                        <span className="rounded border border-cls-medium/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-cls-medium">
                          puerta · regla A
                        </span>
                      )}
                      {!(indicador.code in catalogo.defaults) && (
                        <span className="rounded border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ink-faint">
                          sin valor por defecto
                        </span>
                      )}
                    </div>

                    <ul className="mt-3 space-y-1">
                      {indicador.options.map((opcion) => (
                        <li
                          key={opcion.code}
                          className="flex items-baseline justify-between gap-4 text-sm"
                        >
                          <span className="text-ink-dim">
                            {opcion.label}
                            {opcion.is_default && (
                              <span className="ml-2 text-[10px] uppercase tracking-wider text-ink-faint">
                                por defecto
                              </span>
                            )}
                          </span>
                          <span className={`tabular-nums ${tono(opcion.points)}`}>
                            {conSigno(opcion.points)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel titulo="Umbrales de clasificación">
              <ul className="divide-y divide-line">
                {catalogo.thresholds.map((banda) => (
                  <li
                    key={banda.code}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm"
                  >
                    <span
                      className={CLASE_POR_TOKEN[banda.color_token] ?? "text-ink"}
                    >
                      {banda.label}
                    </span>
                    <span className="flex items-baseline gap-4">
                      <span className="tabular-nums text-ink-dim">
                        |balance| {banda.min_abs_balance}–{banda.max_abs_balance}
                      </span>
                      <span
                        className={
                          banda.is_tradeable ? "text-xs text-long" : "text-xs text-flat"
                        }
                      >
                        {banda.is_tradeable ? "operable" : "no operar"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>

            <details className="rounded-lg border border-line bg-surface">
              <summary className="cursor-pointer px-4 py-2.5 text-xs uppercase tracking-widest text-ink-dim hover:text-ink">
                Respuesta cruda del backend
              </summary>
              <pre className="overflow-x-auto border-t border-line px-4 py-3 text-xs leading-relaxed text-ink-dim">
                {JSON.stringify(catalogo, null, 2)}
              </pre>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
