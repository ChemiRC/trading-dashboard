import { useEffect, useState } from "react";

import { listSetups } from "../../api/setups.js";
import { relinkTrade } from "../../api/trades.js";
import { conSigno, formatFecha, tono } from "../../lib/format.js";
import Spinner from "../ui/Spinner.jsx";
import { toast } from "../ui/Toast.jsx";

/**
 * Buscador para colgar una operación de un setup a mano.
 *
 * Arranca filtrando por el símbolo de la propia operación —que es lo que el
 * trader busca el 99 % de las veces— y ordena por cercanía a su apertura, no
 * por fecha absoluta: el candidato correcto casi siempre es el evaluado justo
 * antes de entrar, y tenerlo el primero ahorra leer la lista entera.
 *
 * No reimplementa la heurística del backend: aquí decide una persona, y por eso
 * enseña **todos** los setups del símbolo aunque queden fuera de la ventana de
 * 48 horas o de la tolerancia de precio. Si la automática hubiera acertado, no
 * haría falta esta pantalla.
 */

const CLASE_DECISION = {
  LONG: "text-long",
  SHORT: "text-short",
  NO_TRADE: "text-flat",
};

function distanciaMs(setup, trade) {
  if (!trade.opened_at || !setup.evaluated_at) return Number.POSITIVE_INFINITY;
  return Math.abs(new Date(trade.opened_at) - new Date(setup.evaluated_at));
}

function formatDistancia(ms) {
  if (!Number.isFinite(ms)) return "";
  const horas = ms / 3600000;
  if (horas < 1) return `${Math.round(horas * 60)} min`;
  if (horas < 48) return `${Math.round(horas)} h`;
  return `${Math.round(horas / 24)} d`;
}

export default function LinkSetupPicker({ trade, onVinculado, onCerrar }) {
  const [busqueda, setBusqueda] = useState(trade.symbol ?? "");
  const [setups, setSetups] = useState([]);
  const [estado, setEstado] = useState("cargando");
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(null);

  useEffect(() => {
    const controlador = new AbortController();
    setEstado("cargando");

    // El backend filtra por símbolo exacto; la caja de búsqueda vacía trae
    // todo y deja que el trader mire, que es lo que hará si el símbolo del
    // setup no se escribió igual que el del exchange.
    listSetups(
      { symbol: busqueda.trim() || undefined, limit: 50 },
      { signal: controlador.signal },
    )
      .then((pagina) => {
        setSetups(pagina.items);
        setEstado("ok");
      })
      .catch((fallo) => {
        if (fallo.isAborted) return;
        setError(fallo);
        setEstado("error");
      });

    return () => controlador.abort();
  }, [busqueda]);

  async function vincular(setupId) {
    setGuardando(setupId);
    try {
      const actualizada = await relinkTrade(trade.id, setupId);
      toast(setupId ? "Operación vinculada al setup" : "Operación desvinculada");
      onVinculado(actualizada);
    } catch (fallo) {
      if (fallo.isAborted) return;
      // El 409 del UNIQUE —ese setup ya tiene operación— llega con el mensaje
      // del esquema, que explica el caso mejor que cualquier texto propio.
      toast(fallo.message, { tipo: "error" });
      setGuardando(null);
    }
  }

  const ordenados = [...setups].sort(
    (a, b) => distanciaMs(a, trade) - distanciaMs(b, trade),
  );

  return (
    <div className="animate-fade-in border-t border-line bg-base/40 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[11px] uppercase tracking-wider text-ink-faint">
          Vincular a un setup evaluado
        </span>
        <button
          type="button"
          onClick={onCerrar}
          className="text-xs text-ink-faint transition-colors hover:text-ink"
        >
          Cerrar
        </button>
      </div>

      <label className="mt-3 block">
        <span className="text-[11px] uppercase tracking-wider text-ink-faint">
          Filtrar por símbolo
        </span>
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Vacío para ver todos"
          className="mt-1 w-full max-w-xs rounded border border-line bg-base px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-ink-faint"
        />
      </label>

      {trade.setup_id && (
        <button
          type="button"
          onClick={() => vincular(null)}
          disabled={guardando !== null}
          className="mt-3 rounded border border-short/50 px-3 py-1.5 text-xs text-short transition-colors hover:bg-short-deep/30 disabled:cursor-not-allowed disabled:text-ink-faint"
        >
          Desvincular del setup actual
        </button>
      )}

      {estado === "cargando" && (
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-dim">
          <Spinner /> Buscando setups…
        </p>
      )}

      {estado === "error" && (
        <div className="mt-3 rounded border border-short/40 bg-short-deep/30 px-3 py-2">
          <div className="text-xs text-short">{error.code}</div>
          <div className="mt-0.5 text-sm text-ink">{error.message}</div>
        </div>
      )}

      {estado === "ok" && ordenados.length === 0 && (
        <p className="mt-3 text-sm text-ink-faint">
          No hay setups guardados con ese símbolo. Prueba a vaciar el filtro, o
          es que esta operación se hizo sin evaluar nada antes — que es un dato
          en sí mismo y no hay por qué forzar un vínculo.
        </p>
      )}

      {estado === "ok" && ordenados.length > 0 && (
        <ul className="mt-3 divide-y divide-line/60 rounded border border-line">
          {ordenados.map((setup) => {
            const distancia = distanciaMs(setup, trade);
            const posterior =
              trade.opened_at &&
              setup.evaluated_at &&
              new Date(setup.evaluated_at) > new Date(trade.opened_at);

            return (
              <li
                key={setup.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-2.5 text-sm"
              >
                <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="tabular-nums text-ink-dim">
                    {formatFecha(setup.evaluated_at)}
                  </span>
                  <span className="text-ink">{setup.symbol}</span>
                  <span className={CLASE_DECISION[setup.decision] ?? "text-flat"}>
                    {setup.decision === "NO_TRADE" ? "NO TRADE" : setup.decision}
                  </span>
                  {setup.raw_balance != null && (
                    <span className={`tabular-nums ${tono(setup.raw_balance)}`}>
                      {conSigno(setup.raw_balance)}
                    </span>
                  )}
                  <span className="text-xs text-ink-faint">
                    {posterior
                      ? `evaluado ${formatDistancia(distancia)} DESPUÉS de abrir`
                      : `${formatDistancia(distancia)} antes de abrir`}
                  </span>
                </span>

                <button
                  type="button"
                  onClick={() => vincular(setup.id)}
                  disabled={guardando !== null || setup.id === trade.setup_id}
                  className="rounded border border-ink px-3 py-1 text-xs text-ink transition-all duration-150 hover:bg-raised active:scale-[0.97] disabled:cursor-not-allowed disabled:border-line disabled:text-ink-faint"
                >
                  {guardando === setup.id
                    ? "Vinculando…"
                    : setup.id === trade.setup_id
                      ? "Ya vinculado"
                      : "Vincular"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
