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
 *
 * **Panel de ejemplo de la escala de densidad** (ver `index.css`, sección
 * ESCALA DE DENSIDAD). Es el primero en aplicarla porque era el caso más
 * claro del problema que la origina: vacío, `px-5 py-8` alrededor de una
 * frase lo dejaba casi tan alto como cuando sí hay veredicto que enseñar.
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
      <h2 className="flex items-center justify-between border-b border-line px-3 py-1.5 text-2xs uppercase tracking-wide text-ink-dim">
        Decisión
        {cargando && evaluation && <Spinner />}
      </h2>

      {/* Los tres estados sin dato real comparten una sola receta -- una
          línea, sin margen de sobra -- para que el panel no finja tener algo
          que enseñar cuando no lo tiene. Ver ESCALA DE DENSIDAD en index.css. */}
      {status === "error" && (
        <div className="animate-fade-in px-3 py-2 text-xs">
          <span className="text-short">{error?.code}</span>{" "}
          <span className="text-ink">{error?.message}</span>
        </div>
      )}

      {status === "incompleto" && (
        <p className="px-3 py-2 text-xs text-ink-dim">
          Responde todos los indicadores para ver el veredicto.
        </p>
      )}

      {cargando && !evaluation && (
        <p className="animate-pulse px-3 py-2 text-xs text-ink-dim">Evaluando…</p>
      )}

      {(status === "ok" || cargando) && evaluation && (
        <div
          className={`px-3 py-3 transition-opacity duration-200 ${
            cargando ? "opacity-50" : "opacity-100"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-0.5 text-xs uppercase tracking-wide transition-colors duration-300 ${
                CLASE_PILDORA[evaluation.decision] ?? CLASE_PILDORA.NO_TRADE
              }`}
            >
              <IconoDireccion direccion={evaluation.decision} />
              {ETIQUETA_DECISION[evaluation.decision] ?? evaluation.decision}
            </span>
            <span className="inline-flex items-center gap-1 text-2xs text-ink-faint">
              dirección deducida:{" "}
              <span
                className={`inline-flex items-center gap-1 ${colorDireccion(evaluation.direction)}`}
              >
                <IconoDireccion direccion={evaluation.direction} className="h-3 w-3" />
                {evaluation.direction ?? "—"}
              </span>
            </span>
          </div>

          {/* text-5xl y no el text-6xl de antes: sigue siendo, con diferencia,
              lo más grande del panel -- cuatro veces la etiqueta de al lado --
              pero 60px sobre una cabecera de 11px ya no estaba proporcionado. */}
          <AnimatedNumber
            valor={evaluation.raw_balance}
            formatear={(n) => conSigno(Math.round(n))}
            claseColor={colorBalance}
            className="mt-2 block text-5xl leading-none tabular-nums"
          />

          <div className="mt-3">
            <BalanceBar valor={evaluation.raw_balance} max={maxAbsBalance} />
          </div>
        </div>
      )}
    </section>
  );
}
