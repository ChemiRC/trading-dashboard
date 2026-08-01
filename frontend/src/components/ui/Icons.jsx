/**
 * Los iconos de la interfaz, escritos a mano: los seis de pestaña, los seis de
 * indicador y unos pocos sueltos.
 *
 * **Por qué no `lucide-react`.** Se evaluó y no compensa. Son glifos estáticos
 * que no cambian nunca: eso son unas pocas rutas SVG,
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

/** Journal: unas líneas escritas. Marca las operaciones que llevan notas. */
export function IconoJournal(props) {
  return (
    <Svg {...props}>
      <path d="M5 4h11l3 3v13H5z" />
      <path d="M8.5 11h7M8.5 15h4.5" />
    </Svg>
  );
}

/** Vínculo: los dos eslabones. Un setup y su operación. */
export function IconoVinculo(props) {
  return (
    <Svg {...props}>
      <path d="M9.5 14.5a3.5 3.5 0 0 1 0-5l2-2a3.5 3.5 0 0 1 5 5l-1 1" />
      <path d="M14.5 9.5a3.5 3.5 0 0 1 0 5l-2 2a3.5 3.5 0 0 1-5-5l1-1" />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
//  Los seis indicadores del modelo
//
//  Uno por indicador, para poder reconocer la pregunta antes de leerla. No
//  sustituyen al nombre —el catálogo manda y los indicadores se pueden
//  renombrar desde Configuración— sino que lo acompañan: por eso se eligen por
//  `code`, que es estable, y cualquier indicador nuevo cae en un icono neutro
//  en vez de romper la pantalla.
// ---------------------------------------------------------------------------

/** Divergencia: dos trazos que se separan. */
function IconoDivergencia(props) {
  return (
    <Svg {...props}>
      <path d="M3 8c4 0 6 3 9 3s5-3 9-3" />
      <path d="M3 16c4 0 6-3 9-3" />
      <path d="m18 13 3 3-3 3" />
    </Svg>
  );
}

/** Tendencia: la pendiente y su flecha. */
function IconoTendencia(props) {
  return (
    <Svg {...props}>
      <path d="M3 17 10 10l4 4 7-7" />
      <path d="M15 7h6v6" />
    </Svg>
  );
}

/** Soporte y resistencia: dos niveles y el precio entre ellos. */
function IconoNiveles(props) {
  return (
    <Svg {...props}>
      <path d="M3 6h18M3 18h18" />
      <path d="M8 12h8" />
    </Svg>
  );
}

/** Liquidez: la mecha que barre por debajo. */
function IconoLiquidez(props) {
  return (
    <Svg {...props}>
      <rect x="7" y="7" width="4" height="7" rx="1" />
      <path d="M9 4v3M9 14v6" />
      <path d="M4 20h16" />
      <path d="M14 11h6" />
    </Svg>
  );
}

/** Patrones: el triángulo del chartismo. */
function IconoPatron(props) {
  return (
    <Svg {...props}>
      <path d="M3 19 12 5l9 14" />
      <path d="M7.5 14h9" />
    </Svg>
  );
}

/** Barreras: el muro que frena el precio. */
function IconoBarrera(props) {
  return (
    <Svg {...props}>
      <path d="M3 5h18M3 12h18M3 19h18" />
      <path d="M8 5v7M16 12v7" />
    </Svg>
  );
}

/** Cualquier indicador que no esté en la lista: un punto de mira neutro. */
function IconoIndicadorGenerico(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v8M8 12h8" />
    </Svg>
  );
}

const POR_CODIGO = {
  rsi_divergence: IconoDivergencia,
  weekly_trend: IconoTendencia,
  support_resistance: IconoNiveles,
  liquidity: IconoLiquidez,
  chart_pattern: IconoPatron,
  kiyotaka_barrier: IconoBarrera,
};

/** El icono de un indicador por su `code`. Nunca falla: hay uno de reserva. */
export function IconoIndicador({ code, className }) {
  const Componente = POR_CODIGO[code] ?? IconoIndicadorGenerico;
  return <Componente className={className} />;
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
