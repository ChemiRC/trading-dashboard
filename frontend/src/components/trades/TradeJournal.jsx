import { useState } from "react";

import { updateTradeNotes } from "../../api/trades.js";
import BarraGuardado from "../ui/BarraGuardado.jsx";

/**
 * El journal de una operación: por qué se entró, por qué se salió, cómo se
 * vivió.
 *
 * **En todas las operaciones, vengan de donde vengan.** El PnL de una
 * importada de Bybit es el dato contable del exchange y no se toca desde
 * aquí; el motivo de entrada, en cambio, es del trader y no lo sabe nadie
 * más. Distinguir por origen no tendría sentido: la operación improvisada de
 * la que no hay setup es justo la que más falta hace explicar.
 *
 * No se confunde con las notas del resultado —`result_notes`, que se
 * registran en el Histórico— porque hablan de cosas distintas: aquellas del
 * cierre («salió por objetivo»), estas de la operación entera y sobre todo de
 * la decisión.
 *
 * El guardado es explícito, con el mismo gesto que Configuración: escribir
 * marca la fila como sucia, aparece «Guardar», y la confirmación se apaga
 * sola. Guardar al perder el foco haría que un clic accidental fuera de la
 * caja escribiera en la base de datos sin que nadie lo pidiera.
 */
export default function TradeJournal({ trade, onActualizada }) {
  const guardadas = trade.journal_notes ?? "";
  const [borrador, setBorrador] = useState(guardadas);
  const [estado, setEstado] = useState("limpio"); // limpio | guardando | guardado
  const [error, setError] = useState(null);

  const sucio = borrador !== guardadas;

  async function guardar() {
    setEstado("guardando");
    setError(null);
    try {
      const actualizada = await updateTradeNotes(trade.id, borrador.trim() || null);
      // El borrador se iguala a lo que devolvió el backend, no a lo que se
      // tecleó: es él quien normaliza (recorta espacios, convierte el vacío en
      // null), y si no, la fila seguiría pareciendo sucia después de guardar.
      setBorrador(actualizada.journal_notes ?? "");
      setEstado("guardado");
      onActualizada(actualizada);
    } catch (fallo) {
      if (fallo.isAborted) return;
      setError(fallo);
      setEstado("limpio");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[11px] uppercase tracking-wider text-ink-faint">
          Journal de la operación
        </span>
        <span className="text-[11px] text-ink-faint">
          Motivo de entrada, de salida, cómo lo viviste
        </span>
      </div>

      <textarea
        value={borrador}
        onChange={(e) => setBorrador(e.target.value)}
        rows={3}
        maxLength={4000}
        placeholder="Por qué entré aquí, qué me hizo dudar, cómo salí…"
        className="mt-1.5 w-full resize-y rounded border border-line bg-base px-3 py-2 text-sm leading-relaxed text-ink outline-none transition-colors focus:border-ink-faint"
      />

      <BarraGuardado
        sucio={sucio}
        estado={estado}
        error={error}
        onGuardar={guardar}
        onDescartar={() => {
          setBorrador(guardadas);
          setError(null);
        }}
      />
    </div>
  );
}
