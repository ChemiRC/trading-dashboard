import { useEffect, useState } from "react";

/**
 * El estado del WebSocket, siempre visible.
 *
 * Es el componente más importante de la pantalla y no enseña ni un dato de
 * mercado. Un libro de órdenes congelado **se ve exactamente igual que uno
 * quieto**: mismos números, mismas barras. Sin decir que la conexión se ha
 * caído, el trader estaría leyendo el libro de hace dos minutos creyendo que
 * es el de ahora, que es peor que no enseñar nada.
 *
 * Por eso, cuando no hay conexión, esto cuenta los segundos en voz alta: da
 * igual el aviso si no dice cuánto de viejo es lo que se está mirando.
 */

const ESTADOS = {
  vivo: { texto: "en vivo", clase: "border-long/50 bg-long-deep/40 text-long" },
  conectando: { texto: "conectando…", clase: "border-cls-medium/40 bg-cls-medium/10 text-cls-medium" },
  caido: { texto: "sin conexión", clase: "border-short/50 bg-short-deep/40 text-short" },
};

export default function ConnectionStatus({ estado, error, ultimoMensaje, onReconectar }) {
  const [, tic] = useState(0);

  // El contador de antigüedad solo tiene sentido —y solo cuesta un render por
  // segundo— mientras la conexión no esté viva. Con datos frescos no hay nada
  // que contar.
  useEffect(() => {
    if (estado === "vivo") return undefined;
    const id = setInterval(() => tic((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [estado]);

  const info = ESTADOS[estado] ?? ESTADOS.conectando;
  const antiguedad =
    ultimoMensaje && estado !== "vivo" ? Math.round((Date.now() - ultimoMensaje) / 1000) : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] uppercase tracking-wider transition-colors ${info.clase}`}
      >
        <span
          aria-hidden
          className={`h-1.5 w-1.5 rounded-full bg-current ${
            estado === "vivo" ? "animate-pulse" : ""
          }`}
        />
        {info.texto}
      </span>

      {antiguedad !== null && (
        <span className="tabular-nums text-[11px] text-ink-faint">
          datos de hace {antiguedad} s
        </span>
      )}

      {error && (
        <span className="text-[11px] text-short" title={error.message}>
          {error.message}
        </span>
      )}

      {estado === "caido" && (
        <button
          type="button"
          onClick={onReconectar}
          className="rounded border border-line px-2 py-0.5 text-[11px] text-ink-dim transition-colors hover:border-ink-faint hover:text-ink"
        >
          Reconectar ahora
        </button>
      )}
    </div>
  );
}
