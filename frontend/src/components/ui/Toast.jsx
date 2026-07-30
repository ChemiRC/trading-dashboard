import { useEffect, useState } from "react";

/**
 * Notificaciones no intrusivas que aparecen y se retiran solas, montadas una
 * vez en `App.jsx`. Cualquier componente las dispara con `toast(mensaje)` sin
 * saber dónde vive `<ToastHost>` en el árbol -- mismo patrón pub-sub que
 * `onSessionLost` en `api/client.js`, elegido por lo mismo: evitar prop
 * drilling para algo que puede dispararse desde cualquier profundidad.
 */

let siguienteId = 0;
let notificar = null;

/**
 * @param {string} mensaje
 * @param {object} [opciones]
 * @param {"ok"|"error"} [opciones.tipo]
 * @param {{label: string, onClick: () => void}} [opciones.accion] Botón
 *   opcional dentro del propio toast -- por ejemplo "Ver en el histórico"
 *   justo después de guardar un setup. Sigue viva mientras el toast esté en
 *   pantalla, no más.
 */
export function toast(mensaje, { tipo = "ok", accion } = {}) {
  notificar?.({ id: ++siguienteId, mensaje, tipo, accion });
}

const DURACION_VISIBLE = 4000;
const DURACION_SALIDA = 250;

const CLASE_TIPO = {
  ok: "border-long/40 bg-long-deep/95 text-ink",
  error: "border-short/40 bg-short-deep/95 text-ink",
};

function ToastItem({ item, onExpirar }) {
  const [saliendo, setSaliendo] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setSaliendo(true), DURACION_VISIBLE);
    const t2 = setTimeout(() => onExpirar(item.id), DURACION_VISIBLE + DURACION_SALIDA);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-center gap-3 rounded border px-4 py-2.5 text-sm shadow-lg shadow-black/40 backdrop-blur transition-all duration-300 ease-out ${
        CLASE_TIPO[item.tipo] ?? CLASE_TIPO.ok
      } ${saliendo ? "translate-x-2 opacity-0" : "animate-fade-in opacity-100"}`}
    >
      <span>{item.mensaje}</span>
      {item.accion && (
        <button
          type="button"
          onClick={() => {
            item.accion.onClick();
            setSaliendo(true);
          }}
          className="whitespace-nowrap text-xs font-semibold underline-offset-2 hover:underline"
        >
          {item.accion.label}
        </button>
      )}
    </div>
  );
}

/** Se monta una sola vez, típicamente en `App.jsx`. */
export default function ToastHost() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    notificar = (item) => setItems((prev) => [...prev, item]);
    return () => {
      notificar = null;
    };
  }, []);

  function expirar(id) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2">
      {items.map((item) => (
        <ToastItem key={item.id} item={item} onExpirar={expirar} />
      ))}
    </div>
  );
}
