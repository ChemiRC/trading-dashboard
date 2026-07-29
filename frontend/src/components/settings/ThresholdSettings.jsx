import { patchThreshold } from "../../api/config.js";
import { cambiosReales, useConfigDrafts } from "../../hooks/useConfigDrafts.js";
import { BarraGuardado, CampoEntero, CampoTexto } from "./EditControls.jsx";

/**
 * Bandas de clasificación: el rango de |balance| que cada lectura cubre.
 *
 * El rango va con botón de guardar y no con guardado automático por un motivo
 * concreto: el esquema impide que dos bandas se solapen, así que mover una
 * frontera casi siempre pasa por un estado intermedio inválido (subir el
 * mínimo de una banda antes de bajar el máximo de la anterior). Mandando
 * mínimo y máximo juntos, y solo cuando el trader lo da por terminado, ese
 * estado intermedio no llega a existir dentro de una misma banda.
 *
 * Entre bandas distintas sigue importando el orden -- hay que hacer sitio
 * antes de ocuparlo -- y de eso avisa el propio mensaje del 409.
 */

const TIPOS = { label: "text", min_abs_balance: "int", max_abs_balance: "int" };

const CLASE_POR_TOKEN = {
  strong: "text-cls-strong",
  good: "text-cls-good",
  medium: "text-cls-medium",
  none: "text-cls-none",
};

export default function ThresholdSettings({ umbrales, onGuardado }) {
  const { borradores, estados, errores, editar, descartar, guardar } = useConfigDrafts();

  return (
    <section className="rounded-lg border border-line bg-surface overflow-hidden">
      <h2 className="border-b border-line px-4 py-2.5 text-xs uppercase tracking-widest text-ink-dim">
        Bandas de clasificación
      </h2>

      <ul className="divide-y divide-line">
        {umbrales.map((banda) => {
          const servidor = {
            label: banda.label,
            min_abs_balance: banda.min_abs_balance,
            max_abs_balance: banda.max_abs_balance,
          };
          const clave = `thr:${banda.code}`;
          const borrador = borradores[clave];
          const valor = (campo) => borrador?.[campo] ?? servidor[campo];
          const { cambios, invalidos } = cambiosReales(servidor, borrador, TIPOS);
          const sucio = Object.keys(cambios).length > 0 || invalidos.length > 0;

          return (
            <li key={banda.code} className="px-4 py-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <CampoTexto
                  etiqueta="Banda"
                  valor={valor("label")}
                  onChange={(v) => editar(clave, "label", v)}
                />
                <CampoEntero
                  etiqueta="Mín."
                  valor={valor("min_abs_balance")}
                  onChange={(v) => editar(clave, "min_abs_balance", v)}
                  invalido={invalidos.includes("min_abs_balance")}
                  ancho="w-16"
                />
                <CampoEntero
                  etiqueta="Máx."
                  valor={valor("max_abs_balance")}
                  onChange={(v) => editar(clave, "max_abs_balance", v)}
                  invalido={invalidos.includes("max_abs_balance")}
                  ancho="w-16"
                />
                {/* Solo lectura: `is_tradeable` es lo que convierte una banda en
                    NO OPERAR, y el color es el que ya usan los paneles. */}
                <span className={`text-xs ${banda.is_tradeable ? "text-long" : "text-flat"}`}>
                  {banda.is_tradeable ? "operable" : "no operar"}
                </span>
                <span
                  className={`text-xs ${CLASE_POR_TOKEN[banda.color_token] ?? "text-ink-faint"}`}
                >
                  {banda.color_token}
                </span>
              </div>

              <BarraGuardado
                sucio={sucio}
                invalido={invalidos.length > 0}
                estado={estados[clave]}
                error={errores[clave]}
                onDescartar={() => descartar(clave)}
                onGuardar={() => guardar(clave, () => patchThreshold(banda.code, cambios), onGuardado)}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
