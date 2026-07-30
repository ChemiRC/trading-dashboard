import { useEffect, useRef, useState } from "react";

/**
 * Anima un número entre su valor anterior y el nuevo -- un tween con
 * facilidad de salida (ease-out cúbico: arranca rápido, frena al llegar,
 * como el movimiento de una aguja), en vez de reemplazarlo de golpe.
 *
 * `target` puede llegar `null`/`undefined` -- por ejemplo mientras la Regla A
 * no calcula balance, o antes de que el trader termine de rellenar un
 * formulario -- y en ese caso el hook no anima nada: el valor se congela en
 * el último número real, listo para retomar la cuenta la próxima vez que
 * llegue uno. Quien lo usa decide qué pintar mientras tanto (normalmente
 * "—"), comprobando `target == null` por su cuenta.
 *
 * Si llega un `target` nuevo a mitad de una animación en marcha -- muy
 * habitual aquí, cada tecleo en un input dispara un recálculo -- el tween
 * redirige desde el valor que se está viendo en ese instante, no desde el
 * punto de partida de la animación anterior. Sin esto, teclear rápido
 * produciría saltos visibles en vez de una curva continua.
 */
export function useAnimatedNumber(target, { duration = 280 } = {}) {
  const [valor, setValor] = useState(() => (target == null ? 0 : target));
  const valorRef = useRef(target == null ? 0 : target);
  const frameRef = useRef(null);

  useEffect(() => {
    if (target == null) return undefined;

    cancelAnimationFrame(frameRef.current);
    const inicio = performance.now();
    const origen = valorRef.current;
    const distancia = target - origen;

    if (distancia === 0) {
      valorRef.current = target;
      setValor(target);
      return undefined;
    }

    function tick(ahora) {
      const t = Math.min(1, (ahora - inicio) / duration);
      const suavizado = 1 - Math.pow(1 - t, 3);
      const actual = origen + distancia * suavizado;
      valorRef.current = actual;
      setValor(actual);
      if (t < 1) frameRef.current = requestAnimationFrame(tick);
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration]);

  return valor;
}
