import { useState } from "react";

import RiskCalculation from "./pages/RiskCalculation.jsx";
import Settings from "./pages/Settings.jsx";
import SetupEvaluation from "./pages/SetupEvaluation.jsx";
import SetupHistory from "./pages/SetupHistory.jsx";

/**
 * Pestañas con estado local, sin librería de routing.
 *
 * Ninguna pantalla depende de una URL propia -- el trader no necesita
 * enlazar directamente a una u otra ni navegar con atrás/adelante -- así
 * que un router entero sería una dependencia nueva para resolver algo que
 * `useState` ya resuelve.
 *
 * Todas las pantallas reciben `irA` para poder saltar entre pestañas (hoy
 * solo lo usa la de evaluación: «ver en el histórico» tras guardar). Solo
 * la activa está montada: cambiar de pestaña desmonta y remonta, así que
 * cada visita al histórico o a configuración relee del backend en vez de
 * enseñar una copia vieja.
 */
const PESTANAS = [
  { id: "setup", etiqueta: "Evaluación de setup", Pantalla: SetupEvaluation },
  { id: "riesgo", etiqueta: "Gestión de riesgo", Pantalla: RiskCalculation },
  { id: "historico", etiqueta: "Histórico", Pantalla: SetupHistory },
  { id: "config", etiqueta: "Configuración", Pantalla: Settings },
];

export default function App() {
  const [activa, setActiva] = useState(PESTANAS[0].id);
  const Pantalla = PESTANAS.find((p) => p.id === activa).Pantalla;

  return (
    <div>
      <nav className="flex gap-1 border-b border-line bg-surface px-6 pt-3">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setActiva(p.id)}
            className={`rounded-t px-4 py-2 text-sm transition-colors ${
              p.id === activa
                ? "border border-b-0 border-line bg-base text-ink"
                : "text-ink-dim hover:text-ink"
            }`}
          >
            {p.etiqueta}
          </button>
        ))}
      </nav>
      <Pantalla irA={setActiva} />
    </div>
  );
}
