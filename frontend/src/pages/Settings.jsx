import { useCallback, useEffect, useState } from "react";

import { getCatalog, getConfigHealth } from "../api/config.js";
import ConfigHealth from "../components/settings/ConfigHealth.jsx";
import IndicatorSettings from "../components/settings/IndicatorSettings.jsx";
import ThresholdSettings from "../components/settings/ThresholdSettings.jsx";

/**
 * Punto de montaje de la entrega 9.
 *
 * La pantalla que hace verdad la frase del README: pesos, opciones y umbrales
 * viven en la base de datos, no en el código, y se editan desde aquí sin
 * redesplegar nada.
 *
 * Es la única dueña de la carga: las secciones editables no piden datos, los
 * reciben, y avisan por `onGuardado` cuando algo se guardó. Así hay un solo
 * sitio que sabe cuándo hay que volver a preguntarle a la base de datos.
 */
export default function Settings() {
  const [catalogo, setCatalogo] = useState(null);
  const [salud, setSalud] = useState(null);
  const [error, setError] = useState(null);
  const [errorSalud, setErrorSalud] = useState(null);

  const recargar = useCallback(async (signal) => {
    // El catálogo y la salud se piden juntos y se tratan por separado: que la
    // vista de salud falle no puede dejar la pantalla sin poder editarse.
    const [cat, sal] = await Promise.allSettled([
      getCatalog({ signal }),
      getConfigHealth({ signal }),
    ]);

    if (cat.status === "fulfilled") {
      setCatalogo(cat.value);
      setError(null);
    } else if (!cat.reason?.isAborted) {
      setError(cat.reason);
    }

    if (sal.status === "fulfilled") {
      setSalud(sal.value);
      setErrorSalud(null);
    } else if (!sal.reason?.isAborted) {
      setErrorSalud(sal.reason);
    }
  }, []);

  useEffect(() => {
    const controlador = new AbortController();
    recargar(controlador.signal);
    return () => controlador.abort();
  }, [recargar]);

  const alGuardar = useCallback(() => recargar(), [recargar]);

  return (
    <div className="min-h-screen bg-base px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header>
          <h1 className="text-xl text-ink">Trading Dashboard</h1>
          <p className="mt-1 text-sm text-ink-dim">Configuración de la estrategia</p>
        </header>

        {/* La duda que tiene todo el mundo la primera vez que baja un peso.
            Está garantizado por el esquema —cada setup guarda congelados los
            puntos que se le aplicaron— pero si el trader no lo sabe, no se
            atreve a tocar nada. */}
        <section className="rounded-lg border border-line bg-raised px-4 py-3">
          <div className="text-[11px] uppercase tracking-wider text-ink-faint">
            Antes de tocar nada
          </div>
          <p className="mt-1 text-sm leading-relaxed text-ink">
            Cambiar un peso, unos puntos o una banda{" "}
            <span className="text-long">no reescribe el histórico</span>. Cada setup ya
            guardado conserva congelados los puntos que se le aplicaron el día que se
            evaluó. Lo que se edita aquí solo afecta a los setups{" "}
            <span className="text-ink">nuevos</span>, y es lo que hace que el histórico
            siga siendo comparable entre meses aunque la estrategia cambie.
          </p>
        </section>

        {error && (
          <section className="animate-fade-in rounded-lg border border-short/40 bg-short-deep/30 overflow-hidden">
            <h2 className="border-b border-short/30 px-4 py-2.5 text-xs uppercase tracking-widest text-short">
              Sin conexión con el backend
            </h2>
            <div className="space-y-1 px-4 py-4">
              <div className="text-short">{error.code}</div>
              <div className="text-ink">{error.message}</div>
            </div>
          </section>
        )}

        {!error && <ConfigHealth salud={salud} error={errorSalud} />}

        {!error && !catalogo && (
          <section className="rounded-lg border border-line bg-surface px-4 py-6">
            <p className="animate-pulse text-ink-dim">Cargando configuración…</p>
          </section>
        )}

        {catalogo && (
          <>
            <IndicatorSettings
              indicadores={catalogo.indicators}
              onGuardado={alGuardar}
            />
            <ThresholdSettings umbrales={catalogo.thresholds} onGuardado={alGuardar} />
          </>
        )}
      </div>
    </div>
  );
}
