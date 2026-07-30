import { useEffect, useState } from "react";

/**
 * Ciclo de vida de un aviso temporal: aparece, se mantiene un rato, se
 * desvanece. Lo usan el "✓ Guardado" de la pantalla de configuración y el
 * host de toasts -- dos sitios con exactamente la misma necesidad ("un check
 * que aparece y se desvanece a los 2 segundos, no que se quede indefinido"),
 * así que es un hook y no una copia pegada dos veces.
 *
 * Devuelve `"oculto" | "visible" | "saliendo"`. La salida es su propia fase
 * -- no un `oculto` directo -- para que quien lo usa pueda aplicar una
 * transición de opacidad y que el aviso se apague en vez de desaparecer de
 * golpe.
 */
export function useTimedReveal(activo, { visible = 1800, saliendo = 300 } = {}) {
  const [fase, setFase] = useState("oculto");

  useEffect(() => {
    if (!activo) {
      setFase("oculto");
      return undefined;
    }

    setFase("visible");
    const t1 = setTimeout(() => setFase("saliendo"), visible);
    const t2 = setTimeout(() => setFase("oculto"), visible + saliendo);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [activo, visible, saliendo]);

  return fase;
}
