/**
 * Indicador mínimo de "hay algo en vuelo". `animate-spin` es utilidad nativa
 * de Tailwind -- no hace falta ni un keyframe propio.
 */
export default function Spinner({ className = "" }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-ink-faint border-t-ink ${className}`}
    />
  );
}
