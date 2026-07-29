import { patchIndicator, patchOption } from "../../api/config.js";
import { cambiosReales, useConfigDrafts } from "../../hooks/useConfigDrafts.js";
import { conSigno, tono } from "../../lib/format.js";
import { BarraGuardado, CampoEntero, CampoTexto } from "./EditControls.jsx";

/**
 * Pesos de los indicadores y puntos de sus opciones.
 *
 * Cada fila se guarda por separado contra su propio PATCH. Lo que se ve
 * siempre es o el borrador que el trader está escribiendo o el valor real de
 * la base de datos -- nunca un estado optimista: tras cada guardado se
 * recarga el catálogo entero y la pantalla se repinta con lo que la base de
 * datos aceptó de verdad, que no tiene por qué ser lo que se mandó.
 */

const TIPOS_INDICADOR = { name: "text", max_weight: "int", display_order: "int", is_active: "bool" };
const TIPOS_OPCION = { label: "text", points: "int", is_default: "bool", is_active: "bool" };

export default function IndicatorSettings({ indicadores, onGuardado }) {
  const { borradores, estados, errores, editar, descartar, guardar } = useConfigDrafts();

  function filaIndicador(indicador) {
    // `is_active` no viene en el catálogo porque el catálogo solo trae los
    // activos: lo que se ve aquí está activo por definición.
    const servidor = {
      name: indicador.name,
      max_weight: indicador.max_weight,
      display_order: indicador.display_order,
      is_active: true,
    };
    const clave = `ind:${indicador.code}`;
    const borrador = borradores[clave];
    const valor = (campo) => borrador?.[campo] ?? servidor[campo];
    const { cambios, invalidos } = cambiosReales(servidor, borrador, TIPOS_INDICADOR);

    return { clave, servidor, borrador, valor, cambios, invalidos };
  }

  return (
    <section className="rounded-lg border border-line bg-surface overflow-hidden">
      <h2 className="border-b border-line px-4 py-2.5 text-xs uppercase tracking-widest text-ink-dim">
        Indicadores, pesos y opciones
      </h2>

      <ul className="divide-y divide-line">
        {indicadores.map((indicador) => {
          const { clave, valor, cambios, invalidos } = filaIndicador(indicador);
          const sucio = Object.keys(cambios).length > 0 || invalidos.length > 0;

          return (
            <li key={indicador.code} className="px-4 py-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <CampoTexto
                  etiqueta="Nombre"
                  valor={valor("name")}
                  onChange={(v) => editar(clave, "name", v)}
                />
                <CampoEntero
                  etiqueta="Peso"
                  valor={valor("max_weight")}
                  onChange={(v) => editar(clave, "max_weight", v)}
                  invalido={invalidos.includes("max_weight")}
                  ancho="w-16"
                />
                <CampoEntero
                  etiqueta="Orden"
                  valor={valor("display_order")}
                  onChange={(v) => editar(clave, "display_order", v)}
                  invalido={invalidos.includes("display_order")}
                  ancho="w-16"
                />
                <label className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-ink-faint">
                  <input
                    type="checkbox"
                    checked={valor("is_active")}
                    onChange={(e) => editar(clave, "is_active", e.target.checked)}
                    className="accent-ink"
                  />
                  Activo
                </label>
                {indicador.is_gate && (
                  <span className="rounded border border-cls-medium/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-cls-medium">
                    puerta · regla A
                  </span>
                )}
                <code className="text-[11px] text-ink-faint">{indicador.code}</code>
              </div>

              <BarraGuardado
                sucio={sucio}
                invalido={invalidos.length > 0}
                estado={estados[clave]}
                error={errores[clave]}
                onDescartar={() => descartar(clave)}
                onGuardar={() =>
                  guardar(clave, () => patchIndicator(indicador.code, cambios), onGuardado)
                }
              />

              <ul className="mt-3 space-y-2 border-l border-line pl-3">
                {indicador.options.map((opcion) => (
                  <FilaOpcion
                    key={opcion.id}
                    opcion={opcion}
                    borradores={borradores}
                    estados={estados}
                    errores={errores}
                    editar={editar}
                    descartar={descartar}
                    guardar={guardar}
                    onGuardado={onGuardado}
                  />
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function FilaOpcion({
  opcion,
  borradores,
  estados,
  errores,
  editar,
  descartar,
  guardar,
  onGuardado,
}) {
  const servidor = {
    label: opcion.label,
    points: opcion.points,
    is_default: opcion.is_default,
    is_active: true,
  };
  const clave = `opt:${opcion.id}`;
  const borrador = borradores[clave];
  const valor = (campo) => borrador?.[campo] ?? servidor[campo];
  const { cambios, invalidos } = cambiosReales(servidor, borrador, TIPOS_OPCION);
  const sucio = Object.keys(cambios).length > 0 || invalidos.length > 0;

  return (
    <li>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <CampoTexto
          etiqueta="Opción"
          valor={valor("label")}
          onChange={(v) => editar(clave, "label", v)}
        />
        <CampoEntero
          etiqueta="Puntos"
          valor={valor("points")}
          onChange={(v) => editar(clave, "points", v)}
          invalido={invalidos.includes("points")}
          ancho="w-16"
        />
        {/* El valor vigente en la base de datos, con su signo y su color: es la
            referencia contra la que el trader compara lo que está escribiendo. */}
        <span className={`text-xs tabular-nums ${tono(opcion.points)}`}>
          {conSigno(opcion.points)}
        </span>
        <label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-ink-faint">
          <input
            type="checkbox"
            checked={valor("is_default")}
            onChange={(e) => editar(clave, "is_default", e.target.checked)}
            className="accent-ink"
          />
          Por defecto
        </label>
        <label className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-ink-faint">
          <input
            type="checkbox"
            checked={valor("is_active")}
            onChange={(e) => editar(clave, "is_active", e.target.checked)}
            className="accent-ink"
          />
          Activa
        </label>
      </div>

      <BarraGuardado
        sucio={sucio}
        invalido={invalidos.length > 0}
        estado={estados[clave]}
        error={errores[clave]}
        onDescartar={() => descartar(clave)}
        onGuardar={() => guardar(clave, () => patchOption(opcion.id, cambios), onGuardado)}
      />
    </li>
  );
}
