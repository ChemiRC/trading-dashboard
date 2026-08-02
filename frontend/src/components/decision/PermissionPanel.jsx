import Spinner from "../ui/Spinner.jsx";
import { ETIQUETA_MOTIVO } from "../../lib/etiquetas.js";

/**
 * Clasificación derivada del valor absoluto del balance, y por qué el motivo
 * es NO_TRADE cuando lo es.
 *
 * El texto del motivo (`no_trade_message`) viene del backend, no de aquí: es
 * la misma fuente que ya arma `MENSAJES_NO_TRADE` en `app/models/evaluation.py`.
 * Reescribirlo en el frontend sería tener la misma explicación en dos sitios
 * que se pueden desincronizar -- igual que las reglas de configuración.
 */

const CLASE_POR_TOKEN = {
  strong: "text-cls-strong",
  good: "text-cls-good",
  medium: "text-cls-medium",
  none: "text-cls-none",
};

function PermissionBody({ evaluation, thresholds }) {
  const banda = thresholds?.find((t) => t.code === evaluation.classification_code) ?? null;

  return (
    <div className="space-y-3 px-3 py-3">
      {banda ? (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <span className={`text-lg ${CLASE_POR_TOKEN[banda.color_token] ?? "text-ink"}`}>
            {banda.label}
          </span>
          <span className="tabular-nums text-xs text-ink-dim">
            |balance| {banda.min_abs_balance}–{banda.max_abs_balance}
          </span>
        </div>
      ) : (
        <div className="text-sm text-flat">
          Sin clasificación: la Regla A cortó antes de calcular balance.
        </div>
      )}

      {evaluation.decision === "NO_TRADE" && evaluation.no_trade_reason && (
        <div className="animate-fade-in rounded border border-line bg-raised px-3 py-2">
          <div className="text-3xs uppercase tracking-wide text-ink-faint">
            {ETIQUETA_MOTIVO[evaluation.no_trade_reason] ?? evaluation.no_trade_reason}
          </div>
          <div className="mt-1 text-sm leading-relaxed text-ink">
            {evaluation.no_trade_message}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PermissionPanel({ status, evaluation, error, thresholds }) {
  const cargando = status === "cargando";

  return (
    <section className="rounded-lg border border-line bg-surface overflow-hidden">
      <h2 className="flex items-center justify-between border-b border-line px-3 py-1.5 text-2xs uppercase tracking-wide text-ink-dim">
        Permission Panel
        {cargando && evaluation && <Spinner />}
      </h2>

      {/* Los tres estados sin dato real: una línea, sin margen de sobra. Ver
          ESCALA DE DENSIDAD en index.css. */}
      {status === "error" && (
        <p className="animate-fade-in px-3 py-2 text-xs text-ink-dim">
          {error?.message ?? "No se puede clasificar."}
        </p>
      )}

      {status === "incompleto" && (
        <p className="px-3 py-2 text-xs text-ink-dim">
          La clasificación aparece en cuanto respondas los seis indicadores.
        </p>
      )}

      {cargando && !evaluation && (
        <p className="animate-pulse px-3 py-2 text-xs text-ink-dim">Clasificando…</p>
      )}

      {(status === "ok" || cargando) && evaluation && (
        <div className={`transition-opacity duration-200 ${cargando ? "opacity-50" : "opacity-100"}`}>
          <PermissionBody evaluation={evaluation} thresholds={thresholds} />
        </div>
      )}
    </section>
  );
}
