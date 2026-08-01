import { useCallback, useEffect, useState } from "react";

import { listTrades } from "../api/trades.js";
import SyncButton from "../components/trades/SyncButton.jsx";
import TradeList from "../components/trades/TradeList.jsx";
import Spinner from "../components/ui/Spinner.jsx";

/**
 * Operaciones ejecutadas: lo que de verdad pasó en el exchange.
 *
 * Pantalla aparte del Histórico a propósito. El Histórico responde "¿qué
 * decidí?" —setups, balance, disciplina— y esta responde "¿qué hice?". Son
 * preguntas distintas y con volúmenes distintos: doscientas operaciones
 * importadas mezcladas con los setups ahogarían justo lo que el Histórico
 * existe para medir. El vínculo entre ambas es la columna «Setup», que es el
 * puente y no la fusión de las dos tablas.
 */

const LIMITE = 50;

const FILTROS = [
  { id: "todas", etiqueta: "Todas", parametros: {} },
  { id: "bybit", etiqueta: "De Bybit", parametros: { source: "bybit" } },
  { id: "manual", etiqueta: "Manuales", parametros: { source: "manual" } },
  { id: "sin", etiqueta: "Sin vincular", parametros: { vinculadas: false } },
  { id: "con", etiqueta: "Vinculadas", parametros: { vinculadas: true } },
];

export default function Trades() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(null);
  const [estado, setEstado] = useState("cargando"); // cargando | ok | error | cargando-mas
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState("todas");

  const parametros = FILTROS.find((f) => f.id === filtro).parametros;

  const cargar = useCallback(
    async (signal) => {
      setEstado("cargando");
      try {
        const pagina = await listTrades(
          { ...parametros, limit: LIMITE, offset: 0 },
          { signal },
        );
        setItems(pagina.items);
        setTotal(pagina.total);
        setEstado("ok");
      } catch (fallo) {
        if (fallo.isAborted) return;
        setError(fallo);
        setEstado("error");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtro],
  );

  useEffect(() => {
    const controlador = new AbortController();
    cargar(controlador.signal);
    return () => controlador.abort();
  }, [cargar]);

  async function cargarMas() {
    setEstado("cargando-mas");
    try {
      const pagina = await listTrades({ ...parametros, limit: LIMITE, offset: items.length });
      setItems((prev) => [...prev, ...pagina.items]);
      setTotal(pagina.total);
      setEstado("ok");
    } catch (fallo) {
      if (fallo.isAborted) return;
      setError(fallo);
      setEstado("error");
    }
  }

  /** Una fila que acaba de cambiar de vínculo se actualiza en su sitio. */
  function actualizada(nueva) {
    setItems((prev) =>
      prev.map((t) => (t.id === nueva.id ? { ...t, ...nueva } : t)),
    );
    // El vínculo cambia lo que muestran los filtros de vinculadas/sin vincular,
    // así que si uno de esos está activo hay que releer: la fila podría ya no
    // pertenecer a la lista que se está viendo.
    if (filtro === "sin" || filtro === "con") cargar();
  }

  const hayMas = total !== null && items.length < total;

  return (
    <div className="min-h-screen bg-base px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-xl text-ink">Trading Dashboard</h1>
            <p className="mt-1 text-sm text-ink-dim">Operaciones ejecutadas</p>
          </div>
          {total !== null && (
            <span className="tabular-nums text-xs text-ink-faint">
              {items.length} de {total}
            </span>
          )}
        </header>

        <SyncButton onSincronizado={() => cargar()} />

        <section className="rounded-lg border border-line bg-surface overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
            <span className="text-xs uppercase tracking-widest text-ink-dim">
              Operaciones
            </span>
            <span className="ml-auto flex flex-wrap gap-1">
              {FILTROS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFiltro(f.id)}
                  className={`rounded border px-2.5 py-1 text-xs transition-colors ${
                    f.id === filtro
                      ? "border-ink bg-raised text-ink"
                      : "border-line text-ink-dim hover:border-ink-faint hover:text-ink"
                  }`}
                >
                  {f.etiqueta}
                </button>
              ))}
            </span>
          </div>

          {estado === "cargando" && (
            <p className="animate-pulse px-4 py-6 text-ink-dim">Cargando operaciones…</p>
          )}

          {estado === "error" && (
            <div className="animate-fade-in space-y-1 px-4 py-4">
              <div className="text-short">{error.code}</div>
              <div className="text-ink">{error.message}</div>
            </div>
          )}

          {(estado === "ok" || estado === "cargando-mas") && items.length === 0 && (
            <div className="px-4 py-8 text-center">
              <p className="text-ink-dim">
                {filtro === "todas"
                  ? "Todavía no hay operaciones."
                  : "Ninguna operación con ese filtro."}
              </p>
              {filtro === "todas" && (
                <p className="mt-2 text-sm text-ink-faint">
                  Pulsa «Sincronizar con Bybit» para traer el historial cerrado de la
                  cuenta.
                </p>
              )}
            </div>
          )}

          {(estado === "ok" || estado === "cargando-mas") && items.length > 0 && (
            <>
              <TradeList items={items} onActualizada={actualizada} />
              {hayMas && (
                <div className="border-t border-line px-4 py-3">
                  <button
                    type="button"
                    onClick={cargarMas}
                    disabled={estado === "cargando-mas"}
                    className="flex items-center gap-2 rounded border border-line px-4 py-2 text-sm text-ink-dim transition-colors hover:border-ink-faint hover:text-ink disabled:cursor-not-allowed disabled:text-ink-faint"
                  >
                    {estado === "cargando-mas" && <Spinner />}
                    {estado === "cargando-mas"
                      ? "Cargando…"
                      : `Cargar más (${total - items.length} restantes)`}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
