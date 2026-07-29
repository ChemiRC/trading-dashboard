/**
 * Piezas compartidas por las dos secciones editables.
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

/**
 * Botón de guardar más el resultado del último intento.
 *
 * El mensaje de error es el que devuelve el backend, palabra por palabra: los
 * triggers del esquema explican el caso concreto ("ya tiene una opcion de 30
 * puntos absolutos") y sustituirlo por un "valor no válido" genérico tiraría
 * a la basura justo la parte que le sirve al trader para arreglarlo.
 */
export function BarraGuardado({ sucio, invalido, estado, error, onGuardar, onDescartar }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      {sucio && (
        <>
          <button
            type="button"
            onClick={onGuardar}
            disabled={invalido || estado === "guardando"}
            className="rounded border border-ink px-2.5 py-1 text-xs text-ink transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:border-line disabled:text-ink-faint"
          >
            {estado === "guardando" ? "Guardando…" : "Guardar"}
          </button>
          <button
            type="button"
            onClick={onDescartar}
            className="text-xs text-ink-faint transition-colors hover:text-ink"
          >
            Descartar
          </button>
        </>
      )}

      {invalido && <span className="text-xs text-short">Tiene que ser un número entero.</span>}

      {!sucio && estado === "guardado" && (
        <span className="text-xs text-long">✓ Guardado</span>
      )}

      {error && (
        <p className="w-full text-xs leading-relaxed text-short">
          <span className="text-ink-faint">{error.code}</span> · {error.message}
        </p>
      )}
    </div>
  );
}
