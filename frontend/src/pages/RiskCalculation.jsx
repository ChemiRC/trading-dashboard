import RiskCalculator from "../components/risk/RiskCalculator.jsx";

/**
 * Punto de montaje de la entrega 8.
 *
 * Sin relación con la evaluación: el trader llega aquí después de haber
 * decidido la entrada, para saber cuánto arriesga y qué tamaño de posición
 * le corresponde. No hay catálogo ni backend de por medio.
 */
export default function RiskCalculation() {
  return (
    <div className="min-h-screen bg-base px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <header>
          <h1 className="text-xl text-ink">Trading Dashboard</h1>
          <p className="mt-1 text-sm text-ink-dim">Gestión de riesgo</p>
        </header>

        <RiskCalculator />
      </div>
    </div>
  );
}
