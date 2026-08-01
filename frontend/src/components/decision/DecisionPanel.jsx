import AnimatedNumber from "../ui/AnimatedNumber.jsx";
import BalanceBar from "../ui/BalanceBar.jsx";
import { IconoDireccion } from "../ui/Icons.jsx";
import Spinner from "../ui/Spinner.jsx";
import { conSigno } from "../../lib/format.js";

/**
 * Veredicto principal: decisión, dirección deducida, balance con signo y la
 * barra que lo hace comparable de un vistazo. Es el primer panel que mira el
 * trader, así que la barra es el elemento dominante -- ocupa el ancho
 * completo y es lo último y más grande que se pinta.
 */

const ETIQUETA_DECISION = {
  LONG: "LONG",
  SHORT: "SHORT",
  NO_TRADE: "NO TRADE",
};

const CLASE_PILDORA = {
  LONG: "border-long/50 bg-long-deep/40 text-long",
  SHORT: "border-short/50 bg-short-deep/40 text-short",
  NO_TRADE: "border-line bg-raised text-flat",
};

function colorDireccion(direction) {
  if (direction === "LONG") return "text-long";
  if (direction === "SHORT") return "text-short";
  return "text-flat";
}

function colorBalance(n) {
  if (n > 0) return "text-long";
  if (n < 0) return "text-short";
  return "text-flat";
}

export default function DecisionPanel({ status, evaluation, error, maxAbsBalance }) {
  const cargando = status === "cargando";
  const esNoTrade = evaluation?.decision === "NO_TRADE";

  return (
    <section
      className={`rounded-lg border overflow-hidden transition-colors duration-300 ${
        status === "ok" && esNoTrade
          ? "border-flat/40 bg-flat/5"
          : "border-line bg-surface"
      }`}
    >
      <h2 className="flex items-center justify-between border-b border-line px-4 py-2.5 text-xs uppercase tracking-widest text-ink-dim">
        Decisión
        {cargando && evaluation && <Spinner />}
      </h2>

      {status === "error" && (
        <div className="animate-fade-in space-y-2 px-5 py-5">
          <div className="text-short">{error?.code}</div>
          <div className="text-ink">{error?.message}</div>
        </div>
      )}

      {status === "incompleto" && (
        <div className="px-5 py-8 text-ink-dim">
          Responde todos los indicadores para ver el veredicto.
        </div>
      )}

      {cargando && !evaluation && (
        <div className="animate-pulse px-5 py-8 text-ink-dim">Evaluando…</div>
      )}

      {(status === "ok" || cargando) && evaluation && (
        <div
          className={`px-5 py-5 transition-opacity duration-200 ${
            cargando ? "opacity-50" : "opacity-100"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded border px-3 py-1 text-sm uppercase tracking-widest transition-colors duration-300 ${
                CLASE_PILDORA[evaluation.decision] ?? CLASE_PILDORA.NO_TRADE
              }`}
            >
              <IconoDireccion direccion={evaluation.decision} />
              {ETIQUETA_DECISION[evaluation.decision] ?? evaluation.decision}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-ink-faint">
              dirección deducida:{" "}
              <span
                className={`inline-flex items-center gap-1 ${colorDireccion(evaluation.direction)}`}
              >
                <IconoDireccion direccion={evaluation.direction} className="h-3 w-3" />
                {evaluation.direction ?? "—"}
              </span>
            </span>
          </div>

          <AnimatedNumber
            valor={evaluation.raw_balance}
            formatear={(n) => conSigno(Math.round(n))}
            claseColor={colorBalance}
            className="mt-4 block text-6xl leading-none tabular-nums"
          />

          <div className="mt-6">
            <BalanceBar valor={evaluation.raw_balance} max={maxAbsBalance} />
          </div>
        </div>
      )}
    </section>
  );
}
