import { useEffect, useRef, useState } from "react";

/**
 * El gráfico de precio con RSI, incrustado de TradingView.
 *
 * **Es un widget de terceros, y conviene decirlo.** TradingView se carga desde
 * `s3.tradingview.com` y pinta dentro de un iframe propio: es el único sitio
 * del frontend que trae código de fuera en tiempo de ejecución, frente a la
 * regla del resto del proyecto —fuentes del sistema, sin CDN, React como única
 * dependencia—. Se acepta porque la alternativa era dibujar velas, escalas,
 * temporalidades y el RSI a mano, que es un producto entero, no un componente.
 * No recibe ni un dato del trader: solo un símbolo público.
 *
 * El intervalo por defecto es 4H porque es la temporalidad en la que el modelo
 * busca la divergencia RSI, que es su disparador obligatorio.
 *
 * `.P` en el símbolo son los perpetuos de Bybit: es el mismo mercado que sirve
 * el WebSocket de `linear` del libro de órdenes. Sin el sufijo, TradingView
 * enseñaría el spot, que cotiza parecido pero no es el mismo libro.
 *
 * **Un `console.error` conocido y ajeno.** Cada vez que el widget se monta,
 * su propio script escribe «Cannot listen to the event from the provided
 * iframe, contentWindow is not available». Está dentro de
 * `embed-widget-advanced-chart.js`, en su código de redimensionado, y no hay
 * forma de evitarlo desde fuera: la única sería parchear `console`, que es
 * peor que el ruido. Queda anotado aquí para que nadie lo persiga por el
 * proyecto creyendo que es nuestro.
 */

const SRC =
  "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";

const INTERVALOS = [
  { id: "60", etiqueta: "1H" },
  { id: "240", etiqueta: "4H" },
  { id: "D", etiqueta: "1D" },
  { id: "W", etiqueta: "1S" },
];

export default function TradingViewChart({ simbolo }) {
  const [intervalo, setIntervalo] = useState("240");
  const contenedor = useRef(null);

  useEffect(() => {
    const host = contenedor.current;
    if (!host) return undefined;

    // El widget no tiene API para cambiar de símbolo desde fuera: se vuelve a
    // montar entero. Cada montaje construye su propio marco con la estructura
    // que TradingView espera -- el hueco y el `<script>` como hermanos dentro
    // del contenedor -- y al limpiar se retira **el marco entero**.
    //
    // Retirarlo entero y no vaciarlo por dentro es la diferencia entre que
    // funcione y que reviente: el script de TradingView arranca de forma
    // asíncrona y, cuando lo hace, busca su hueco con
    // `script.parentNode.querySelector(...)`. Si para entonces se le ha
    // quitado el padre —que es lo que hace un `innerHTML = ""`— eso es `null`
    // y su propio código lanza un TypeError. Sacando el marco de la página con
    // el script todavía dentro, el padre sigue existiendo: el widget viejo se
    // monta en un árbol suelto que nadie ve y que se recoge solo.
    const marco = document.createElement("div");
    marco.className = "tradingview-widget-container h-full";
    const hueco = document.createElement("div");
    hueco.className = "tradingview-widget-container__widget h-full";
    marco.appendChild(hueco);

    const script = document.createElement("script");
    script.src = SRC;
    script.async = true;
    script.type = "text/javascript";
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: `BYBIT:${simbolo}.P`,
      interval: intervalo,
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "es",
      // Los colores salen de los mismos tokens que el resto del dashboard, a
      // mano: el iframe es ajeno y no ve nuestro CSS.
      backgroundColor: "#111820",
      gridColor: "rgba(36, 49, 62, 0.5)",
      hide_top_toolbar: false,
      hide_legend: false,
      allow_symbol_change: false, // el símbolo lo manda el selector de la pantalla
      save_image: false,
      studies: ["RSI@tv-basicstudies"],
      support_host: "https://www.tradingview.com",
    });

    marco.appendChild(script);
    host.appendChild(marco);

    return () => marco.remove();
  }, [simbolo, intervalo]);

  return (
    <section className="overflow-hidden rounded-lg border border-line bg-surface">
      <h2 className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5 text-xs uppercase tracking-widest text-ink-dim">
        <span>Precio y RSI · {simbolo}</span>
        <span className="flex gap-1">
          {INTERVALOS.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => setIntervalo(i.id)}
              className={`rounded border px-2 py-0.5 text-[11px] tracking-normal transition-colors ${
                i.id === intervalo
                  ? "border-ink bg-raised text-ink"
                  : "border-line text-ink-dim hover:border-ink-faint hover:text-ink"
              }`}
            >
              {i.etiqueta}
            </button>
          ))}
        </span>
      </h2>

      {/* El contenido lo monta el efecto, no React: dentro de este nodo manda
          TradingView y React no debe intentar reconciliar nada.

          En pantallas grandes crece a lo alto además de a lo ancho: un gráfico
          de velas con su panel de RSI debajo gana más de 200 px de alto que de
          ancho, porque lo que se lee es el recorrido del precio, y en 520 px
          el RSI queda aplastado en una banda de cien píxeles. */}
      <div ref={contenedor} className="h-[520px] 2xl:h-[720px]" />
    </section>
  );
}
