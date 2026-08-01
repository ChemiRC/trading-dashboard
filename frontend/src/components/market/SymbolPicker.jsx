/**
 * El selector de símbolo de la pantalla de Mercado.
 *
 * **Uno solo para toda la pantalla.** El gráfico y el libro de órdenes miran
 * el mismo activo por definición: dos selectores independientes permitirían
 * dejarlos desincronizados —el RSI de BTC junto a la presión de ETH— y eso no
 * es una opción que el trader quiera, es una forma de equivocarse. El símbolo
 * vive en `Mercado.jsx` y baja a los dos.
 *
 * Es una lista cerrada y no un campo de texto: un símbolo mal escrito no falla
 * al escribirlo, falla después, como un rechazo de suscripción del WebSocket
 * que hay que ir a leer. Añadir un par es añadir una línea aquí.
 */

export const SIMBOLOS = [
  { id: "BTCUSDT", etiqueta: "BTC/USDT" },
  { id: "ETHUSDT", etiqueta: "ETH/USDT" },
  { id: "SOLUSDT", etiqueta: "SOL/USDT" },
  { id: "XRPUSDT", etiqueta: "XRP/USDT" },
  { id: "BNBUSDT", etiqueta: "BNB/USDT" },
];

export default function SymbolPicker({ valor, onCambiar }) {
  return (
    <label className="flex items-center gap-2 text-xs text-ink-dim">
      <span className="uppercase tracking-widest">Símbolo</span>
      <select
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        className="rounded border border-line bg-raised px-2.5 py-1.5 font-mono text-sm text-ink transition-colors hover:border-ink-faint focus:border-ink focus:outline-none"
      >
        {SIMBOLOS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.etiqueta}
          </option>
        ))}
      </select>
    </label>
  );
}
