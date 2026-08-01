import BalanceBar from "../ui/BalanceBar.jsx";
import { formatQuantity } from "../../lib/format.js";
import { presion } from "../../lib/orderbook.js";

/**
 * Presión del libro: el desbalance entre compra y venta cerca del precio.
 *
 * **Se pinta con la misma barra que el balance del setup, a propósito.** Son
 * el mismo patrón —un número con signo que se inclina a un lado— y usar la
 * misma forma es lo que permite mirar los dos y compararlos sin traducir nada
 * en la cabeza. Lo único que cambia es la escala: −1..+1 en vez de −100..+100.
 *
 * **Y no entra en el score, ni entrará por su cuenta.** Los seis indicadores
 * del modelo describen el gráfico; esto describe el libro en este segundo, y
 * se lo lleva la corriente en el siguiente. Es contexto para mirar antes de
 * pulsar el botón, no una séptima confluencia. Si algún día el trader decide
 * que debe puntuar, será una fila nueva en `indicator_options` y una decisión
 * suya, no un efecto colateral de esta pantalla.
 */

const NIVELES_POSIBLES = [5, 10, 20, 50];

/** Cómo se lee la magnitud. Bandas anchas: esto no es una medida fina. */
function lectura(valor) {
  const a = Math.abs(valor);
  const lado = valor > 0 ? "compra" : "venta";
  if (a < 0.05) return "libro equilibrado";
  if (a < 0.2) return `ligeramente hacia ${lado}`;
  if (a < 0.4) return `inclinado hacia ${lado}`;
  return `fuertemente hacia ${lado}`;
}

function color(valor) {
  if (valor === null) return "text-flat";
  if (valor > 0.05) return "text-long";
  if (valor < -0.05) return "text-short";
  return "text-flat";
}

export default function OrderBookPressure({ libro, simbolo, n, onCambiarN, atenuado }) {
  const p = presion(libro, n);
  const activo = simbolo.replace(/USDT$/, "");

  return (
    <section className="overflow-hidden rounded-lg border border-line bg-surface">
      <h2 className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5 text-xs uppercase tracking-widest text-ink-dim">
        <span>Presión del libro</span>
        <span className="flex items-center gap-1">
          <span className="mr-1 tracking-normal text-ink-faint normal-case">niveles</span>
          {NIVELES_POSIBLES.map((valor) => (
            <button
              key={valor}
              type="button"
              onClick={() => onCambiarN(valor)}
              className={`rounded border px-2 py-0.5 text-[11px] tabular-nums tracking-normal transition-colors ${
                valor === n
                  ? "border-ink bg-raised text-ink"
                  : "border-line text-ink-dim hover:border-ink-faint hover:text-ink"
              }`}
            >
              {valor}
            </button>
          ))}
        </span>
      </h2>

      <div className={`px-5 py-5 transition-opacity duration-300 ${atenuado ? "opacity-40" : ""}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <span className={`text-6xl leading-none tabular-nums ${color(p.valor)}`}>
            {p.valor === null ? "—" : `${p.valor > 0 ? "+" : p.valor < 0 ? "−" : ""}${Math.abs(p.valor).toFixed(2)}`}
          </span>
          <span className="text-xs text-ink-dim">
            {p.valor === null ? "esperando el libro" : lectura(p.valor)}
          </span>
        </div>

        <div className="mt-6">
          <BalanceBar
            valor={p.valor}
            max={1}
            etiquetaIzq="VENTA"
            etiquetaDer="COMPRA"
            formatearExtremo={(x) => x.toFixed(0)}
          />
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-ink-faint">Compra</dt>
            <dd className="tabular-nums text-long">
              {formatQuantity(p.compra)} <span className="text-ink-faint">{activo}</span>
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-ink-faint">Venta</dt>
            <dd className="tabular-nums text-short">
              {formatQuantity(p.venta)} <span className="text-ink-faint">{activo}</span>
            </dd>
          </div>
        </dl>

        <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-ink-faint">
          Suma del volumen de los {n} niveles más cercanos al precio en cada lado.
          Es la intención del libro <span className="text-ink-dim">ahora mismo</span>,
          no una previsión: son órdenes que se pueden retirar sin ejecutarse. No
          puntúa en el score.
        </p>
      </div>
    </section>
  );
}
