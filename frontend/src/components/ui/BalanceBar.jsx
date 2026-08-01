/**
 * Barra divergente centrada en 0.
 *
 * Crece a la derecha (verde) si el valor es positivo, a la izquierda (rojo) si
 * es negativo. Dentro de la banda neutra —o sin valor todavía— se pinta un
 * punto gris en el centro: ahí no hay convicción que mostrar.
 *
 * Vive en `ui/` y no en `decision/` porque la usan dos cosas distintas que
 * resultan ser el mismo patrón: el **balance del setup** (−100..+100, lo que
 * el trader ha descrito) y la **presión del libro de órdenes** (−1..+1, lo que
 * hace el mercado ahora mismo). Los dos son un número con signo que se inclina
 * a un lado, y leerlos con la misma forma es justo lo que permite compararlos
 * de un vistazo. Lo único que cambia es la escala y cómo se llaman los
 * extremos.
 *
 * Los dos rellenos (long/short) se pintan SIEMPRE, con ancho 0 cuando no
 * aplican, en vez de montarse y desmontarse condicionalmente. Es lo que
 * permite animar la transición: si el div del lado LONG desapareciera del DOM
 * al pasar a SHORT, no habría nada que el navegador pudiera interpolar -- el
 * cambio de ancho de 0% a X% sobre el MISMO elemento sí se anima, como el
 * movimiento de una aguja entre dos lecturas.
 */
export default function BalanceBar({
  valor,
  max = 100,
  umbralNeutral,
  etiquetaIzq = "SHORT",
  etiquetaDer = "LONG",
  formatearExtremo = (n) => String(n),
  alto = "h-6",
  animar = true,
}) {
  const tope = max || 100;
  // Por defecto, un 5% de la escala: es la banda que usaba el Decision Panel
  // (±5 sobre 100) expresada de forma que valga para cualquier escala.
  const neutro = umbralNeutral ?? tope * 0.05;

  const esNulo = valor === null || valor === undefined || Number.isNaN(valor);
  const clamped = esNulo ? 0 : Math.max(-tope, Math.min(tope, valor));
  const esNeutral = esNulo || Math.abs(clamped) <= neutro;
  const esLong = !esNeutral && clamped > 0;
  const anchoMitad = esNeutral ? 0 : (Math.abs(clamped) / tope) * 50;

  const transicion = animar ? "transition-[width] duration-300 ease-out" : "";

  return (
    <div>
      <div className={`relative ${alto} overflow-hidden rounded bg-raised`}>
        {/* Línea base en 0: separa el lado LONG del lado SHORT. */}
        <div className="absolute inset-y-0 left-1/2 z-10 w-0.5 -translate-x-1/2 bg-base" />

        <div
          className={`absolute inset-y-0 left-1/2 rounded-r-[4px] bg-long ${transicion}`}
          style={{ width: `${esLong ? anchoMitad : 0}%` }}
        />
        <div
          className={`absolute inset-y-0 right-1/2 rounded-l-[4px] bg-short ${transicion}`}
          style={{ width: `${!esLong && !esNeutral ? anchoMitad : 0}%` }}
        />
        <div
          className={`absolute inset-y-0 left-1/2 w-2 -translate-x-1/2 rounded-full bg-flat transition-opacity duration-300 ${
            esNeutral && !esNulo ? "opacity-100" : "opacity-0"
          }`}
        />
      </div>

      <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-ink-faint">
        <span>
          {etiquetaIzq} −{formatearExtremo(tope)}
        </span>
        <span>0</span>
        <span>
          {etiquetaDer} +{formatearExtremo(tope)}
        </span>
      </div>
    </div>
  );
}
