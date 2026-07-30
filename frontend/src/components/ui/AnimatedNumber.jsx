import { useAnimatedNumber } from "../../hooks/useAnimatedNumber.js";

/**
 * Un número que cuenta hacia su valor nuevo en vez de reemplazarse de golpe.
 *
 * `valor` puede ser `null` (Regla A sin balance, un input a medio rellenar):
 * en ese caso se enseña `vacio` sin animar nada -- el hook interno sigue
 * congelado en el último número real, listo para retomar la cuenta.
 * `formatear` recibe el número ya interpolado (con decimales de sobra
 * mientras anima) y decide cómo se escribe.
 *
 * `claseColor`, si se da, recibe también el valor interpolado en cada frame
 * -- no el final -- para que un color que depende del signo (verde/rojo/flat)
 * cambie exactamente cuando la cifra visible cruza cero, igual que la aguja
 * de la barra de balance. Con un color fijo calculado del valor final, un
 * balance que pasa de +80 a -40 se vería rojo mientras el número todavía
 * enseña "+45", un desajuste que salta a la vista en el elemento más mirado
 * del panel.
 */
export default function AnimatedNumber({
  valor,
  formatear = (n) => String(Math.round(n)),
  claseColor,
  vacio = "—",
  duracion,
  className = "",
}) {
  const animado = useAnimatedNumber(valor, { duration: duracion });
  const color = valor == null ? "" : (claseColor?.(animado) ?? "");

  return (
    <span className={`${className} ${color}`.trim()}>
      {valor == null ? vacio : formatear(animado)}
    </span>
  );
}
