import { conSigno, tono } from "../../lib/format.js";
import { IconoIndicador } from "../ui/Icons.jsx";
import Insignia from "../ui/Insignia.jsx";

/**
 * Formulario de evaluación pre-trade: las seis preguntas y sus opciones.
 *
 * Presentacional del todo. No pide el catálogo, no llama a `/evaluate` y no
 * guarda nada: recibe lo que hay que pintar y avisa de lo que el trader
 * marca. El estado vive en `useEvaluacion`, por encima de las pestañas, para
 * que salir de «Evaluación» y volver no lo tire (ver ese hook).
 *
 * **Compacto a propósito.** De escritorio (`lg:`) en adelante las seis
 * preguntas se organizan en una rejilla de 2 columnas -- 3 filas de 2, mismo
 * orden que el catálogo -- para que quepan enteras sin desplazarse ni robarle
 * media pantalla al panel del veredicto (ver `pages/Evaluacion.jsx`). Los
 * divisores que antes separaban filas (`divide-y`) no sirven dentro de una
 * rejilla -- ponen la línea al final de cada elemento en orden de DOM, que en
 * dos columnas cae donde no toca -- así que cada bloque calcula el suyo: borde
 * inferior si no es de la última fila, borde izquierdo si es la columna
 * derecha.
 *
 * Las opciones de cada indicador ya envuelven con `flex-wrap`: al angostarse
 * la columna, un indicador con etiquetas largas ("Patrones gráficos") pasa
 * solo a partir sus opciones en dos líneas dentro de su propio bloque, sin
 * necesitar ningún caso especial.
 *
 * Por debajo de `lg` no hay ancho para dos columnas: sigue siendo una lista
 * apilada con `divide-y`, igual que antes, y los botones crecen hasta un área
 * de toque cómoda -- son el control que más se pulsa de toda la aplicación.
 *
 * Los indicadores y sus opciones vienen enteros del catálogo: aquí no hay ni
 * un peso ni un nombre escrito. El icono se elige por `code`, que es estable
 * aunque el indicador se renombre desde Configuración.
 */
export default function EvaluationForm({
  estadoCatalogo,
  errorCatalogo,
  indicadores,
  selections,
  onElegir,
}) {
  if (estadoCatalogo === "cargando") {
    return (
      <section className="rounded-lg border border-line bg-surface px-4 py-6">
        <p className="animate-pulse text-ink-dim">Cargando catálogo…</p>
      </section>
    );
  }

  if (estadoCatalogo === "error") {
    return (
      <section className="animate-fade-in rounded-lg border border-short/40 bg-short-deep/30 overflow-hidden">
        <h2 className="border-b border-short/30 px-4 py-2.5 text-xs uppercase tracking-widest text-short">
          Sin conexión con el backend
        </h2>
        <div className="space-y-2 px-4 py-4">
          <div className="text-short">{errorCatalogo?.code}</div>
          <div className="text-ink">{errorCatalogo?.message}</div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-line bg-surface overflow-hidden">
      <h2 className="border-b border-line px-4 py-2.5 text-xs uppercase tracking-widest text-ink-dim">
        Qué ves en el gráfico
      </h2>
      <ul className="divide-y divide-line lg:grid lg:grid-cols-2 lg:divide-y-0">
        {indicadores.map((indicador, i) => (
          <IndicatorField
            key={indicador.code}
            indicador={indicador}
            valor={selections[indicador.code] ?? null}
            onElegir={(optionCode) => onElegir(indicador.code, optionCode)}
            // Fila: todas menos la última llevan borde inferior en la rejilla.
            // Columna: la derecha (índice impar, col-2 en orden de DOM) lleva
            // borde izquierdo -- salvo que ya tenga el acento de "puerta", que
            // es también un borde izquierdo y no hay que competir con él.
            bordeInferior={Math.floor(i / 2) < Math.floor((indicadores.length - 1) / 2)}
            bordeIzquierdo={i % 2 === 1}
          />
        ))}
      </ul>
    </section>
  );
}

function IndicatorField({ indicador, valor, onElegir, bordeInferior, bordeIzquierdo }) {
  const sinResponder = valor === null;

  return (
    <li
      className={`px-4 py-1.5 ${
        // El indicador puerta es estructuralmente distinto -- puede bloquear
        // todo el resultado (Regla A) -- así que se insinúa con un acento en
        // el borde izquierdo antes de que nadie llegue a leer la etiqueta.
        // El resto de la fila no lleva tinte: solo el canto, para que siga
        // leyéndose como parte de la misma lista y no como una tarjeta aparte.
        indicador.is_gate ? "border-l-2 border-l-cls-medium bg-cls-medium/[0.03]" : ""
      } ${bordeInferior ? "lg:border-b lg:border-line" : ""} ${
        // Si ya lleva el acento de puerta, ese borde izquierdo no se toca:
        // dos colores compitiendo por el mismo canto se verían mal, y el
        // acento de puerta es la señal más importante de las dos.
        bordeIzquierdo && !indicador.is_gate ? "lg:border-l lg:border-line" : ""
      }`}
    >
      {/* El nombre encima y las opciones debajo, a todo el ancho de la
          columna. Se probó con el nombre en una columna fija a la izquierda —
          más compacto sobre el papel— y salió peor: le robaba a las opciones
          los 180 px que necesitan para ponerse de dos en dos, así que cada una
          caía en su propia línea y el bloque acababa siendo más alto, no menos. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <IconoIndicador
            code={indicador.code}
            className={`h-4 w-4 shrink-0 ${
              sinResponder ? "text-ink-faint" : "text-ink-dim"
            }`}
          />
          {/* El nombre del indicador es el título de la pregunta y pesa más que
              cualquier otra cosa de la fila: sin eso las seis franjas se leían
              como una lista uniforme de botones. */}
          <span className="text-sm font-semibold tracking-tight text-ink">
            {indicador.name}
          </span>
          {indicador.is_gate && (
            <Insignia tono="aviso" titulo="Sin divergencia, el resultado es NO TRADE inmediato">
              puerta · regla A
            </Insignia>
          )}
        {sinResponder && <Insignia tono="pendiente">sin responder</Insignia>}
      </div>

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {indicador.options.map((opcion) => (
          <BotonOpcion
            key={opcion.code}
            opcion={opcion}
            activa={opcion.code === valor}
            onElegir={() => onElegir(opcion.code)}
          />
        ))}
      </div>
    </li>
  );
}

/**
 * Una opción del catálogo.
 *
 * El borde es **siempre de dos píxeles**: lo que cambia entre marcada y sin
 * marcar es el color, no el grosor. Engordar el borde solo al seleccionar
 * movería el resto de las opciones de sitio cada vez que se pulsa una, y en
 * una fila que se recorre a golpes de clic eso se nota mucho más que el
 * contraste que se gana.
 *
 * La marcada suma tres señales a la vez —borde claro, fondo elevado y una
 * línea interior— porque una sola (el relleno sutil que había antes) se perdía
 * al mirar la pantalla de reojo, que es como se mira mientras se compara con
 * el gráfico.
 *
 * `min-h-11` son los 44 px de área de toque cómoda en móvil; en escritorio se
 * relaja a la altura natural del texto.
 */
function BotonOpcion({ opcion, activa, onElegir }) {
  return (
    <button
      type="button"
      onClick={onElegir}
      aria-pressed={activa}
      className={`inline-flex min-h-11 items-center gap-2 rounded border-2 px-2.5 py-1 text-left text-sm transition-all duration-150 active:scale-[0.97] sm:min-h-0 ${
        activa
          ? "border-ink bg-raised text-ink ring-1 ring-inset ring-ink/25"
          : "border-line/70 text-ink-dim hover:border-ink-faint hover:bg-raised/50 hover:text-ink"
      }`}
    >
      <span>{opcion.label}</span>
      <span className={`tabular-nums ${activa ? tono(opcion.points) : "text-ink-faint"}`}>
        {conSigno(opcion.points)}
      </span>
    </button>
  );
}

