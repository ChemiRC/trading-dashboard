import BarraGuardadoBase from "../ui/BarraGuardado.jsx";

/**
 * Piezas compartidas por las dos secciones editables.
 *
 * La barra de guardado se mudó a `ui/BarraGuardado.jsx`: la comparten estas
 * dos secciones y las notas de journal de una operación, y el gesto tiene que
 * ser el mismo en los tres sitios. Aquí se reexporta con el mensaje de error
 * que corresponde a campos numéricos, que es lo único específico de esta
 * pantalla.
 *
 * El guardado es explícito, con botón por fila, y no al perder el foco. Las
 * reglas del esquema son *entre* campos y *entre* filas -- el peso tiene que
 * cubrir sus opciones, las bandas no se pueden solapar, el orden es único --
 * así que guardar en cuanto un campo pierde el foco dispararía rechazos por
 * estados intermedios que el trader ni siquiera pretendía guardar (subir el
 * mínimo de una banda antes de haber bajado el máximo de la anterior). Con un
 * botón por fila, lo que se manda es lo que el trader dio por terminado.
 */

export function CampoEntero({ etiqueta, valor, onChange, invalido, ancho = "w-20" }) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-[11px] uppercase tracking-wider text-ink-faint">{etiqueta}</span>
      <input
        type="text"
        inputMode="numeric"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className={`${ancho} rounded border bg-base px-2 py-1 text-sm text-ink tabular-nums outline-none focus:border-ink-faint ${
          invalido ? "border-short/60" : "border-line"
        }`}
      />
    </label>
  );
}

export function CampoTexto({ etiqueta, valor, onChange, className = "flex-1 min-w-40" }) {
  return (
    <label className={`flex items-center gap-2 ${className}`}>
      <span className="text-[11px] uppercase tracking-wider text-ink-faint">{etiqueta}</span>
      <input
        type="text"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 rounded border border-line bg-base px-2 py-1 text-sm text-ink outline-none focus:border-ink-faint"
      />
    </label>
  );
}

/** La barra compartida, con el mensaje de validación de esta pantalla. */
export function BarraGuardado(props) {
  return <BarraGuardadoBase {...props} mensajeInvalido="Tiene que ser un número entero." />;
}
