import { useEffect, useState } from "react";

import { logout } from "./api/auth.js";
import { getToken, onSessionLost } from "./api/client.js";
import ToastHost from "./components/ui/Toast.jsx";
import {
  IconoConfiguracion,
  IconoDecision,
  IconoHistorico,
  IconoMercado,
  IconoOperaciones,
  IconoRiesgo,
} from "./components/ui/Icons.jsx";
import { useEvaluacion } from "./hooks/useEvaluacion.js";
import Evaluacion from "./pages/Evaluacion.jsx";
import Login from "./pages/Login.jsx";
import Mercado from "./pages/Mercado.jsx";
import RiskCalculation from "./pages/RiskCalculation.jsx";
import Settings from "./pages/Settings.jsx";
import SetupHistory from "./pages/SetupHistory.jsx";
import Trades from "./pages/Trades.jsx";

/**
 * Pestañas con estado local, sin librería de routing.
 *
 * Ninguna pantalla depende de una URL propia -- el trader no necesita
 * enlazar directamente a una u otra ni navegar con atrás/adelante -- así
 * que un router entero sería una dependencia nueva para resolver algo que
 * `useState` ya resuelve.
 *
 * Solo la pestaña activa está montada: cambiar de pestaña desmonta y remonta,
 * así que cada visita al histórico, a operaciones o a configuración relee del
 * backend en vez de enseñar una copia vieja. La **excepción es la evaluación
 * en curso**, que vive en `useEvaluacion` por encima de todas: si viviera
 * dentro de su pestaña, ir a Mercado a mirar el libro o a Riesgo a calcular el
 * tamaño devolvería al trader un formulario en blanco.
 *
 * Por encima de todo hay una puerta: sin token no se monta nada. No es la
 * comprobación de seguridad -- esa la hace el backend, que rechaza cualquier
 * `/api/*` sin token válido -- sino de interfaz: sin sesión, todo lo que se
 * pintase sería una sucesión de 401.
 */
const PESTANAS = [
  { id: "mercado", etiqueta: "Mercado", Icono: IconoMercado, Pantalla: Mercado },
  { id: "evaluacion", etiqueta: "Evaluación", Icono: IconoDecision, Pantalla: Evaluacion },
  { id: "riesgo", etiqueta: "Riesgo", Icono: IconoRiesgo, Pantalla: RiskCalculation },
  { id: "operaciones", etiqueta: "Operaciones", Icono: IconoOperaciones, Pantalla: Trades },
  { id: "historico", etiqueta: "Histórico", Icono: IconoHistorico, Pantalla: SetupHistory },
  { id: "config", etiqueta: "Configuración", Icono: IconoConfiguracion, Pantalla: Settings },
];

/**
 * «Mercado» va la primera porque es el orden en el que se mira —contexto,
 * después describir y decidir— pero **la pantalla de arranque sigue siendo
 * «Evaluación»**, que es a lo que se entra a hacer. Abrir sesión no debería
 * levantar un WebSocket y un iframe de TradingView que quizá no se van a
 * mirar.
 */
const PESTANA_INICIAL = "evaluacion";

export default function App() {
  const [conSesion, setConSesion] = useState(() => Boolean(getToken()));

  // Si el token caduca a mitad de sesión, el cliente lo borra y avisa: la
  // aplicación vuelve al login sin que ninguna pantalla tenga que enterarse.
  useEffect(() => {
    onSessionLost(() => setConSesion(false));
    return () => onSessionLost(null);
  }, []);

  if (!conSesion) return <Login onEntrar={() => setConSesion(true)} />;

  // El dashboard va en su propio componente para que `useEvaluacion` —y con él
  // el catálogo y la evaluación en curso— se monte al entrar y se descarte al
  // salir. Con el hook en `App` seguiría vivo tras cerrar sesión, y la
  // siguiente empezaría con las respuestas de la anterior en pantalla.
  return <Dashboard onCerrarSesion={() => setConSesion(false)} />;
}

function Dashboard({ onCerrarSesion }) {
  const [activa, setActiva] = useState(PESTANA_INICIAL);
  const evaluacion = useEvaluacion();

  const { Pantalla } = PESTANAS.find((p) => p.id === activa);

  function cerrarSesion() {
    logout();
    onCerrarSesion();
  }

  return (
    <div>
      <nav className="flex flex-wrap items-center gap-1 border-b border-line bg-surface px-6 pt-3">
        {PESTANAS.map((p) => {
          const esActiva = p.id === activa;
          //: La pestaña «Evaluación» avisa de lo que falta por contestar
          //: desde cualquier pantalla: es el único dato que el trader
          //: necesita ver sin ir a buscarlo.
          const aviso = p.id === "evaluacion" && evaluacion.pendientes > 0;

          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setActiva(p.id)}
              aria-current={esActiva ? "page" : undefined}
              className={`relative inline-flex items-center gap-2 rounded-t px-4 py-2 text-sm transition-colors ${
                esActiva
                  ? "border border-b-0 border-line bg-base text-ink"
                  : "text-ink-dim hover:bg-raised/60 hover:text-ink"
              }`}
            >
              {/* Filete superior en la activa: con siete pestañas, el cambio de
                  fondo por sí solo se lee mal de reojo. */}
              {esActiva && (
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-0.5 rounded-t bg-ink"
                />
              )}
              <p.Icono className={`h-4 w-4 ${esActiva ? "text-ink" : "text-ink-faint"}`} />
              {p.etiqueta}
              {aviso && (
                <span
                  aria-hidden
                  title={`${evaluacion.pendientes} sin responder`}
                  className="ml-0.5 h-1.5 w-1.5 rounded-full bg-cls-medium"
                />
              )}
            </button>
          );
        })}

        <button
          type="button"
          onClick={cerrarSesion}
          className="ml-auto mb-2 text-xs text-ink-faint transition-colors hover:text-ink"
        >
          Cerrar sesión
        </button>
      </nav>

      {/* `key={activa}` fuerza a React a tratar cada pestaña como un árbol
          nuevo -- que ya lo era, cambia el componente entero -- y con eso
          `animate-fade-in` se dispara de cero en cada cambio: sin key, React
          reutilizaría el nodo del contenedor y la animación de entrada no
          volvería a correr en la segunda visita a la misma pestaña. */}
      <div key={activa} className="animate-fade-in">
        <Pantalla evaluacion={evaluacion} irA={setActiva} />
      </div>

      <ToastHost />
    </div>
  );
}
