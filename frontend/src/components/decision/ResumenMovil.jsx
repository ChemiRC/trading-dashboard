import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { conSigno } from "../../lib/format.js";
import { ETIQUETA_DECISION } from "../../lib/etiquetas.js";
import { IconoDireccion } from "../ui/Icons.jsx";
import ConfluenceScore from "./ConfluenceScore.jsx";
import DecisionPanel from "./DecisionPanel.jsx";
import PermissionPanel from "./PermissionPanel.jsx";

/**
 * El veredicto en móvil: una barra fija abajo que se despliega.
 *
 * En escritorio los tres paneles se quedan pegados al lado del formulario
 * (ver `pages/Evaluacion.jsx`). En un teléfono no hay sitio para eso: si
 * fueran una columna más, quedarían debajo de las seis preguntas y el trader
 * marcaría opciones sin ver nunca el efecto, que es justo lo contrario de lo
 * que la pantalla quiere enseñar.
 *
 * Así que el veredicto se reduce a **una línea siempre visible** —decisión,
 * balance y clasificación— y el desglose completo se abre al tocarla. La
 * línea cabe donde no estorba; el desglose se mira cuando se quiere mirar.
 *
 * Va encima de la barra de pestañas, no debajo: la navegación tiene que
 * seguir siendo lo último y más accesible con el pulgar.
 *
 * **Se pinta con un portal a `document.body`, y no en su sitio del árbol.**
 * `position: fixed` no se mide contra la ventana si algún ancestro tiene un
 * `transform`: pasa a medirse contra ese ancestro. El contenedor de la pestaña
 * activa lleva `animate-fade-in`, cuya animación deja puesto un transform
 * identidad al terminar —basta con eso—, así que la barra acababa a dos mil
 * píxeles de la parte de arriba, fuera de la pantalla. Se vio probando en un
 * móvil de verdad: en el DOM estaba, con `position: fixed`, y no se veía.
 */
export default function ResumenMovil({ status, evaluation, error, catalogo, pendientes }) {
  const [abierto, setAbierto] = useState(false);

  // Con el desglose abierto se bloquea el desplazamiento del fondo: si no, el
  // gesto de leer el panel arrastra la página de detrás y al cerrar el trader
  // aparece en otro sitio del formulario.
  useEffect(() => {
    if (!abierto) return undefined;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, [abierto]);

  const incompleto = status === "incompleto" || !evaluation;
  const balance = evaluation?.raw_balance ?? null;
  const decision = evaluation?.decision ?? null;

  return createPortal(
    <>
      {/* --- El desglose desplegado --- */}
      {abierto && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Cerrar el desglose"
            onClick={() => setAbierto(false)}
            className="absolute inset-0 h-full w-full bg-base/80"
          />
          <div className="animate-fade-in absolute inset-x-0 bottom-0 top-10 flex flex-col rounded-t-xl border-t border-line bg-base">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <span className="text-xs uppercase tracking-widest text-ink-dim">
                Veredicto
              </span>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="rounded border border-line px-3 py-1.5 text-xs text-ink-dim transition-colors hover:border-ink-faint hover:text-ink"
              >
                Cerrar
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
              <DecisionPanel
                status={status}
                evaluation={evaluation}
                error={error}
                maxAbsBalance={catalogo?.max_abs_balance}
              />
              <ConfluenceScore status={status} evaluation={evaluation} error={error} />
              <PermissionPanel
                status={status}
                evaluation={evaluation}
                error={error}
                thresholds={catalogo?.thresholds}
              />
            </div>
          </div>
        </div>
      )}

      {/* --- La barra siempre visible ---
          `bottom-16` la deja justo encima de la navegación inferior. */}
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-expanded={abierto}
        className="fixed inset-x-0 bottom-16 z-30 flex items-center gap-3 border-t border-line bg-surface px-4 py-2.5 text-left lg:hidden"
      >
        {incompleto ? (
          <>
            <span className="text-sm text-ink-dim">
              {pendientes > 0
                ? `Faltan ${pendientes} por responder`
                : "Calculando el veredicto…"}
            </span>
            <span className="ml-auto text-xs text-ink-faint">ver desglose ▲</span>
          </>
        ) : (
          <>
            <span
              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs uppercase tracking-wider ${
                CLASE_PILDORA[decision] ?? CLASE_PILDORA.NO_TRADE
              }`}
            >
              <IconoDireccion direccion={decision} className="h-3 w-3" />
              {ETIQUETA_DECISION[decision] ?? decision}
            </span>
            <span
              className={`tabular-nums text-lg leading-none ${colorBalance(balance)}`}
            >
              {balance == null ? "—" : conSigno(balance)}
            </span>
            <span className="truncate text-xs text-ink-dim">
              {evaluation?.classification_label ?? ""}
            </span>
            <span className="ml-auto shrink-0 text-xs text-ink-faint">▲</span>
          </>
        )}
      </button>
    </>,
    document.body,
  );
}

const CLASE_PILDORA = {
  LONG: "border-long/50 bg-long-deep/40 text-long",
  SHORT: "border-short/50 bg-short-deep/40 text-short",
  NO_TRADE: "border-line bg-raised text-flat",
};

function colorBalance(n) {
  if (n == null) return "text-flat";
  if (n > 0) return "text-long";
  if (n < 0) return "text-short";
  return "text-flat";
}
