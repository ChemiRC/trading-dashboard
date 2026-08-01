import { useState } from "react";

import { syncTrades } from "../../api/trades.js";
import Spinner from "../ui/Spinner.jsx";
import { toast } from "../ui/Toast.jsx";

/**
 * Importa el historial de Bybit. Acción manual y deliberada.
 *
 * El resumen se queda en pantalla en vez de irse en un toast: son seis cifras
 * que el trader compara con lo que ve en Bybit, y un aviso que se desvanece
 * a los cuatro segundos obligaría a repetir la sincronización para volver a
 * leerlas. El toast se usa solo para el "ya está", que sí es momentáneo.
 */

function Cifra({ etiqueta, valor, className = "text-ink" }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-ink-faint">{etiqueta}</div>
      <div className={`mt-0.5 text-lg tabular-nums ${className}`}>{valor}</div>
    </div>
  );
}

export default function SyncButton({ onSincronizado }) {
  const [estado, setEstado] = useState("listo"); // listo | sincronizando
  const [resumen, setResumen] = useState(null);
  const [error, setError] = useState(null);

  async function sincronizar() {
    setEstado("sincronizando");
    setError(null);
    try {
      const r = await syncTrades();
      setResumen(r);
      toast(
        r.nuevas > 0
          ? `${r.nuevas} operaciones nuevas · ${r.vinculadas} vinculadas`
          : "Sin operaciones nuevas: el histórico ya estaba al día",
      );
      onSincronizado?.();
    } catch (fallo) {
      if (fallo.isAborted) return;
      setError(fallo);
      toast("No se pudo sincronizar con Bybit", { tipo: "error" });
    } finally {
      setEstado("listo");
    }
  }

  const sincronizando = estado === "sincronizando";

  return (
    <section className="rounded-lg border border-line bg-surface overflow-hidden">
      <h2 className="border-b border-line px-4 py-2.5 text-xs uppercase tracking-widest text-ink-dim">
        Sincronización con Bybit
      </h2>

      <div className="px-4 py-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <button
            type="button"
            onClick={sincronizar}
            disabled={sincronizando}
            className="rounded border border-ink bg-raised px-4 py-2 text-sm text-ink transition-all duration-150 hover:bg-line active:scale-[0.98] disabled:cursor-not-allowed disabled:border-line disabled:bg-transparent disabled:text-ink-faint"
          >
            {sincronizando ? (
              <span className="inline-flex items-center gap-2">
                <Spinner className="border-ink-faint border-t-ink" />
                Sincronizando…
              </span>
            ) : (
              "Sincronizar con Bybit"
            )}
          </button>

          <span className="text-xs leading-relaxed text-ink-faint">
            {sincronizando
              ? "La primera vez recorre dos años en ventanas de siete días; puede tardar."
              : "Trae las operaciones cerradas nuevas. Solo lectura: no ejecuta nada."}
          </span>
        </div>

        {resumen && !sincronizando && (
          <div className="animate-fade-in mt-4 rounded border border-line bg-raised px-4 py-3">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <Cifra etiqueta="Traídas" valor={resumen.traidas} className="text-ink-dim" />
              <Cifra
                etiqueta="Nuevas"
                valor={resumen.nuevas}
                className={resumen.nuevas > 0 ? "text-long" : "text-flat"}
              />
              <Cifra etiqueta="Vinculadas" valor={resumen.vinculadas} className="text-long" />
              <Cifra etiqueta="Sin vincular" valor={resumen.sin_vincular} className="text-flat" />
              <Cifra
                etiqueta="Duplicadas"
                valor={resumen.duplicadas}
                className="text-ink-faint"
              />
            </div>

            <p className="mt-3 text-xs leading-relaxed text-ink-faint">
              {resumen.excluidas > 0 && (
                <>
                  Se descartaron <span className="text-ink-dim">{resumen.excluidas}</span>{" "}
                  operaciones de instrumentos que el trader ya no opera (perpetuos), por eso
                  el total no coincide con el que se ve en Bybit.{" "}
                </>
              )}
              Las duplicadas no son un fallo: cada sincronización relee una ventana hacia
              atrás a propósito, para que nada se quede fuera si una anterior murió a medias.
              {resumen.testnet && (
                <span className="text-cls-medium"> · Conectado a testnet, no a la cuenta real.</span>
              )}
            </p>
          </div>
        )}

        {error && (
          <div className="animate-fade-in mt-4 rounded border border-short/40 bg-short-deep/30 px-3 py-2.5">
            <div className="text-xs text-short">{error.code}</div>
            <div className="mt-0.5 text-sm leading-relaxed text-ink">{error.message}</div>
          </div>
        )}
      </div>
    </section>
  );
}
