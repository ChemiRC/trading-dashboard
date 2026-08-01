import { useEffect, useRef } from "react";

import { formatQuantity } from "../../lib/format.js";
import { mejores, niveles, volumenMaximo } from "../../lib/orderbook.js";

/**
 * Heatmap del libro: dónde está el volumen, nivel a nivel.
 *
 * Ordenado por precio y no por tamaño, como un perfil: las ventas arriba, las
 * compras abajo y la horquilla en medio. Es el orden que tiene el libro de
 * verdad, y el que deja ver **a qué distancia del precio** está cada muro —que
 * es la mitad de la información. Una lista ordenada de mayor a menor volumen
 * diría cuánto hay, pero no dónde, y un muro pegado al precio y otro a un 2 %
 * no significan lo mismo.
 *
 * Cada barra se mide contra el nivel más grande visible, no contra un máximo
 * fijo: lo que importa es la proporción entre unos y otros, y el volumen
 * absoluto de un libro de BTC y uno de SOL no se parecen en nada.
 *
 * **Es la foto de ahora, no un histórico.** No se acumula nada en el tiempo:
 * lo que hay en pantalla es el libro de este segundo. Un heatmap con memoria
 * —el que enseña dónde hubo liquidez hace una hora— es otra herramienta y
 * necesita guardar series, no un WebSocket.
 *
 * Enseña los mismos N niveles que mide la presión, a propósito: lo que se ve
 * es exactamente lo que se está contando.
 */

export default function OrderBookHeatmap({ libro, simbolo, n, atenuado }) {
  const compras = niveles(libro, "bids", n);
  // Las ventas llegan de mejor a peor precio; se pintan al revés para que el
  // precio baje de arriba abajo y la mejor venta quede pegada a la horquilla.
  const ventas = niveles(libro, "asks", n).reverse();
  const max = volumenMaximo(compras, ventas);
  const m = mejores(libro);
  const activo = simbolo.replace(/USDT$/, "");

  const scroll = useRef(null);
  const horquilla = useRef(null);
  const yaCentrado = useRef(false);

  // Con N=20 son cuarenta filas y no caben: sin esto la lista abre por arriba
  // y **solo se ve el lado de venta**, con el de compra fuera de la vista. La
  // horquilla se centra en cuanto llega el primer libro, que es donde tiene
  // que estar la mirada: los niveles pegados al precio.
  //
  // Una sola vez por símbolo y por N —no en cada actualización— porque si no,
  // desplazarse a mirar un muro lejano sería imposible: la lista tiraría del
  // scroll de vuelta cinco veces por segundo.
  useEffect(() => {
    yaCentrado.current = false;
  }, [n, simbolo]);

  useEffect(() => {
    if (yaCentrado.current || max === 0) return;
    const caja = scroll.current;
    const fila = horquilla.current;
    if (!caja || !fila) return;
    const cajaR = caja.getBoundingClientRect();
    const filaR = fila.getBoundingClientRect();
    caja.scrollTop += filaR.top - cajaR.top - (caja.clientHeight - filaR.height) / 2;
    yaCentrado.current = true;
  }, [max, n, simbolo]);

  return (
    <section className="overflow-hidden rounded-lg border border-line bg-surface">
      <h2 className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5 text-xs uppercase tracking-widest text-ink-dim">
        <span>Heatmap del libro</span>
        <span className="tracking-normal normal-case text-ink-faint">
          {n} niveles por lado · volumen en {activo}
        </span>
      </h2>

      <div className={`transition-opacity duration-300 ${atenuado ? "opacity-40" : ""}`}>
        {max === 0 ? (
          <p className="animate-pulse px-4 py-8 text-ink-dim">Esperando el libro…</p>
        ) : (
          // En pantallas grandes la caja crece a lo alto: con N=20 son cuarenta
          // filas y en 30rem solo caben unas veinte, así que había que
          // desplazarse dentro del panel para ver los muros lejanos. Lo que NO
          // cambia con el tamaño de la ventana es N: es la medida de la
          // presión, y hacerla depender de cuánta pantalla haya significaría
          // que el mismo libro da un número distinto en el portátil y en el
          // monitor. Aquí solo se ve más de lo mismo.
          <div ref={scroll} className="max-h-[30rem] overflow-y-auto px-2 py-2 2xl:max-h-[44rem]">
            {ventas.map((nivel) => (
              <Fila key={`a-${nivel.etiqueta}`} nivel={nivel} max={max} lado="venta" />
            ))}

            <div
              ref={horquilla}
              className="my-1 flex items-baseline justify-between gap-3 rounded bg-raised px-2 py-1.5 text-xs"
            >
              <span className="tabular-nums text-ink">
                {m.medio === null ? "—" : m.medio.toFixed(precisionDe(m))}
              </span>
              <span className="text-ink-faint">
                {m.spread === null
                  ? "sin horquilla"
                  : `horquilla ${m.spread.toFixed(precisionDe(m))} (${formatPb(m.spreadPct)})`}
              </span>
            </div>

            {compras.map((nivel) => (
              <Fila key={`b-${nivel.etiqueta}`} nivel={nivel} max={max} lado="compra" />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * La horquilla en **puntos básicos** y no en porcentaje. En BTCUSDT es de diez
 * céntimos sobre sesenta mil dólares: en porcentaje son tres ceros y un dígito
 * («0,000 %»), que no dice nada. En pb se lee «0,16 pb» y además es la unidad
 * en la que se comparan horquillas de verdad.
 */
function formatPb(pct) {
  const pb = pct * 100;
  return `${pb.toFixed(pb < 10 ? 2 : 1)} pb`;
}

/**
 * Los decimales del precio salen de la cadena que manda Bybit, no de una
 * constante: el tick de BTCUSDT y el de SOLUSDT no tienen los mismos, y
 * redondear a dos convertiría en idénticos niveles que no lo son.
 */
function precisionDe(m) {
  const referencia = m.bid?.etiqueta ?? m.ask?.etiqueta ?? "";
  const punto = referencia.indexOf(".");
  return punto === -1 ? 0 : referencia.length - punto - 1;
}

function Fila({ nivel, max, lado }) {
  const proporcion = (nivel.volumen / max) * 100;
  const esCompra = lado === "compra";
  const esMayor = nivel.volumen === max;

  return (
    <div
      className="relative flex items-baseline justify-between gap-3 rounded px-2 py-[3px] text-xs"
      title={`${nivel.etiqueta} · ${formatQuantity(nivel.volumen)}`}
    >
      {/* La barra va por detrás del texto y no al lado: así el número se lee
          siempre en la misma posición aunque la barra crezca o encoja cinco
          veces por segundo. */}
      <span
        aria-hidden
        className={`absolute inset-y-0 left-0 rounded transition-[width] duration-200 ease-out ${
          esCompra ? "bg-long/25" : "bg-short/25"
        } ${esMayor ? "ring-1 ring-inset " + (esCompra ? "ring-long/60" : "ring-short/60") : ""}`}
        style={{ width: `${proporcion}%` }}
      />

      <span
        className={`relative tabular-nums ${
          esCompra ? "text-long" : "text-short"
        } ${esMayor ? "" : "opacity-90"}`}
      >
        {nivel.etiqueta}
      </span>
      <span className="relative tabular-nums text-ink-dim">
        {formatQuantity(nivel.volumen)}
      </span>
    </div>
  );
}
