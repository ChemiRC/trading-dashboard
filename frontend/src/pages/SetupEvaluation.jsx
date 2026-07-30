import { useState } from "react";

import ConfluenceScore from "../components/decision/ConfluenceScore.jsx";
import DecisionPanel from "../components/decision/DecisionPanel.jsx";
import PermissionPanel from "../components/decision/PermissionPanel.jsx";
import EvaluationForm from "../components/setup/EvaluationForm.jsx";

/**
 * Punto de montaje de la entrega 7.
 *
 * El formulario y los tres paneles no comparten estado propio: todo lo que
 * pinta un panel sale de `resultado`, que llega entero por `onResult` desde
 * `EvaluationForm` en cada cambio de selección. Qué decide (Decision Panel) →
 * por qué (Confluence Score) → qué significa (Permission Panel).
 */
export default function SetupEvaluation({ irA }) {
  const [resultado, setResultado] = useState({
    status: "incompleto",
    evaluation: null,
    error: null,
    selections: {},
    catalog: null,
  });

  const { status, evaluation, error, catalog } = resultado;

  return (
    <div className="min-h-screen bg-base px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header>
          <h1 className="text-xl text-ink">Trading Dashboard</h1>
          <p className="mt-1 text-sm text-ink-dim">Evaluación de setup</p>
        </header>

        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <EvaluationForm
            onResult={setResultado}
            onVerHistorico={irA ? () => irA("historico") : undefined}
          />

          <div className="flex flex-col gap-6">
            <DecisionPanel
              status={status}
              evaluation={evaluation}
              error={error}
              maxAbsBalance={catalog?.max_abs_balance}
            />
            <ConfluenceScore status={status} evaluation={evaluation} error={error} />
            <PermissionPanel
              status={status}
              evaluation={evaluation}
              error={error}
              thresholds={catalog?.thresholds}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
