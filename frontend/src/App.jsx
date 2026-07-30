import { useEffect, useState } from "react";

import { logout } from "./api/auth.js";
import { getToken, onSessionLost } from "./api/client.js";
import Login from "./pages/Login.jsx";
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
 *
 * Por encima de todo eso hay una puerta: sin token no se monta ninguna
 * pantalla. No es una comprobación de seguridad -- esa la hace el backend,
 * que rechaza cualquier `/api/*` sin token válido -- sino de interfaz: sin
 * sesión, todo lo que se pintase sería una sucesión de errores 401.
 */
const PESTANAS = [
  { id: "setup", etiqueta: "Evaluación de setup", Pantalla: SetupEvaluation },
  { id: "riesgo", etiqueta: "Gestión de riesgo", Pantalla: RiskCalculation },
  { id: "historico", etiqueta: "Histórico", Pantalla: SetupHistory },
  { id: "config", etiqueta: "Configuración", Pantalla: Settings },
];

export default function App() {
  const [conSesion, setConSesion] = useState(() => Boolean(getToken()));
  const [activa, setActiva] = useState(PESTANAS[0].id);

  // Si el token caduca a mitad de sesión, el cliente lo borra y avisa: la
  // aplicación vuelve al login sin que ninguna pantalla tenga que enterarse.
  useEffect(() => {
    onSessionLost(() => setConSesion(false));
    return () => onSessionLost(null);
  }, []);

  if (!conSesion) return <Login onEntrar={() => setConSesion(true)} />;

  const Pantalla = PESTANAS.find((p) => p.id === activa).Pantalla;

  function cerrarSesion() {
    logout();
    setConSesion(false);
    setActiva(PESTANAS[0].id);
  }

  return (
    <div>
      <nav className="flex flex-wrap items-center gap-1 border-b border-line bg-surface px-6 pt-3">
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
        <button
          type="button"
          onClick={cerrarSesion}
          className="ml-auto mb-2 text-xs text-ink-faint transition-colors hover:text-ink"
        >
          Cerrar sesión
        </button>
      </nav>
      <Pantalla irA={setActiva} />
    </div>
  );
}
