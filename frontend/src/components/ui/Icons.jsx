/**
 * Los siete iconos que usa la interfaz, escritos a mano.
 *
 * **Por qué no `lucide-react`.** Se evaluó y no compensa. Aquí hacen falta
 * siete glifos estáticos que no cambian nunca: eso son unas pocas rutas SVG,
 * no un problema que justifique una dependencia de producción. El proyecto ha
 * tomado la misma decisión en todos los casos equivalentes —`fetch` en vez de
 * axios, pestañas con `useState` en vez de un router, HMAC de la stdlib en vez
 * de una librería de JWT, `urllib` en vez de un cliente HTTP— y el README
 * presume de que React es su única dependencia de producción. Romper esa regla
 * por ocho iconos sería incoherente.
 *
 * Se dibujan con la geometría de lucide (lienzo 24×24, trazo de 2, extremos y
 * uniones redondeados, sin relleno) a propósito: si algún día hacen falta
 * cuarenta iconos en vez de ocho, instalar la librería será sustituir este
 * archivo y nada más.
 *
 * `currentColor` en el trazo: el icono se tiñe con el color del texto que lo
 * rodea, así que hereda los estados de hover y activo sin saber nada de ellos.
 */

function Svg({ children, className = "h-4 w-4" }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

/** Decisión: un cuadrante con aguja — el balance de un vistazo. */
export function IconoDecision(props) {
  return (
    <Svg {...props}>
      <path d="M3.5 18a9 9 0 1 1 17 0" />
      <path d="m12 14 4.5-4.5" />
      <circle cx="12" cy="14" r="1.6" />
    </Svg>
  );
}

/** Riesgo: una calculadora. */
export function IconoRiesgo(props) {
  return (
    <Svg {...props}>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M8 6h8" />
      <path d="M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01M16 19h.01" />
    </Svg>
  );
}

/** Operaciones: dos flechas opuestas — lo que entró y salió del exchange. */
export function IconoOperaciones(props) {
  return (
    <Svg {...props}>
      <path d="m8 3-4 4 4 4" />
      <path d="M4 7h16" />
      <path d="m16 21 4-4-4-4" />
      <path d="M20 17H4" />
    </Svg>
  );
}

/** Mercado: velas japonesas — lo que hace el precio ahora mismo. */
export function IconoMercado(props) {
  return (
    <Svg {...props}>
      <rect x="4" y="8" width="4" height="8" rx="1" />
      <path d="M6 4v4M6 16v4" />
      <rect x="15" y="5" width="4" height="7" rx="1" />
      <path d="M17 3v2M17 12v7" />
    </Svg>
  );
}

/** Histórico: un reloj que mira hacia atrás. */
export function IconoHistorico(props) {
  return (
    <Svg {...props}>
      <path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7.5V12l3 2" />
    </Svg>
  );
}

/** Configuración: el engranaje de siempre. */
export function IconoConfiguracion(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      <path d="m4.9 4.9 2.2 2.2M16.9 16.9l2.2 2.2M19.1 4.9l-2.2 2.2M7.1 16.9l-2.2 2.2" />
    </Svg>
  );
}

/**
 * Dirección: la forma acompaña al color.
 *
 * LONG y SHORT se distinguen hoy por verde y rojo, que es el par de colores
 * que peor separa quien tiene daltonismo -- el más común, con diferencia. Una
 * flecha arriba o abajo dice lo mismo sin depender del color, y no estorba a
 * quien sí lo ve.
 */
export function IconoDireccion({ direccion, className = "h-3.5 w-3.5" }) {
  if (direccion !== "LONG" && direccion !== "SHORT") return null;
  return (
    <Svg className={className}>
      {direccion === "LONG" ? <path d="m18 15-6-6-6 6" /> : <path d="m6 9 6 6 6-6" />}
    </Svg>
  );
}
