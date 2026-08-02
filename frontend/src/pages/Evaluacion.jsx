import ConfluenceScore from "../components/decision/ConfluenceScore.jsx";
import DecisionPanel from "../components/decision/DecisionPanel.jsx";
import PermissionPanel from "../components/decision/PermissionPanel.jsx";
import ResumenMovil from "../components/decision/ResumenMovil.jsx";
import EvaluationForm from "../components/setup/EvaluationForm.jsx";
import SaveSetupPanel from "../components/setup/SaveSetupPanel.jsx";
import { PANTALLA, CONTENEDOR_DENSO } from "../lib/anchos.js";

/**
 * Evaluación de setup: describir y decidir, en la misma pantalla.
 *
 * A la izquierda lo que el trader **describe** —las seis preguntas— y debajo el
 * guardado. A la derecha lo que sale de describirlo, en cadena de lectura: qué
 * decide (Decision Panel) → por qué (Confluence Score) → qué significa
 * (Permission Panel).
 *
 * Estuvo partida en dos pestañas y se volvió a juntar: obligaba a cambiar de
 * pantalla para ver el efecto de cada respuesta, y en una herramienta cuyo
 * argumento es «marca y mira lo que sale» eso es un clic de más entre la causa
 * y su consecuencia. El precio asumido es que el balance está a la vista
 * mientras se contesta; el freno a retocar respuestas hasta que el número guste
 * deja de ser la interfaz y pasa a ser el histórico, que guarda el setup con
 * los puntos congelados y sirve justo para eso.
 *
 * El estado sigue en `useEvaluacion`, por encima de las pestañas. Con una sola
 * pantalla ya no hace falta para ir de «Indicadores» a «Decisión», pero sí para
 * lo demás: ir a Mercado a mirar el libro, a Riesgo a calcular el tamaño o al
 * Histórico a comparar, y volver con lo contestado intacto.
 *
 * No hay resumen de lo contestado: el Confluence Score ya enseña indicador,
 * opción elegida y puntos de los seis, y con el formulario al lado repetirlo
 * sería decir dos veces lo mismo en la misma pantalla.
 */
export default function Evaluacion({ evaluacion, irA }) {
  const {
    estadoCatalogo,
    errorCatalogo,
    catalogo,
    indicadores,
    selections,
    elegir,
    completo,
    pendientes,
    status,
    evaluation,
    error,
    decision,
  } = evaluacion;

  const formulario = (
    <EvaluationForm
      estadoCatalogo={estadoCatalogo}
      errorCatalogo={errorCatalogo}
      indicadores={indicadores}
      selections={selections}
      onElegir={elegir}
    />
  );

  return (
    <div className={PANTALLA}>
      <div className={CONTENEDOR_DENSO}>
        <header className="flex flex-wrap items-baseline justify-between gap-3 pr-14 sm:pr-0">
          <div>
            <h1 className="text-xl text-ink">Trading Dashboard</h1>
            <p className="mt-1 text-sm text-ink-dim">
              Evaluación de setup — describe lo que ves y mira lo que sale
            </p>
          </div>
          {estadoCatalogo === "ok" && (
            <span
              className={`text-xs ${pendientes > 0 ? "text-cls-medium" : "text-ink-faint"}`}
            >
              {pendientes === 0 ? "Las seis respondidas" : `${pendientes} sin responder`}
            </span>
          )}
        </header>

        {/* Sin catálogo no hay ni preguntas ni veredicto: el formulario ocupa
            el ancho entero y pinta él mismo su carga o su error, en vez de
            dejar media pantalla con paneles vacíos al lado. */}
        {estadoCatalogo !== "ok" ? (
          formulario
        ) : (
          // En `2xl` la columna del veredicto pasa a ancho FIJO (28rem) y todo
          // lo que sobra se lo queda el formulario. Con las dos en proporción,
          // el veredicto crecía hasta 555 px y se llenaba de aire: sus paneles
          // son un número grande y una lista corta, no ganan nada por
          // ensancharse. El formulario sí: cada 250 px de más son otro botón
          // de opción por fila.
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)] lg:items-start 2xl:grid-cols-[minmax(0,1fr)_28rem] 2xl:gap-8">
            {/* **«Guardar» vuelve a la izquierda, debajo de la rejilla.**
                Vivió apilado bajo Permission Panel un tiempo -- la columna
                derecha se quedaba con cientos de píxeles vacíos y ahí sí
                tenía sitio -- pero el precio era que "Guardar" heredaba el
                ancho angosto de esa columna (330-448px) y sus tres campos
                cortos no cabían en fila: forzados a apilarse uno por línea,
                la sección crecía tanto que la columna del veredicto entera
                dejaba de caber en un monitor sin desplazarse. Aquí vive a
                todo el ancho de la rejilla (700-1600px según el viewport),
                así que sus campos van EN FILA -- la misma consulta de
                contenedor de siempre (`@min-[425px]:grid-cols-3` en
                SaveSetupPanel.jsx), solo que ahora el contenedor real es
                mucho más ancho que el umbral y los tres entran sin apretarse.

                Con esto la columna derecha se queda SOLO con el veredicto
                (Decisión/Confluence/Permission), mucho más corta -- y la
                izquierda es rejilla + guardado, en flujo normal de página,
                no dentro de la columna sticky con scroll interno. */}
            <div className="flex flex-col gap-6">
              {formulario}
              <SaveSetupPanel
                selections={selections}
                completo={completo}
                decision={decision}
                onVerHistorico={irA ? () => irA("historico") : undefined}
              />
            </div>

            {/* **El veredicto se queda quieto.** El formulario (+ Guardar,
                ahora aquí al lado) es más largo que la pantalla y el panel
                más corto, así que al desplazarse el resultado se iba de la
                vista justo cuando más falta hacía verlo.

                `top-16` lo deja por debajo de la barra de pestañas, que
                también es pegajosa; `max-h` + `overflow-y-auto` son para que
                la columna se pueda recorrer en pantallas bajas en vez de
                cortarse -- y **cada panel hijo necesita `shrink-0`** para que
                ese recorte no pase de verdad: llevan `overflow-hidden` en su
                `<section>` (solo para las esquinas redondeadas), y la spec de
                flexbox dice que el tamaño mínimo automático de un hijo flex
                solo respeta su contenido si el overflow es `visible` --
                con `overflow-hidden` ese mínimo pasa a ser 0, y el navegador
                prefiere encoger el panel por debajo de su contenido real
                -- cortándolo en silencio -- antes que agrandar el
                contenedor y dejarlo desplazarse. Se vio en 1920×1080 antes
                de este `shrink-0`: Permission Panel perdía sus últimos 10px,
                Confluence Score 51px enteros, sin ninguna barra de scroll
                que avisara. */}
            <div className="hidden lg:sticky lg:top-16 lg:flex lg:max-h-[calc(100vh-5rem)] lg:flex-col lg:gap-4 lg:overflow-y-auto lg:pb-2">
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
        )}
      </div>

      {/* Por debajo de `lg` no hay columna donde fijar nada: el veredicto pasa
          a una barra sobre la navegación, que se despliega al tocarla. */}
      {estadoCatalogo === "ok" && (
        <ResumenMovil
          status={status}
          evaluation={evaluation}
          error={error}
          catalogo={catalogo}
          pendientes={pendientes}
        />
      )}
    </div>
  );
}
