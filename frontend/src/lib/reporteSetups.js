import { ETIQUETA_DECISION, ETIQUETA_MOTIVO, ETIQUETA_OUTCOME } from "./etiquetas.js";
import { conSigno, formatFecha, formatNumber } from "./format.js";
import { A4, anchoTexto, crearDocumento, partirEnLineas } from "./pdf.js";

/**
 * El histórico de setups, en PDF.
 *
 * Es un **registro para consulta o respaldo**, no un documento de
 * presentación: un bloque por setup, en el mismo orden que la pantalla, con
 * todo lo que hace falta para reconstruir la decisión meses después. Sin
 * color, sin logotipos y sin gráficas — nada de eso sobreviviría a una
 * impresión en blanco y negro, que es donde acaban los respaldos.
 *
 * **Los puntos son los congelados**, los que se aplicaron el día de la
 * evaluación: salen de `points_applied` del detalle guardado, exactamente el
 * mismo campo que pinta la pantalla, y no del catálogo vigente. Cambiar un
 * peso en Configuración no reescribe un PDF de un setup viejo, igual que no
 * reescribe la pantalla. Esa es la garantía que hace comparable el histórico
 * entre meses y por eso el propio documento lo dice en cada bloque.
 *
 * Separado de la interfaz a propósito: aquí no hay ni un `document`, así que
 * se puede probar entero desde Node.
 */

const MARGEN = 42;
const ANCHO_UTIL = A4.ancho - MARGEN * 2;

const CUERPO = 9;
const INTERLINEA = 12;
const ALTO_MINIMO_DE_BLOQUE = 96; // no dejar una cabecera huérfana al pie
const PIE = A4.alto - MARGEN;

/** Columna donde acaban los puntos, alineados a la derecha. */
const X_DERECHA = MARGEN + ANCHO_UTIL;

export function construirReporteSetups(setups, { generadoEl = new Date() } = {}) {
  const doc = crearDocumento();
  const pluma = new Pluma(doc);

  cabecera(pluma, setups, generadoEl);

  setups.forEach((setup, indice) => {
    pluma.reservar(ALTO_MINIMO_DE_BLOQUE);
    if (indice > 0) pluma.separador();
    bloqueDeSetup(pluma, setup);
  });

  if (setups.length === 0) {
    // No debería llegar aquí -- el botón se deshabilita sin setups -- pero un
    // PDF con una línea que lo explique es mejor que uno en blanco.
    pluma.linea("No hay setups guardados en el rango exportado.", { gris: 0.4 });
  }

  return doc.serializar({
    titulo: "Trading Dashboard — Histórico de setups",
    pieDePagina(numero, total) {
      doc.texto(MARGEN, PIE + 14, "Trading Dashboard · Histórico de setups", {
        tamano: 7.5,
        gris: 0.55,
      });
      doc.textoDerecha(X_DERECHA, PIE + 14, `Página ${numero} de ${total}`, {
        tamano: 7.5,
        gris: 0.55,
      });
    },
  });
}

/** Nombre del archivo: ordenable por fecha al listar la carpeta. */
export function nombreDeArchivo(generadoEl = new Date()) {
  const p = (valor) => String(valor).padStart(2, "0");
  return (
    `historico-setups-${generadoEl.getFullYear()}${p(generadoEl.getMonth() + 1)}` +
    `${p(generadoEl.getDate())}-${p(generadoEl.getHours())}${p(generadoEl.getMinutes())}.pdf`
  );
}

// --- Trazo -----------------------------------------------------------------

/**
 * Un cursor que baja por la página y salta a la siguiente cuando se acaba.
 *
 * Todo lo que se dibuja pasa por aquí, así que el salto de página no es una
 * decisión que haya que acordarse de tomar en cada bloque: ocurre solo. Los
 * bloques solo declaran, con `reservar`, cuánto espacio quieren tener por
 * delante antes de empezar.
 */
class Pluma {
  constructor(doc) {
    this.doc = doc;
    this.y = MARGEN;
    doc.nuevaPagina();
  }

  saltarDePagina() {
    this.doc.nuevaPagina();
    this.y = MARGEN;
  }

  /** Asegura `alto` puntos disponibles; si no los hay, pasa de página. */
  reservar(alto) {
    if (this.y + alto > PIE) this.saltarDePagina();
  }

  /** Una línea de texto, con salto automático. Devuelve la `y` donde cayó. */
  linea(texto, opciones = {}) {
    const alto = opciones.interlinea ?? INTERLINEA;
    this.reservar(alto);
    this.y += alto;
    this.doc.texto(opciones.x ?? MARGEN, this.y, texto, opciones);
    return this.y;
  }

  /** Texto a la izquierda y otro pegado al margen derecho, en la misma línea. */
  lineaConDerecha(izquierda, derecha, opciones = {}) {
    const y = this.linea(izquierda, opciones);
    this.doc.textoDerecha(X_DERECHA, y, derecha, { ...opciones, ...(opciones.derecha ?? {}) });
  }

  /** Texto largo, partido en tantas líneas como haga falta. */
  parrafo(texto, opciones = {}) {
    const x = opciones.x ?? MARGEN;
    const ancho = X_DERECHA - x;
    for (const linea of partirEnLineas(texto, ancho, opciones.tamano ?? CUERPO, opciones.negrita)) {
      this.linea(linea, opciones);
    }
  }

  separador() {
    this.espacio(10);
    this.reservar(8);
    this.doc.linea(MARGEN, this.y, X_DERECHA, { gris: 0.82 });
    this.espacio(4);
  }

  espacio(alto) {
    this.y += alto;
  }
}

// --- Secciones -------------------------------------------------------------

function cabecera(pluma, setups, generadoEl) {
  pluma.linea("Trading Dashboard", { tamano: 17, negrita: true, interlinea: 20 });
  pluma.linea("Histórico de setups", { tamano: 10.5, gris: 0.35 });

  pluma.espacio(6);
  pluma.linea(rangoDeFechas(setups), { tamano: 9, gris: 0.35 });
  pluma.linea(
    `${setups.length} ${setups.length === 1 ? "setup" : "setups"} · ` +
      `generado el ${formatFecha(generadoEl.toISOString())}`,
    { tamano: 9, gris: 0.35 },
  );

  pluma.espacio(4);
  pluma.parrafo(
    "Los puntos de cada aportación son los congelados el día de la evaluación, no los " +
      "del catálogo vigente: si después se cambió un peso en Configuración, este " +
      "documento sigue mostrando lo que realmente se aplicó.",
    { tamano: 8, gris: 0.45, interlinea: 10 },
  );

  pluma.espacio(8);
  pluma.doc.linea(MARGEN, pluma.y, X_DERECHA, { gris: 0.5, grosor: 0.8 });
  pluma.espacio(2);
}

function bloqueDeSetup(pluma, setup) {
  const encabezado =
    `${formatFecha(setup.evaluated_at)} · ${setup.symbol}` +
    (setup.timeframe ? ` · ${setup.timeframe}` : "");

  pluma.espacio(6);
  pluma.lineaConDerecha(encabezado, veredicto(setup), {
    tamano: 10.5,
    negrita: true,
    interlinea: 14,
  });

  const meta = [
    setup.price_at_evaluation != null
      ? `Precio al evaluar: ${formatNumber(Number(setup.price_at_evaluation))}`
      : null,
    setup.direction ? `Dirección deducida: ${setup.direction}` : null,
    setup.classification_label,
  ].filter(Boolean);
  if (meta.length > 0) pluma.linea(meta.join("   ·   "), { tamano: 8.5, gris: 0.4 });

  // --- Desglose congelado ---
  pluma.espacio(4);
  pluma.linea("Desglose congelado — los puntos del día de la evaluación", {
    tamano: 7.5,
    gris: 0.5,
    interlinea: 11,
  });

  const selecciones = setup.selections ?? [];
  for (const seleccion of selecciones) {
    filaDeAportacion(pluma, seleccion);
  }
  if (selecciones.length === 0) {
    pluma.linea("(sin desglose guardado)", { tamano: CUERPO, gris: 0.5, x: MARGEN + 10 });
  }

  pluma.reservar(INTERLINEA + 4);
  pluma.espacio(2);
  pluma.doc.linea(MARGEN + 10, pluma.y, X_DERECHA, { gris: 0.85 });
  pluma.lineaConDerecha(
    "Balance",
    setup.raw_balance == null ? "— (Regla A: no se calculó)" : conSigno(setup.raw_balance),
    { tamano: CUERPO, negrita: true, x: MARGEN + 10 },
  );

  // --- Motivo del NO TRADE ---
  if (setup.decision === "NO_TRADE" && setup.no_trade_reason) {
    pluma.espacio(4);
    pluma.linea(
      `NO TRADE · ${ETIQUETA_MOTIVO[setup.no_trade_reason] ?? setup.no_trade_reason}`,
      { tamano: 8.5, negrita: true, gris: 0.2 },
    );
    if (setup.no_trade_message) {
      pluma.parrafo(setup.no_trade_message, { tamano: 8.5, gris: 0.35, interlinea: 11 });
    }
  }

  // --- Notas del setup ---
  if (setup.notes) {
    pluma.espacio(4);
    pluma.linea("Notas", { tamano: 7.5, gris: 0.5, interlinea: 11 });
    pluma.parrafo(setup.notes, { tamano: 8.5, gris: 0.25, interlinea: 11 });
  }

  // --- Resultado ---
  pluma.espacio(4);
  if (setup.decision === "NO_TRADE") {
    pluma.linea("Resultado: no aplica — quedarse fuera no tiene desenlace.", {
      tamano: 8.5,
      gris: 0.45,
    });
  } else if (!setup.outcome) {
    pluma.linea("Resultado: sin registrar.", { tamano: 8.5, gris: 0.45 });
  } else {
    pluma.linea(`Resultado: ${resultado(setup)}`, { tamano: 8.5, negrita: true, gris: 0.15 });
    if (setup.result_notes) {
      pluma.parrafo(setup.result_notes, { tamano: 8.5, gris: 0.35, interlinea: 11 });
    }
  }
}

/**
 * Una aportación: indicador, opción elegida y puntos.
 *
 * La opción se recorta si no cabe entre el nombre del indicador y la columna
 * de puntos. Recortar y no partir en dos líneas es deliberado: son seis filas
 * que se leen en columna, y una que ocupe el doble rompe la lectura de un
 * vistazo -- que es justamente para lo que sirve el desglose.
 */
function filaDeAportacion(pluma, seleccion) {
  const puntos = `${conSigno(seleccion.points_applied)} / ${seleccion.max_weight}`;
  const x = MARGEN + 10;
  const anchoNombre = 118;

  const y = pluma.linea(seleccion.indicator_name, { tamano: CUERPO, x, gris: 0.1 });

  const disponible = X_DERECHA - (x + anchoNombre) - anchoTexto(puntos, CUERPO, true) - 12;
  pluma.doc.texto(x + anchoNombre, y, recortar(seleccion.option_label, disponible), {
    tamano: CUERPO,
    gris: 0.42,
  });
  pluma.doc.textoDerecha(X_DERECHA, y, puntos, { tamano: CUERPO, negrita: true, gris: 0.1 });
}

function recortar(texto, anchoMax) {
  if (anchoMax <= 0) return "";
  if (anchoTexto(texto, CUERPO) <= anchoMax) return texto;
  let salida = "";
  for (const caracter of texto) {
    if (anchoTexto(`${salida + caracter}…`, CUERPO) > anchoMax) break;
    salida += caracter;
  }
  return `${salida.trimEnd()}…`;
}

// --- Textos derivados ------------------------------------------------------

function veredicto(setup) {
  const etiqueta = ETIQUETA_DECISION[setup.decision] ?? setup.decision;
  if (setup.raw_balance == null) return etiqueta;
  return `${etiqueta}   ${conSigno(setup.raw_balance)}`;
}

function resultado(setup) {
  const partes = [ETIQUETA_OUTCOME[setup.outcome] ?? setup.outcome];
  if (setup.pnl_net != null) {
    const pnl = Number(setup.pnl_net);
    partes.push(`${pnl > 0 ? "+" : ""}${formatNumber(pnl)} USDT`);
  }
  if (setup.result_created_at) {
    partes.push(`registrado el ${formatFecha(setup.result_created_at)}`);
  }
  // Una corrección posterior deja huella también en el respaldo: si el
  // resultado se retocó, el documento no debe poder disimularlo.
  if (
    setup.result_updated_at &&
    setup.result_created_at &&
    setup.result_updated_at !== setup.result_created_at
  ) {
    partes.push(`corregido el ${formatFecha(setup.result_updated_at)}`);
  }
  return partes.join(" · ");
}

function rangoDeFechas(setups) {
  const fechas = setups
    .map((s) => s.evaluated_at)
    .filter(Boolean)
    .sort();
  if (fechas.length === 0) return "Sin setups en el rango";
  const desde = formatFecha(fechas[0]);
  const hasta = formatFecha(fechas[fechas.length - 1]);
  return desde === hasta ? `Del ${desde}` : `Del ${desde} al ${hasta}`;
}
