import ConfluenceScore from "../components/decision/ConfluenceScore.jsx";
import DecisionPanel from "../components/decision/DecisionPanel.jsx";
import PermissionPanel from "../components/decision/PermissionPanel.jsx";
import EvaluationForm from "../components/setup/EvaluationForm.jsx";
import SaveSetupPanel from "../components/setup/SaveSetupPanel.jsx";

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
    <div className="min-h-screen bg-base px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-wrap items-baseline justify-between gap-3">
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
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <div className="flex flex-col gap-6">
              {formulario}
              <SaveSetupPanel
                selections={selections}
                completo={completo}
                decision={decision}
                onVerHistorico={irA ? () => irA("historico") : undefined}
              />
            </div>

            <div className="flex flex-col gap-6">
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
    </div>
  );
}
