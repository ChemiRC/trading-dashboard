/**
 * La etiqueta corta que dice algo sobre lo que tiene al lado.
 *
 * Nació en el formulario de evaluación —«puerta · regla A», «sin responder»—
 * y resultó ser el recurso que mejor funciona de toda la interfaz: una palabra
 * en mayúsculas pequeñas, con un borde del color de lo que significa, que se
 * lee sin leerla. Estaba escrita a mano en cada sitio, así que ahora vive
 * aquí y la usan también Riesgo y Configuración.
 *
 * Cuatro variantes y ni una más: `neutro` para un dato, `ok` para algo que
 * está como debe, `aviso` para lo que conviene mirar y `pendiente` para lo que
 * falta. Añadir una quinta sería empezar a inventar semántica que el resto de
 * la interfaz no comparte.
 */

const CLASES = {
  neutro: "border-line bg-raised text-ink-dim",
  ok: "border-long/50 text-long",
  aviso: "border-cls-medium/50 text-cls-medium",
  pendiente: "border-short/50 text-short",
};

export default function Insignia({ tono = "neutro", titulo, className = "", children }) {
  return (
    <span
      title={titulo}
      className={`inline-block rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
        CLASES[tono] ?? CLASES.neutro
      } ${className}`}
    >
      {children}
    </span>
  );
}
