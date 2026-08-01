import { useEffect, useRef, useState } from "react";

import { getSetup } from "../../api/setups.js";
import { construirReporteSetups, nombreDeArchivo } from "../../lib/reporteSetups.js";
import Spinner from "../ui/Spinner.jsx";

/**
 * Descargar el histórico en PDF.
 *
 * **Exporta lo que hay en pantalla**, ni más ni menos: los setups cargados, en
 * el orden en que se están viendo. Si el trader ha pulsado «Cargar más» dos
 * veces y está ordenando por balance, eso es lo que sale. Un botón que
 * exportara siempre el histórico entero diría una cosa distinta de la que se
 * está mirando, y el rótulo lo deja claro cuando hay más de los cargados.
 *
 * **El desglose no viene en la lista.** `GET /api/setups` devuelve un resumen
 * por setup —sin las seis aportaciones— y el desglose congelado solo está en
 * `GET /api/setups/{id}`. Así que antes de generar nada hay que pedir el
 * detalle de cada uno, que es justo lo que hace la pantalla al desplegar una
 * fila, solo que aquí de golpe. Se piden de seis en seis: en ráfaga son
 * doscientas peticiones simultáneas contra Railway, y de una en una es una
 * espera larga sin motivo.
 *
 * No se toca el backend a propósito. Añadir las selecciones a la respuesta de
 * la lista habría hecho más pesado el endpoint que más se usa —la pantalla del
 * histórico no las necesita para pintar la tabla— para ahorrar unas peticiones
 * en una acción que se hace de vez en cuando.
 */

const PETICIONES_EN_PARALELO = 6;

export default function ExportPdfButton({ setups, total }) {
  const [estado, setEstado] = useState("listo"); // listo | preparando | error
  const [listos, setListos] = useState(0);
  const [error, setError] = useState(null);
  const abortador = useRef(null);

  // Si el trader cambia de pestaña a mitad de la descarga, las peticiones que
  // queden se cancelan: nadie va a mirar ese PDF.
  useEffect(() => () => abortador.current?.abort(), []);

  const vacio = setups.length === 0;
  const parcial = total != null && setups.length < total;

  async function descargar() {
    setEstado("preparando");
    setError(null);
    setListos(0);

    const controlador = new AbortController();
    abortador.current = controlador;

    try {
      const detalles = await enParalelo(
        setups,
        PETICIONES_EN_PARALELO,
        async (setup) => {
          const detalle = await getSetup(setup.id, { signal: controlador.signal });
          setListos((n) => n + 1);
          return detalle;
        },
      );

      const generadoEl = new Date();
      descargarArchivo(
        construirReporteSetups(detalles, { generadoEl }),
        nombreDeArchivo(generadoEl),
      );
      setEstado("listo");
    } catch (fallo) {
      if (fallo.isAborted || controlador.signal.aborted) return;
      setError(fallo);
      setEstado("error");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button
        type="button"
        onClick={descargar}
        disabled={vacio || estado === "preparando"}
        title={vacio ? "No hay setups guardados que exportar" : undefined}
        className="inline-flex items-center gap-2 rounded border border-line px-3 py-1.5 text-sm text-ink-dim transition-all duration-150 hover:border-ink-faint hover:text-ink active:scale-[0.98] disabled:cursor-not-allowed disabled:border-line disabled:text-ink-faint disabled:hover:border-line"
      >
        {estado === "preparando" ? <Spinner /> : <IconoDescargar />}
        {estado === "preparando" ? `Preparando… ${listos}/${setups.length}` : "Descargar PDF"}
      </button>

      {estado !== "preparando" && (
        <span className="text-xs text-ink-faint">
          {vacio
            ? "Nada que exportar todavía."
            : parcial
              ? `Exporta los ${setups.length} cargados, no los ${total} del histórico.`
              : `Los ${setups.length} del histórico, con su desglose congelado.`}
        </span>
      )}

      {estado === "error" && error && (
        <span className="animate-fade-in text-xs text-short">
          {error.code}: {error.message}
        </span>
      )}
    </div>
  );
}

/**
 * Ejecuta `tarea` sobre todos los elementos con como mucho `limite` en vuelo,
 * conservando el orden de entrada en el resultado -- que aquí es el orden de
 * la pantalla, y por tanto el del documento.
 */
async function enParalelo(elementos, limite, tarea) {
  const resultados = new Array(elementos.length);
  let siguiente = 0;

  async function trabajador() {
    for (;;) {
      const indice = siguiente;
      siguiente += 1;
      if (indice >= elementos.length) return;
      resultados[indice] = await tarea(elementos[indice], indice);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limite, elementos.length) }, trabajador),
  );
  return resultados;
}

/**
 * Provoca la descarga. Un `<a download>` de usar y tirar es la única forma de
 * que el navegador ofrezca «guardar como» sobre unos bytes que nunca han
 * estado en un servidor.
 */
function descargarArchivo(bytes, nombre) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  // Revocar en el mismo turno cancelaría la descarga en algunos navegadores:
  // el clic es síncrono pero la lectura del blob no.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Flecha hacia una bandeja: la convención de descargar, en trazo de lucide. */
function IconoDescargar() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
    >
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M4 21h16" />
    </svg>
  );
}
