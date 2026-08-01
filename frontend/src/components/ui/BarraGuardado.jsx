import { useTimedReveal } from "../../hooks/useTimedReveal.js";

/**
 * Botón de guardar más el resultado del último intento: sucio → guardando →
 * guardado.
 *
 * Vive en `ui/` porque lo usan dos sitios que no se parecen en nada más —las
 * filas editables de Configuración y las notas de journal de una operación— y
 * en los dos el trader tiene que reconocer el mismo gesto: cambio algo,
 * aparece «Guardar», lo pulso, sale «✓ Guardado». Dos implementaciones del
 * mismo patrón acaban divergiendo en el detalle que más se nota, que es el
 * tiempo que tarda en apagarse la confirmación.
 *
 * El mensaje de error es el que devuelve el backend, palabra por palabra: los
 * triggers del esquema explican el caso concreto ("ya tiene una opcion de 30
 * puntos absolutos") y sustituirlo por un "valor no válido" genérico tiraría
 * a la basura justo la parte que le sirve al trader para arreglarlo.
 *
 * El "✓ Guardado" es temporal a propósito -- aparece y se apaga solo a los
 * dos segundos, nunca se queda indefinido -- para que quede claro que
 * describe el último guardado y no un estado permanente. Lo demás (el botón,
 * el error) sí se queda mientras siga siendo cierto.
 */
export default function BarraGuardado({
  sucio,
  invalido,
  mensajeInvalido,
  estado,
  error,
  onGuardar,
  onDescartar,
}) {
  const faseGuardado = useTimedReveal(!sucio && estado === "guardado");

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      {sucio && (
        <span className="animate-fade-in inline-flex items-center gap-3">
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
        </span>
      )}

      {invalido && mensajeInvalido && (
        <span className="animate-fade-in text-xs text-short">{mensajeInvalido}</span>
      )}

      {faseGuardado !== "oculto" && (
        <span
          className={`text-xs text-long transition-opacity duration-300 ${
            faseGuardado === "saliendo" ? "opacity-0" : "opacity-100"
          }`}
        >
          ✓ Guardado
        </span>
      )}

      {error && (
        <p className="animate-fade-in w-full text-xs leading-relaxed text-short">
          <span className="text-ink-faint">{error.code}</span> · {error.message}
        </p>
      )}
    </div>
  );
}
