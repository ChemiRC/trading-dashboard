import { useEffect, useMemo, useRef, useState } from "react";

import { getSetup } from "../../api/setups.js";
import { claveDeMes, construirReporteSetups, mesesDisponibles, nombreDeArchivo } from "../../lib/reporteSetups.js";
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
 * **Se elige el mes antes de descargar.** El primer clic no descarga: abre un
 * selector con los meses presentes en lo cargado (calculados del mismo
 * `evaluated_at` que agrupa el propio PDF, ver `mesesDisponibles` en
 * `reporteSetups.js`), todos marcados por omisión -- así que un segundo clic
 * en «Descargar N setups» sigue exportando todo, igual que antes, y solo hace
 * falta desmarcar algo cuando de verdad se quiere un mes suelto.
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
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [mesesElegidos, setMesesElegidos] = useState(null); // null hasta abrir el selector
  const abortador = useRef(null);

  // Si el trader cambia de pestaña a mitad de la descarga, las peticiones que
  // queden se cancelan: nadie va a mirar ese PDF.
  useEffect(() => () => abortador.current?.abort(), []);

  const vacio = setups.length === 0;
  const parcial = total != null && setups.length < total;
  const meses = useMemo(() => mesesDisponibles(setups), [setups]);

  const setupsAExportar = useMemo(
    () =>
      mesesElegidos == null
        ? setups
        : setups.filter((setup) => mesesElegidos.has(claveDeMes(setup.evaluated_at))),
    [setups, mesesElegidos],
  );

  function abrirSelector() {
    // Todos marcados por omisión: abrir el selector no cambia lo que se
    // descargaría con un solo clic, solo enseña en qué se puede afinar.
    setMesesElegidos(new Set(meses.map((mes) => mes.clave)));
    setSelectorAbierto(true);
  }

  function alternarMes(clave) {
    setMesesElegidos((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(clave)) siguiente.delete(clave);
      else siguiente.add(clave);
      return siguiente;
    });
  }

  async function descargar() {
    setEstado("preparando");
    setError(null);
    setListos(0);
    setSelectorAbierto(false);

    const controlador = new AbortController();
    abortador.current = controlador;

    try {
      const detalles = await enParalelo(
        setupsAExportar,
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
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={() => (selectorAbierto ? setSelectorAbierto(false) : abrirSelector())}
          disabled={vacio || estado === "preparando"}
          title={vacio ? "No hay setups guardados que exportar" : undefined}
          aria-expanded={selectorAbierto}
          className="inline-flex items-center gap-2 rounded border border-line px-3 py-1.5 text-sm text-ink-dim transition-all duration-150 hover:border-ink-faint hover:text-ink active:scale-[0.98] disabled:cursor-not-allowed disabled:border-line disabled:text-ink-faint disabled:hover:border-line"
        >
          {estado === "preparando" ? <Spinner /> : <IconoDescargar />}
          {estado === "preparando" ? `Preparando… ${listos}/${setupsAExportar.length}` : "Descargar PDF"}
        </button>

        {estado !== "preparando" && !selectorAbierto && (
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

      {selectorAbierto && (
        <SelectorDeMeses
          meses={meses}
          elegidos={mesesElegidos}
          cantidad={setupsAExportar.length}
          onAlternar={alternarMes}
          onElegirTodos={() => setMesesElegidos(new Set(meses.map((mes) => mes.clave)))}
          onElegirNinguno={() => setMesesElegidos(new Set())}
          onDescargar={descargar}
          onCerrar={() => setSelectorAbierto(false)}
        />
      )}
    </div>
  );
}

/**
 * Los meses presentes en lo cargado, con casillas para descargar solo
 * algunos -- «Enero 2026», «Febrero 2026»... uno por cada mes de
 * `evaluated_at` distinto, más reciente primero.
 */
function SelectorDeMeses({
  meses,
  elegidos,
  cantidad,
  onAlternar,
  onElegirTodos,
  onElegirNinguno,
  onDescargar,
  onCerrar,
}) {
  return (
    <div className="animate-fade-in w-full max-w-xs rounded border border-line bg-surface shadow-lg">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span className="text-2xs uppercase tracking-wide text-ink-faint">Qué meses descargar</span>
        <div className="flex items-center gap-2 text-2xs">
          <button type="button" onClick={onElegirTodos} className="text-ink-dim hover:text-ink">
            Todos
          </button>
          <span className="text-ink-faint">·</span>
          <button type="button" onClick={onElegirNinguno} className="text-ink-dim hover:text-ink">
            Ninguno
          </button>
        </div>
      </div>

      <ul className="max-h-48 overflow-y-auto px-1.5 py-1.5">
        {meses.map((mes) => (
          <li key={mes.clave}>
            <label className="flex cursor-pointer items-center justify-between gap-2 rounded px-1.5 py-1 text-sm text-ink hover:bg-raised">
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={elegidos.has(mes.clave)}
                  onChange={() => onAlternar(mes.clave)}
                  className="h-3.5 w-3.5 accent-ink"
                />
                {mes.etiqueta}
              </span>
              <span className="tabular-nums text-xs text-ink-faint">{mes.cantidad}</span>
            </label>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
        <button type="button" onClick={onCerrar} className="text-xs text-ink-faint hover:text-ink-dim">
          Cancelar
        </button>
        <button
          type="button"
          onClick={onDescargar}
          disabled={cantidad === 0}
          className="rounded border border-ink bg-raised px-3 py-1.5 text-xs text-ink transition-all duration-150 hover:bg-line active:scale-[0.98] disabled:cursor-not-allowed disabled:border-line disabled:bg-transparent disabled:text-ink-faint"
        >
          Descargar {cantidad} {cantidad === 1 ? "setup" : "setups"}
        </button>
      </div>
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
