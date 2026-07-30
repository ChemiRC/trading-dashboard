import { useEffect, useState } from "react";

import { listSetups } from "../api/setups.js";
import SetupList from "../components/history/SetupList.jsx";

/**
 * Histórico de setups guardados, del más reciente al más antiguo.
 *
 * Paginación por "cargar más": el backend ya soporta `limit`/`offset` y aquí
 * solo se van acumulando páginas. Los filtros combinados (símbolo, decisión,
 * rango de balance) son de la Fase 4 -- `listSetups` ya acepta `symbol`, así
 * que añadirlos será pasar parámetros, no reestructurar esta pantalla.
 */

const LIMITE = 20;

export default function SetupHistory() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(null);
  const [estado, setEstado] = useState("cargando"); // cargando | ok | error | cargando-mas
  const [error, setError] = useState(null);
  const [abiertoId, setAbiertoId] = useState(null);

  useEffect(() => {
    const controlador = new AbortController();

    listSetups({ limit: LIMITE, offset: 0 }, { signal: controlador.signal })
      .then((pagina) => {
        setItems(pagina.items);
        setTotal(pagina.total);
        setEstado("ok");
      })
      .catch((fallo) => {
        if (fallo.isAborted) return;
        setError(fallo);
        setEstado("error");
      });

    return () => controlador.abort();
  }, []);

  async function cargarMas() {
    setEstado("cargando-mas");
    try {
      const pagina = await listSetups({ limit: LIMITE, offset: items.length });
      setItems((prev) => [...prev, ...pagina.items]);
      setTotal(pagina.total);
      setEstado("ok");
    } catch (fallo) {
      if (fallo.isAborted) return;
      setError(fallo);
      setEstado("error");
    }
  }

  const hayMas = total !== null && items.length < total;

  return (
    <div className="min-h-screen bg-base px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-xl text-ink">Trading Dashboard</h1>
            <p className="mt-1 text-sm text-ink-dim">Histórico de setups</p>
          </div>
          {estado !== "cargando" && total !== null && (
            <span className="tabular-nums text-xs text-ink-faint">
              {items.length} de {total}
            </span>
          )}
        </header>

        {estado === "cargando" && (
          <section className="rounded-lg border border-line bg-surface px-4 py-6">
            <p className="animate-pulse text-ink-dim">Cargando histórico…</p>
          </section>
        )}

        {estado === "error" && (
          <section className="rounded-lg border border-short/40 bg-short-deep/30 overflow-hidden">
            <h2 className="border-b border-short/30 px-4 py-2.5 text-xs uppercase tracking-widest text-short">
              No se pudo cargar el histórico
            </h2>
            <div className="space-y-1 px-4 py-4">
              <div className="text-short">{error.code}</div>
              <div className="text-ink">{error.message}</div>
            </div>
          </section>
        )}

        {(estado === "ok" || estado === "cargando-mas") && items.length === 0 && (
          <section className="rounded-lg border border-line bg-surface px-4 py-8 text-center">
            <p className="text-ink-dim">Todavía no hay setups guardados.</p>
            <p className="mt-2 text-sm text-ink-faint">
              Evalúa un setup en la pestaña «Evaluación de setup» y guárdalo — también los
              NO TRADE: registran las veces que te contuviste.
            </p>
          </section>
        )}

        {(estado === "ok" || estado === "cargando-mas") && items.length > 0 && (
          <section className="rounded-lg border border-line bg-surface overflow-hidden">
            <h2 className="border-b border-line px-4 py-2.5 text-xs uppercase tracking-widest text-ink-dim">
              Setups guardados
            </h2>
            <SetupList
              items={items}
              abiertoId={abiertoId}
              onToggle={(id) => setAbiertoId((prev) => (prev === id ? null : id))}
              onActualizado={(detalle) =>
                // El detalle devuelto por el registro trae el outcome nuevo; la
                // fila de la lista se actualiza sin recargar la página entera.
                setItems((prev) =>
                  prev.map((s) =>
                    s.id === detalle.id
                      ? { ...s, outcome: detalle.outcome, pnl_net: detalle.pnl_net, trade_id: detalle.trade_id }
                      : s,
                  ),
                )
              }
              onBorrado={(borradoId) => {
                setItems((prev) => prev.filter((s) => s.id !== borradoId));
                setTotal((prev) => (prev === null ? prev : prev - 1));
                setAbiertoId(null);
              }}
            />
            {hayMas && (
              <div className="border-t border-line px-4 py-3">
                <button
                  type="button"
                  onClick={cargarMas}
                  disabled={estado === "cargando-mas"}
                  className="rounded border border-line px-4 py-2 text-sm text-ink-dim transition-colors hover:border-ink-faint hover:text-ink disabled:cursor-not-allowed disabled:text-ink-faint"
                >
                  {estado === "cargando-mas"
                    ? "Cargando…"
                    : `Cargar más (${total - items.length} restantes)`}
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
