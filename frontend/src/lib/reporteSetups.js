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
 *
 * **Se agrupa por mes, como un estado de cuenta.** Una lista continua de
 * cien setups no dice nada por sí sola; separada en meses, con un resumen
 * antes de cada bloque (cuántos LONG/SHORT/NO TRADE, cuántos con resultado y
 * el PnL del periodo), se lee como el registro de disciplina que el
 * histórico quiere ser. El mes es el de `evaluated_at` -- el día que se
 * decidió, no el día en que se cerró el resultado, que puede caer en otro
 * mes distinto y contarse aparte en el resumen del mes en que se registró
 * la evaluación. El recuento de resultados sale de `outcome`, el mismo
 * campo que ya calcula `v_setups_with_outcome` en el backend: aquí no se
 * reescribe qué cuenta como ganada o perdida, solo se tabula.
 */

const MARGEN = 42;
const ANCHO_UTIL = A4.ancho - MARGEN * 2;

const CUERPO = 9;
const INTERLINEA = 12;
const ALTO_MINIMO_DE_BLOQUE = 96; // no dejar una cabecera huérfana al pie
// Banda del mes (22) + separación (8) + hasta dos líneas de resumen (24) +
// regla y hueco final (10): el mínimo para que un encabezado de mes nunca
// aparezca solo al pie de una página con sus setups ya en la siguiente.
const ALTO_MINIMO_DE_ENCABEZADO_MES = 64;
const PIE = A4.alto - MARGEN;

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** Columna donde acaban los puntos, alineados a la derecha. */
const X_DERECHA = MARGEN + ANCHO_UTIL;

export function construirReporteSetups(setups, { generadoEl = new Date() } = {}) {
  const doc = crearDocumento();
  const pluma = new Pluma(doc);

  cabecera(pluma, setups, generadoEl);

  const meses = agruparPorMes(setups);
  meses.forEach((mes, indiceMes) => {
    encabezadoDeMes(pluma, mes, indiceMes === 0);
    mes.setups.forEach((setup, indice) => {
      pluma.reservar(ALTO_MINIMO_DE_BLOQUE);
      if (indice > 0) pluma.separador();
      bloqueDeSetup(pluma, setup);
    });
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

/**
 * Agrupa por mes de `evaluated_at`, del más reciente al más antiguo.
 *
 * El orden de los setups **dentro** de cada mes se conserva tal cual llega
 * -- normalmente el mismo del histórico en pantalla -- así que si el trader
 * había ordenado por balance o por símbolo antes de exportar, ese orden
 * sobrevive dentro de cada bloque de mes; lo único que se reordena es a qué
 * mes pertenece cada uno.
 *
 * La clave es `AAAA-MM`, que ordena bien como texto sin tener que volver a
 * parsear fechas para comparar. Un `evaluated_at` ausente o inválido -- no
 * debería pasar, pero `new Date(null)` da la época Unix y no un error, así
 * que no se confía en que "no truena" signifique "está bien" -- cae en un
 * cajón "sin fecha" que se queda siempre al final, en vez de colarse en
 * enero de 1970 sin que nadie lo note.
 */
function agruparPorMes(setups) {
  const mapa = new Map();
  for (const setup of setups) {
    const clave = claveDeMes(setup.evaluated_at);
    if (!mapa.has(clave)) mapa.set(clave, []);
    mapa.get(clave).push(setup);
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([clave, setups]) => ({ clave, nombre: nombreDeMes(clave), setups, resumen: resumenDelMes(setups) }));
}

export function claveDeMes(iso) {
  if (!iso) return "0000-00";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "0000-00";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function nombreDeMes(clave) {
  if (clave === "0000-00") return "SIN FECHA";
  const [anio, mes] = clave.split("-");
  return `${MESES[Number(mes) - 1].toUpperCase()} ${anio}`;
}

/**
 * Los meses presentes en una lista de setups, del más reciente al más
 * antiguo, con cuántos setups tiene cada uno -- para el selector de "qué mes
 * descargar" de `ExportPdfButton.jsx`. Misma clave `AAAA-MM` que agrupa el
 * PDF, así que filtrar por ella antes de generar el reporte no puede
 * desincronizarse de cómo el propio PDF agrupa después.
 */
export function mesesDisponibles(setups) {
  const conteo = new Map();
  for (const setup of setups) {
    const clave = claveDeMes(setup.evaluated_at);
    conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
  }
  return [...conteo.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([clave, cantidad]) => ({ clave, etiqueta: etiquetaDeMes(clave), cantidad }));
}

function etiquetaDeMes(clave) {
  if (clave === "0000-00") return "Sin fecha";
  const [anio, mes] = clave.split("-");
  const nombre = MESES[Number(mes) - 1];
  return `${nombre[0].toUpperCase()}${nombre.slice(1)} ${anio}`;
}

/**
 * Cuántos LONG/SHORT/NO TRADE, y de los que ya tienen resultado, cuántos
 * ganados/perdidos/breakeven y la suma del PnL.
 *
 * `outcome` es el mismo campo que ya calcula `v_setups_with_outcome` en el
 * backend -- WIN si el PnL es positivo, LOSS si es negativo, BREAKEVEN si es
 * cero, o lo que el trader declaró a mano cuando no hay PnL del exchange.
 * Aquí solo se cuenta lo que ya viene resuelto, nunca se decide de nuevo qué
 * cuenta como ganada.
 */
function resumenDelMes(setups) {
  const porDecision = { LONG: 0, SHORT: 0, NO_TRADE: 0 };
  for (const s of setups) {
    if (s.decision in porDecision) porDecision[s.decision] += 1;
  }

  const conResultado = setups.filter((s) => s.outcome);
  const porOutcome = { WIN: 0, LOSS: 0, BREAKEVEN: 0 };
  let sumaPnl = null;
  for (const s of conResultado) {
    if (s.outcome in porOutcome) porOutcome[s.outcome] += 1;
    if (s.pnl_net != null) sumaPnl = (sumaPnl ?? 0) + Number(s.pnl_net);
  }

  return { total: setups.length, porDecision, conResultado: conResultado.length, porOutcome, sumaPnl };
}

/**
 * El corte entre meses: una banda gris con el nombre en grande, y debajo el
 * resumen antes de los setups uno a uno -- igual que un estado de cuenta
 * separa periodos con su saldo antes del detalle de movimientos.
 *
 * Reserva el hueco de la cabecera **más** el de al menos un bloque de setup
 * de un tirón: sin eso, un mes podría empezar en las últimas líneas de una
 * página y dejar su banda sola, con todos sus setups ya en la siguiente --
 * el mismo problema, un nivel más arriba, que ya resuelve
 * `ALTO_MINIMO_DE_BLOQUE` para cada setup.
 */
function encabezadoDeMes(pluma, mes, esPrimero) {
  // El hueco con el mes anterior se añade ANTES de reservar: si empujar 14px
  // hace que el encabezado ya no quepa, `reservar` salta de página y ese
  // hueco se pierde con el salto -- que es lo correcto, una página nueva no
  // necesita aire extra arriba del todo.
  if (!esPrimero) pluma.espacio(14);
  pluma.reservar(ALTO_MINIMO_DE_ENCABEZADO_MES + ALTO_MINIMO_DE_BLOQUE);

  const altoBanda = 21;
  const yBanda = pluma.y;
  pluma.doc.rectangulo(MARGEN, yBanda, ANCHO_UTIL, altoBanda, { gris: 0.91 });
  pluma.doc.texto(MARGEN + 8, yBanda + 15, mes.nombre, { tamano: 12, negrita: true, gris: 0.15 });
  pluma.y = yBanda + altoBanda + 8;

  const r = mes.resumen;
  pluma.linea(
    `${r.total} ${r.total === 1 ? "setup evaluado" : "setups evaluados"}   ·   ` +
      `${r.porDecision.LONG} LONG   ·   ${r.porDecision.SHORT} SHORT   ·   ` +
      `${r.porDecision.NO_TRADE} NO TRADE`,
    { tamano: 8.5, gris: 0.35 },
  );

  if (r.conResultado > 0) {
    const pl = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`;
    pluma.linea(
      `${r.conResultado} con resultado   ·   ${pl(r.porOutcome.WIN, "ganada", "ganadas")}, ` +
        `${pl(r.porOutcome.LOSS, "perdida", "perdidas")}, ${r.porOutcome.BREAKEVEN} breakeven` +
        (r.sumaPnl != null
          ? `   ·   PnL del mes: ${r.sumaPnl > 0 ? "+" : ""}${formatNumber(r.sumaPnl)} USDT`
          : ""),
      { tamano: 8.5, gris: 0.35 },
    );
  }

  pluma.espacio(2);
  pluma.reservar(8);
  pluma.doc.linea(MARGEN, pluma.y, X_DERECHA, { gris: 0.82 });
  pluma.espacio(6);
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
  // Con etiqueta explícita ("Notas del setup") y no un "Notas" genérico: hay
  // otras dos que pueden aparecer más abajo -- el journal de la operación
  // vinculada y las de cierre -- y las tres son momentos distintos (antes de
  // operar, durante/después en la operación real, al cerrar). Confundirlas
  // sería peor que no tenerlas.
  if (setup.notes) {
    pluma.espacio(4);
    pluma.linea("Notas del setup", { tamano: 7.5, gris: 0.5, interlinea: 11 });
    pluma.parrafo(setup.notes, { tamano: 8.5, gris: 0.25, interlinea: 11 });
  }

  // --- Journal de la operación vinculada ---
  // `trade_journal_notes` es del `trades` enlazado, no del setup: la misma
  // fuente que ya trae `GET /api/setups/{id}` para el puente visual de
  // Histórico -> Operaciones (ver SetupDetail.jsx). Si el setup no tiene
  // operación vinculada, o la tiene pero sin journal, el campo llega null y
  // sencillamente no hay sección -- nada de un hueco vacío con su etiqueta.
  if (setup.trade_journal_notes) {
    pluma.espacio(4);
    pluma.linea("Journal de la operación", { tamano: 7.5, gris: 0.5, interlinea: 11 });
    pluma.parrafo(setup.trade_journal_notes, { tamano: 8.5, gris: 0.25, interlinea: 11 });
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
      pluma.espacio(2);
      pluma.linea("Notas de cierre", { tamano: 7.5, gris: 0.5, interlinea: 11 });
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
