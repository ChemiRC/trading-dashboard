import { useCallback, useEffect, useMemo, useState } from "react";

import { getCatalog } from "../api/config.js";
import { evaluateSetup } from "../api/setups.js";

/**
 * La evaluación en curso: catálogo, selecciones y veredicto.
 *
 * **Vive por encima de las pestañas, no dentro de «Evaluación».** El dashboard
 * desmonta la pestaña inactiva, así que un estado que viviera dentro de la
 * pantalla se perdería en cuanto el trader saliera de ella: marcaría sus seis
 * opciones, iría a Mercado a mirar el libro o a Riesgo a calcular el tamaño, y
 * al volver se encontraría el formulario en blanco.
 *
 * Colgado del componente que envuelve a todas, marcar una opción dispara
 * `/evaluate` en el acto y el veredicto sigue ahí al volver, sin recalcular ni
 * repreguntar el catálogo.
 *
 * Se monta solo con sesión abierta, así que cerrarla lo desmonta y la
 * evaluación siguiente empieza limpia.
 */
export function useEvaluacion() {
  const [estadoCatalogo, setEstadoCatalogo] = useState("cargando"); // cargando | ok | error
  const [catalogo, setCatalogo] = useState(null);
  const [errorCatalogo, setErrorCatalogo] = useState(null);
  const [selections, setSelections] = useState({});

  const [status, setStatus] = useState("incompleto"); // incompleto | cargando | ok | error
  const [evaluation, setEvaluation] = useState(null);
  const [error, setError] = useState(null);

  // El catálogo se pide una vez. Sus defaults son el punto de partida: el
  // trader solo tiene que tocar lo que discrepe de ellos.
  useEffect(() => {
    const controlador = new AbortController();

    getCatalog({ signal: controlador.signal })
      .then((datos) => {
        setCatalogo(datos);
        // Sin preseleccionar nada: arrancar con las seis ya contestadas por
        // el catálogo escondía el gesto de describir el gráfico -- el trader
        // veía un veredicto antes de haber mirado nada. Empezar en blanco
        // hace que cada respuesta sea deliberada, y el color de cada bloque
        // (ver EvaluationForm.jsx) es justo la señal que sustituye a "ya
        // viene marcado, luego está bien".
        setSelections({});
        setEstadoCatalogo("ok");
      })
      .catch((fallo) => {
        if (fallo.isAborted) return;
        setErrorCatalogo(fallo);
        setEstadoCatalogo("error");
      });

    return () => controlador.abort();
  }, []);

  const indicadores = useMemo(() => catalogo?.indicators ?? [], [catalogo]);
  const completo =
    indicadores.length > 0 && indicadores.every((ind) => ind.code in selections);

  // El backend rechaza con SELECTION_INVALID si falta algún indicador por
  // responder, así que ni se intenta hasta que estén los seis.
  useEffect(() => {
    if (!completo) {
      setStatus("incompleto");
      setEvaluation(null);
      setError(null);
      return undefined;
    }

    const controlador = new AbortController();
    // El veredicto anterior se conserva mientras llega el nuevo: es lo que
    // permite que los paneles atenúen lo que ya había en vez de vaciarse a un
    // "Evaluando…" en blanco con cada clic.
    setStatus("cargando");

    evaluateSetup(selections, { signal: controlador.signal })
      .then((nueva) => {
        setEvaluation(nueva);
        setError(null);
        setStatus("ok");
      })
      .catch((fallo) => {
        if (fallo.isAborted) return;
        setError(fallo);
        setEvaluation(null);
        setStatus("error");
      });

    return () => controlador.abort();
  }, [selections, completo]);

  const elegir = useCallback((indicatorCode, optionCode) => {
    setSelections((prev) => ({ ...prev, [indicatorCode]: optionCode }));
  }, []);

  return {
    // Catálogo
    estadoCatalogo,
    catalogo,
    errorCatalogo,
    indicadores,
    // Selección
    selections,
    elegir,
    completo,
    //: Cuántos indicadores faltan por responder. Lo usan la insignia de la
    //: pestaña y el resumen compacto, que si no tendrían que recalcularlo.
    pendientes: indicadores.filter((ind) => !(ind.code in selections)).length,
    // Veredicto
    status,
    evaluation,
    error,
    decision: evaluation?.decision ?? null,
  };
}
