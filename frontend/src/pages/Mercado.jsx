import { useState } from "react";

import ConnectionStatus from "../components/market/ConnectionStatus.jsx";
import OrderBookHeatmap from "../components/market/OrderBookHeatmap.jsx";
import OrderBookPressure from "../components/market/OrderBookPressure.jsx";
import SymbolPicker, { SIMBOLOS } from "../components/market/SymbolPicker.jsx";
import TradingViewChart from "../components/market/TradingViewChart.jsx";
import { useOrderBook } from "../hooks/useOrderBook.js";
import { mejores } from "../lib/orderbook.js";
import { PANTALLA, CONTENEDOR_DENSO } from "../lib/anchos.js";

/**
 * Mercado: lo que está pasando ahí fuera, en directo.
 *
 * Es la única pantalla que **no pasa por el backend**. El gráfico lo sirve
 * TradingView y el libro de órdenes viene del WebSocket público de Bybit,
 * los dos directos desde el navegador. Son datos de mercado: públicos,
 * idénticos para cualquiera, sin una sola credencial de por medio. Meter el
 * backend en medio de un flujo de cincuenta mensajes por segundo solo añadiría
 * latencia y un proceso más que mantener despierto, sin proteger nada — porque
 * no hay nada que proteger. Lo que toca la **cuenta** —historial, PnL,
 * posiciones— sigue pasando por el backend y solo el backend tiene llaves.
 *
 * Es contexto, no evidencia. Nada de esta pantalla entra en el score: el
 * modelo se alimenta de lo que el trader describe del gráfico en
 * «Evaluación», y el libro cambia de aspecto cada pocos segundos. Se mira
 * antes de decidir, no se puntúa.
 *
 * El estado vive aquí y no por encima de las pestañas, al revés que la
 * evaluación: un libro de órdenes de hace diez minutos no vale nada, así que
 * desmontar al cambiar de pestaña —y volver a conectar al entrar— es
 * exactamente lo que se quiere. De paso, el socket no sigue abierto mientras
 * el trader rellena el formulario.
 */

const N_POR_DEFECTO = 20;

export default function Mercado() {
  const [simbolo, setSimbolo] = useState(SIMBOLOS[0].id);
  const [n, setN] = useState(N_POR_DEFECTO);

  const { libro, estado, error, ultimoMensaje, diagnostico, reconectarYa } =
    useOrderBook(simbolo);

  const m = mejores(libro);
  // Sin conexión, lo de abajo son los últimos datos recibidos y no los de
  // ahora. Se atenúan: siguen siendo consultables, pero dejan de parecer
  // vigentes, que es lo único que importa que no pase.
  const atenuado = estado !== "vivo" && ultimoMensaje !== null;

  return (
    <div className={PANTALLA}>
      <div className={CONTENEDOR_DENSO}>
        <header className="flex flex-wrap items-baseline justify-between gap-3 pr-14 sm:pr-0">
          <div>
            <h1 className="text-xl text-ink">Trading Dashboard</h1>
            <p className="mt-1 text-sm text-ink-dim">
              Mercado — precio, RSI y libro de órdenes en directo
            </p>
          </div>
          <SymbolPicker valor={simbolo} onCambiar={setSimbolo} />
        </header>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-2.5">
          <ConnectionStatus
            estado={estado}
            error={error}
            ultimoMensaje={ultimoMensaje}
            onReconectar={reconectarYa}
          />
          <div className="flex flex-wrap items-baseline gap-4 text-xs tabular-nums">
            <span className="text-ink-faint">
              compra{" "}
              <span className="text-long">{m.bid ? m.bid.etiqueta : "—"}</span>
            </span>
            <span className="text-ink-faint">
              venta{" "}
              <span className="text-short">{m.ask ? m.ask.etiqueta : "—"}</span>
            </span>
            {diagnostico.reconexiones > 0 && (
              <span
                className="text-ink-faint"
                title="Cortes de conexión recuperados y libros pedidos de nuevo por haberse perdido un mensaje"
              >
                {diagnostico.reconexiones}{" "}
                {diagnostico.reconexiones === 1 ? "reconexión" : "reconexiones"}
                {diagnostico.resincronizaciones > 0 &&
                  ` · ${diagnostico.resincronizaciones} resinc.`}
              </span>
            )}
          </div>
        </div>

        <TradingViewChart simbolo={simbolo} />

        {/* Presión y heatmap miden lo mismo desde dos ángulos —el desbalance
            agregado y su reparto por precio— así que van uno al lado del otro
            y comparten el selector de N. */}
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <OrderBookPressure
            libro={libro}
            simbolo={simbolo}
            n={n}
            onCambiarN={setN}
            atenuado={atenuado}
          />
          <OrderBookHeatmap libro={libro} simbolo={simbolo} n={n} atenuado={atenuado} />
        </div>
      </div>
    </div>
  );
}
