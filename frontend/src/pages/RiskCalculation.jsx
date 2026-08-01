import RiskCalculator from "../components/risk/RiskCalculator.jsx";
import { PANTALLA, CONTENEDOR_COMPACTO } from "../lib/anchos.js";

/**
 * Punto de montaje de la entrega 8.
 *
 * Sin relación con la evaluación: el trader llega aquí después de haber
 * decidido la entrada, para saber cuánto arriesga y qué tamaño de posición
 * le corresponde. No hay catálogo ni backend de por medio.
 */
export default function RiskCalculation() {
  return (
    <div className={PANTALLA}>
      <div className={CONTENEDOR_COMPACTO}>
        <header className="pr-14 sm:pr-0">
          <h1 className="text-xl text-ink">Trading Dashboard</h1>
          <p className="mt-1 text-sm text-ink-dim">Gestión de riesgo</p>
        </header>

        <RiskCalculator />
      </div>
    </div>
  );
}
