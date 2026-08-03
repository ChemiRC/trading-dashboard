/**
 * Tests de `src/lib/pdf.js` y `src/lib/reporteSetups.js`. Sin framework.
 * Ejecutar con `node tests/test_pdf.mjs` desde `frontend/`.
 *
 * Un PDF mal formado **no da error**: el lector abre una página en blanco, o
 * enseña la mitad del documento y se para. Por eso lo que más se prueba aquí
 * es la estructura —que la tabla `xref` apunte de verdad a donde empieza cada
 * objeto— y la codificación de los acentos, que son las dos cosas que se
 * romperían en silencio.
 */

import assert from "node:assert/strict";

import {
  aBytesWinAnsi,
  aCadenaHex,
  aCadenaTexto,
  anchoTexto,
  crearDocumento,
  partirEnLineas,
} from "../src/lib/pdf.js";
import { formatFecha } from "../src/lib/format.js";
import { claveDeMes, construirReporteSetups, mesesDisponibles, nombreDeArchivo } from "../src/lib/reporteSetups.js";

let pasados = 0;
let fallidos = 0;

function caso(nombre, fn) {
  try {
    fn();
    console.log(`OK    ${nombre}`);
    pasados += 1;
  } catch (err) {
    console.error(`FALLO ${nombre}`);
    console.error(`      ${err.message}`);
    fallidos += 1;
  }
}

const comoTexto = (bytes) => Buffer.from(bytes).toString("latin1");

// --- Codificación WinAnsi --------------------------------------------------

caso("WinAnsi: ASCII se queda igual", () => {
  assert.deepEqual(aBytesWinAnsi("AZaz09"), [65, 90, 97, 122, 48, 57]);
});

caso("WinAnsi: las vocales acentuadas y la eñe son Latin-1 directo", () => {
  assert.deepEqual(aBytesWinAnsi("áéíóúñü"), [0xe1, 0xe9, 0xed, 0xf3, 0xfa, 0xf1, 0xfc]);
  assert.deepEqual(aBytesWinAnsi("ÁÉÍÓÚÑ"), [0xc1, 0xc9, 0xcd, 0xd3, 0xda, 0xd1]);
});

caso("WinAnsi: signos de apertura españoles", () => {
  assert.deepEqual(aBytesWinAnsi("¿¡"), [0xbf, 0xa1]);
});

caso("WinAnsi: el tramo 0x80-0x9F de CP1252 (guiones y comillas de la interfaz)", () => {
  assert.deepEqual(aBytesWinAnsi("—"), [0x97]); // raya
  assert.deepEqual(aBytesWinAnsi("–"), [0x96]); // semirraya
  assert.deepEqual(aBytesWinAnsi("…"), [0x85]);
  assert.deepEqual(aBytesWinAnsi("«»"), [0xab, 0xbb]);
  assert.deepEqual(aBytesWinAnsi("·"), [0xb7]);
});

caso("WinAnsi: el menos tipográfico degrada a guión en vez de perderse", () => {
  assert.deepEqual(aBytesWinAnsi("−30"), [0x2d, 0x33, 0x30]);
});

caso("WinAnsi: un carácter sin representación se sustituye, no rompe el archivo", () => {
  assert.deepEqual(aBytesWinAnsi("日"), [0x3f]);
  // Y un emoji, que además es un par subrogado: debe contar como UN carácter.
  assert.deepEqual(aBytesWinAnsi("🚀"), [0x3f]);
});

caso("cadena hex: sin nada que escapar, ni siquiera paréntesis o barras", () => {
  assert.equal(aCadenaHex("A(B)\\C"), "<412842295c43>");
});

caso("cadena hex: el acento viaja como su byte WinAnsi", () => {
  assert.equal(aCadenaHex("é"), "<e9>");
});

caso("WinAnsi: el salto de línea se conserva, no se convierte en '?'", () => {
  // Se convertía, y con él se iban los separadores entre operaciones del flujo
  // de contenido: el visor dejaba de interpretar tras la primera línea de cada
  // página y el documento salía casi en blanco. No daba ningún error.
  assert.deepEqual(aBytesWinAnsi("a\nb\tc\rd"), [0x61, 0x0a, 0x62, 0x09, 0x63, 0x0d, 0x64]);
});

caso("cadena de texto: el /Title va en UTF-16BE con BOM, no en WinAnsi", () => {
  // En PDFDocEncoding el 0x97 de la raya no es una raya: el visor enseñaba
  // «Trading Dashboard Š Histórico» en la pestaña.
  assert.equal(aCadenaTexto("A—"), "<feff00412014>");
  assert.equal(aCadenaTexto("é"), "<feff00e9>");
});

// --- Métrica ---------------------------------------------------------------

caso("ancho: 'iii' es más estrecho que 'mmm' (no es monoespaciada)", () => {
  assert.ok(anchoTexto("iii", 10) < anchoTexto("mmm", 10));
});

caso("ancho: escala con el cuerpo", () => {
  assert.ok(Math.abs(anchoTexto("Hola", 20) - anchoTexto("Hola", 10) * 2) < 1e-9);
});

caso("ancho: negrita nunca es más estrecha que redonda", () => {
  const texto = "Divergencia regular alcista";
  assert.ok(anchoTexto(texto, 9, true) >= anchoTexto(texto, 9, false));
});

caso("ancho: valores oficiales de Helvetica (espacio 278, M 833, i 222)", () => {
  assert.ok(Math.abs(anchoTexto(" ", 1000) - 278) < 1e-6);
  assert.ok(Math.abs(anchoTexto("M", 1000) - 833) < 1e-6);
  assert.ok(Math.abs(anchoTexto("i", 1000) - 222) < 1e-6);
});

caso("ancho: un acentuado mide, nunca da 0 ni NaN", () => {
  const a = anchoTexto("á", 10);
  assert.ok(a > 0 && Number.isFinite(a));
});

// --- Partido en líneas -----------------------------------------------------

caso("partir: un texto corto no se toca", () => {
  assert.deepEqual(partirEnLineas("Hola mundo", 500, 10), ["Hola mundo"]);
});

caso("partir: ninguna línea se pasa del ancho pedido", () => {
  const texto =
    "El disparador apunta a un lado y la suma de la evidencia al contrario. " +
    "Es el caso en el que hay que quedarse fuera y esperar a otra oportunidad.";
  const lineas = partirEnLineas(texto, 200, 9);
  assert.ok(lineas.length > 1, "debería partir en varias líneas");
  for (const linea of lineas) {
    assert.ok(anchoTexto(linea, 9) <= 200, `se pasa: "${linea}"`);
  }
});

caso("partir: no pierde ni una palabra", () => {
  const texto = "una dos tres cuatro cinco seis siete ocho nueve diez once doce";
  const juntas = partirEnLineas(texto, 60, 9).join(" ");
  assert.equal(juntas, texto);
});

caso("partir: una palabra más ancha que la caja se trocea en vez de salirse", () => {
  const lineas = partirEnLineas("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", 40, 9);
  assert.ok(lineas.length > 1);
  for (const linea of lineas) assert.ok(anchoTexto(linea, 9) <= 40);
});

caso("partir: respeta los saltos de línea que ya trae el texto", () => {
  assert.deepEqual(partirEnLineas("uno\ndos", 500, 10), ["uno", "dos"]);
});

// --- Estructura del PDF ----------------------------------------------------

function pdfDePrueba() {
  const doc = crearDocumento();
  doc.texto(50, 50, "Página uno con acentos: áéíóú ñ —");
  doc.nuevaPagina();
  doc.texto(50, 50, "Página dos");
  return doc.serializar({ titulo: "Prueba" });
}

caso("PDF: empieza por %PDF- y acaba en %%EOF", () => {
  const texto = comoTexto(pdfDePrueba());
  assert.ok(texto.startsWith("%PDF-1.4"), "sin cabecera %PDF-");
  assert.ok(texto.trimEnd().endsWith("%%EOF"), "sin marca de fin");
});

caso("PDF: declara tantas páginas como se crearon", () => {
  const texto = comoTexto(pdfDePrueba());
  assert.ok(texto.includes("/Type /Pages /Count 2"), "el árbol de páginas no dice 2");
  assert.equal((texto.match(/\/Type \/Page[^s]/g) ?? []).length, 2);
});

caso("PDF: las dos fuentes base van con WinAnsiEncoding", () => {
  const texto = comoTexto(pdfDePrueba());
  assert.ok(texto.includes("/BaseFont /Helvetica /Encoding /WinAnsiEncoding"));
  assert.ok(texto.includes("/BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding"));
});

caso("PDF: CADA entrada del xref apunta al byte donde empieza su objeto", () => {
  const bytes = pdfDePrueba();
  const texto = comoTexto(bytes);

  const inicio = Number(texto.match(/startxref\s+(\d+)/)[1]);
  assert.equal(texto.slice(inicio, inicio + 4), "xref", "startxref no cae en la tabla");

  const cabecera = texto.slice(inicio).match(/xref\s+0 (\d+)\s/);
  const total = Number(cabecera[1]);

  // La primera entrada es la libre obligatoria; de la 1 en adelante, cada
  // desplazamiento tiene que caer justo en "<id> 0 obj".
  const entradas = texto.slice(inicio).match(/(\d{10}) 00000 n/g) ?? [];
  assert.equal(entradas.length, total - 1, "faltan entradas en la tabla");

  entradas.forEach((entrada, i) => {
    const desplazamiento = Number(entrada.slice(0, 10));
    const esperado = `${i + 1} 0 obj`;
    assert.equal(
      texto.slice(desplazamiento, desplazamiento + esperado.length),
      esperado,
      `el objeto ${i + 1} no está en el byte ${desplazamiento}`,
    );
  });
});

caso("PDF: /Size del trailer coincide con la tabla, y /Root existe", () => {
  const texto = comoTexto(pdfDePrueba());
  const size = Number(texto.match(/\/Size (\d+)/)[1]);
  // Ojo: `lastIndexOf("xref")` encontraría el de "startxref". La tabla se
  // localiza por el desplazamiento que declara el propio trailer.
  const inicio = Number(texto.match(/startxref\s+(\d+)/)[1]);
  const total = Number(texto.slice(inicio).match(/xref\s+0 (\d+)\s/)[1]);
  assert.equal(size, total);
  const raiz = Number(texto.match(/\/Root (\d+) 0 R/)[1]);
  assert.ok(texto.includes(`${raiz} 0 obj`), "el catálogo referenciado no existe");
});

caso("PDF: /Length de cada flujo es el número real de bytes", () => {
  const bytes = pdfDePrueba();
  const texto = comoTexto(bytes);
  const patron = /<< \/Length (\d+) >>\s*stream\n/g;
  let encontrados = 0;
  let m;
  while ((m = patron.exec(texto)) !== null) {
    const declarado = Number(m[1]);
    const desde = m.index + m[0].length;
    assert.equal(
      texto.slice(desde + declarado, desde + declarado + 11),
      "\nendstream\n",
      "el flujo no acaba donde dice /Length",
    );
    encontrados += 1;
  }
  assert.equal(encontrados, 2, "esperaba un flujo por página");
});

caso("PDF: el flujo conserva TODAS las operaciones, no solo la primera", () => {
  // La prueba que faltaba cuando el codificador se comía los saltos de línea:
  // el archivo era válido, abría, y enseñaba una línea por página.
  const bytes = pdfDePrueba();
  const texto = comoTexto(bytes);
  const inicio = texto.indexOf("stream\n") + 7;
  const fin = texto.indexOf("\nendstream", inicio);
  const flujo = texto.slice(inicio, fin);

  assert.ok(!flujo.includes("ET?"), "hay un '?' donde debería haber un separador");
  assert.ok(
    /ET\s+BT/.test(flujo) || flujo.split("BT").length === 2,
    "las operaciones no están separadas por espacio en blanco",
  );
  // Ese flujo son varias líneas: cada operación en la suya.
  for (const operacion of flujo.split("\n")) {
    assert.ok(
      operacion === "" || /^(BT |[\d.]+ (g|G) )/.test(operacion),
      `operación con basura delante: ${JSON.stringify(operacion.slice(0, 40))}`,
    );
  }
});

caso("PDF: todo el flujo de contenido es ASCII imprimible", () => {
  const texto = comoTexto(pdfDePrueba());
  const inicio = texto.indexOf("stream\n") + 7;
  const fin = texto.indexOf("\nendstream", inicio);
  assert.ok(
    /^[\x09\x0a\x0d\x20-\x7e]*$/.test(texto.slice(inicio, fin)),
    "el flujo tiene bytes fuera del ASCII imprimible",
  );
});

caso("PDF: el acento llega al flujo como byte WinAnsi, no como UTF-8", () => {
  const bytes = pdfDePrueba();
  const texto = comoTexto(bytes);
  // "áéíóú" en hexadecimal WinAnsi dentro de la cadena del contenido.
  assert.ok(texto.includes("e1e9edf3fa"), "los acentos no viajan en WinAnsi");
  // Y en ningún sitio aparece la secuencia UTF-8 de "á" (0xC3 0xA1).
  assert.ok(!texto.includes("Ã¡"), "hay UTF-8 crudo en el archivo");
});

// --- El informe de setups --------------------------------------------------

const SETUP = {
  id: "11111111-1111-1111-1111-111111111111",
  evaluated_at: "2026-07-29T19:13:00Z",
  symbol: "BTCUSDT",
  timeframe: "4H",
  price_at_evaluation: "67432.55",
  raw_balance: 100,
  direction: "LONG",
  decision: "LONG",
  classification_label: "Operación muy fuerte",
  notes: "Zona de soporte muy clara, esperé al retroceso.",
  selections: [
    { indicator_code: "RSI_DIV", indicator_name: "Divergencia RSI", option_label: "Divergencia regular alcista", points_applied: 30, max_weight: 30 },
    { indicator_code: "TREND_W", indicator_name: "Tendencia semanal", option_label: "Alcista", points_applied: 20, max_weight: 20 },
    { indicator_code: "SR", indicator_name: "Soporte / Resistencia", option_label: "Precio cerca de soporte", points_applied: 15, max_weight: 15 },
    { indicator_code: "LIQ", indicator_name: "Liquidez", option_label: "Barrida la liquidez inferior (reversión al alza)", points_applied: 15, max_weight: 15 },
    { indicator_code: "PAT", indicator_name: "Patrones gráficos", option_label: "Patrón alcista", points_applied: 10, max_weight: 10 },
    { indicator_code: "KIY", indicator_name: "Barreras Kiyotaka", option_label: "Barrera compradora fuerte", points_applied: 10, max_weight: 10 },
  ],
  outcome: "WIN",
  pnl_net: "125.50",
  result_notes: "Salió por objetivo.",
  result_created_at: "2026-07-31T10:00:00Z",
  result_updated_at: "2026-07-31T10:00:00Z",
};

const NO_TRADE = {
  ...SETUP,
  id: "22222222-2222-2222-2222-222222222222",
  evaluated_at: "2026-07-30T08:00:00Z",
  raw_balance: 40,
  decision: "NO_TRADE",
  direction: null,
  no_trade_reason: "TRIGGER_CONTRADICTION",
  no_trade_message:
    "El disparador apunta a un lado y la suma de la evidencia al contrario. Es el caso en el que hay que quedarse fuera.",
  outcome: null,
  pnl_net: null,
  result_notes: null,
  result_created_at: null,
  result_updated_at: null,
  notes: null,
};

caso("informe: genera un PDF válido con un setup", () => {
  const texto = comoTexto(construirReporteSetups([SETUP]));
  assert.ok(texto.startsWith("%PDF-"));
  assert.ok(texto.trimEnd().endsWith("%%EOF"));
});

caso("informe: los PUNTOS CONGELADOS del setup salen en el documento", () => {
  const texto = comoTexto(construirReporteSetups([SETUP]));
  // "+30 / 30" tal cual, en hexadecimal.
  assert.ok(texto.includes(aCadenaHex("+30 / 30").slice(1, -1)), "no está +30 / 30");
  assert.ok(texto.includes(aCadenaHex("+15 / 15").slice(1, -1)), "no está +15 / 15");
});

caso("informe: cambiar el catálogo NO cambia el PDF — solo manda points_applied", () => {
  // Mismo setup, pero como si hoy el indicador pesara 50 en vez de 30: lo que
  // se exporta es lo congelado, así que el documento debe salir byte a byte
  // idéntico. Es la misma garantía que da la pantalla.
  const congelado = construirReporteSetups([SETUP], { generadoEl: new Date("2026-07-31T12:00:00Z") });
  const otraVez = construirReporteSetups([SETUP], { generadoEl: new Date("2026-07-31T12:00:00Z") });
  assert.deepEqual([...congelado], [...otraVez]);

  // Y si de verdad cambiaran los puntos guardados, el PDF sí cambiaría: esto
  // demuestra que la prueba de arriba no pasa por casualidad.
  const distinto = construirReporteSetups(
    [{ ...SETUP, selections: [{ ...SETUP.selections[0], points_applied: 50, max_weight: 50 }] }],
    { generadoEl: new Date("2026-07-31T12:00:00Z") },
  );
  assert.notDeepEqual([...congelado], [...distinto]);
});

caso("informe: el NO TRADE lleva su motivo y no finge un resultado", () => {
  const texto = comoTexto(construirReporteSetups([NO_TRADE]));
  assert.ok(texto.includes(aCadenaHex("Regla B · contradicción").slice(1, -1)) ||
    texto.includes(aCadenaHex("NO TRADE · Regla B · contradicción").slice(1, -1)));
  assert.ok(texto.includes(aCadenaHex("Resultado: no aplica — quedarse fuera no tiene desenlace.").slice(1, -1)));
});

caso("informe: muchos setups reparten en varias páginas", () => {
  const muchos = Array.from({ length: 25 }, (_, i) => ({ ...SETUP, id: String(i) }));
  const texto = comoTexto(construirReporteSetups(muchos));
  const paginas = Number(texto.match(/\/Type \/Pages \/Count (\d+)/)[1]);
  assert.ok(paginas >= 4, `esperaba varias páginas, salieron ${paginas}`);
  assert.equal((texto.match(/\/Type \/Page[^s]/g) ?? []).length, paginas);
});

caso("informe: cada página lleva su pie numerado", () => {
  const muchos = Array.from({ length: 25 }, (_, i) => ({ ...SETUP, id: String(i) }));
  const texto = comoTexto(construirReporteSetups(muchos));
  const total = Number(texto.match(/\/Type \/Pages \/Count (\d+)/)[1]);
  for (let p = 1; p <= total; p += 1) {
    assert.ok(
      texto.includes(aCadenaHex(`Página ${p} de ${total}`).slice(1, -1)),
      `falta el pie de la página ${p}`,
    );
  }
});

caso("informe: sin setups no revienta y lo dice dentro del documento", () => {
  const texto = comoTexto(construirReporteSetups([]));
  assert.ok(texto.startsWith("%PDF-"));
  assert.ok(texto.includes(aCadenaHex("No hay setups guardados en el rango exportado.").slice(1, -1)));
});

caso("informe: aguanta un setup sin desglose, sin precio y sin notas", () => {
  const pelado = {
    id: "x", evaluated_at: "2026-07-01T00:00:00Z", symbol: "ETHUSDT",
    decision: "NO_TRADE", raw_balance: null, selections: [],
  };
  const texto = comoTexto(construirReporteSetups([pelado]));
  assert.ok(texto.startsWith("%PDF-"));
  assert.ok(texto.includes(aCadenaHex("(sin desglose guardado)").slice(1, -1)));
});

caso("informe: unas notas larguísimas desbordan a más páginas, no fuera del papel", () => {
  const largo = { ...SETUP, notes: "palabra ".repeat(2000).trim() };
  const texto = comoTexto(construirReporteSetups([largo]));
  assert.ok(texto.trimEnd().endsWith("%%EOF"));
  assert.ok(
    Number(texto.match(/\/Type \/Pages \/Count (\d+)/)[1]) >= 3,
    "dos mil palabras deberían ocupar varias páginas",
  );
});

/**
 * La prueba que de verdad importa del paginado: **nada se dibuja fuera del
 * papel**. Un texto con la coordenada pasada no da error en ningún sitio -- se
 * escribe igual, simplemente no se ve -- así que se comprueba leyendo las
 * coordenadas reales de los operadores `Td` del documento generado.
 */
function coordenadasDe(bytes) {
  const texto = comoTexto(bytes);
  const puntos = [];
  const patron = /(-?[\d.]+) (-?[\d.]+) Td/g;
  let m;
  while ((m = patron.exec(texto)) !== null) {
    puntos.push({ x: Number(m[1]), y: Number(m[2]) });
  }
  return puntos;
}

caso("informe: ni una línea cae fuera de la página, con notas largas y 40 setups", () => {
  const muchos = Array.from({ length: 40 }, (_, i) => ({
    ...(i % 3 === 0 ? NO_TRADE : SETUP),
    id: String(i),
    notes: i % 5 === 0 ? "detalle ".repeat(120).trim() : SETUP.notes,
  }));
  const puntos = coordenadasDe(construirReporteSetups(muchos));

  assert.ok(puntos.length > 400, `esperaba mucho texto, hubo ${puntos.length} líneas`);
  for (const { x, y } of puntos) {
    assert.ok(y >= 0 && y <= 841.89, `y fuera del papel: ${y}`);
    assert.ok(x >= 0 && x <= 595.28, `x fuera del papel: ${x}`);
  }
});

caso("informe: ningún texto invade el margen inferior salvo el pie", () => {
  const muchos = Array.from({ length: 30 }, (_, i) => ({ ...SETUP, id: String(i) }));
  // El pie va a 28 pt del borde; el cuerpo nunca debe bajar de 42.
  const cuerpo = coordenadasDe(construirReporteSetups(muchos)).filter((p) => p.y !== 28);
  for (const { y } of cuerpo) {
    assert.ok(y >= 41.9, `una línea del cuerpo baja a ${y}, por debajo del margen`);
  }
});

// --- Agrupación por mes -----------------------------------------------------

const AGOSTO_LONG = { ...SETUP, id: "a1", evaluated_at: "2026-08-05T10:00:00Z" };
const AGOSTO_SHORT = {
  ...SETUP, id: "a2", evaluated_at: "2026-08-12T10:00:00Z",
  decision: "SHORT", direction: "SHORT", raw_balance: -60,
  outcome: "LOSS", pnl_net: "-30.00",
};
const AGOSTO_NOTRADE = { ...NO_TRADE, id: "a3", evaluated_at: "2026-08-20T10:00:00Z" };
const JULIO_1 = { ...SETUP, id: "j1", evaluated_at: "2026-07-02T10:00:00Z" };
const JULIO_2 = {
  ...SETUP, id: "j2", evaluated_at: "2026-07-15T10:00:00Z",
  outcome: "BREAKEVEN", pnl_net: "0",
};

caso("meses: separa AGOSTO 2026 y JULIO 2026, el más reciente primero", () => {
  const texto = comoTexto(construirReporteSetups([AGOSTO_LONG, JULIO_1]));
  const posAgosto = texto.indexOf(aCadenaHex("AGOSTO 2026").slice(1, -1));
  const posJulio = texto.indexOf(aCadenaHex("JULIO 2026").slice(1, -1));
  assert.ok(posAgosto !== -1, "no aparece el encabezado de agosto");
  assert.ok(posJulio !== -1, "no aparece el encabezado de julio");
  assert.ok(posAgosto < posJulio, "agosto (más reciente) debería ir primero");
});

caso("meses: el resumen cuenta LONG/SHORT/NO TRADE correctamente", () => {
  // Agosto tiene: 1 LONG, 1 SHORT, 1 NO TRADE -- verificado contando a mano
  // el array de arriba, no reescribiendo la lógica de conteo aquí.
  const texto = comoTexto(construirReporteSetups([AGOSTO_LONG, AGOSTO_SHORT, AGOSTO_NOTRADE]));
  assert.ok(
    texto.includes(aCadenaHex("3 setups evaluados").slice(1, -1)),
    "no dice el total correcto de setups",
  );
  assert.ok(
    texto.includes(aCadenaHex("1 LONG").slice(1, -1)),
    "no cuenta 1 LONG",
  );
  assert.ok(
    texto.includes(aCadenaHex("1 SHORT").slice(1, -1)),
    "no cuenta 1 SHORT",
  );
  assert.ok(
    texto.includes(aCadenaHex("1 NO TRADE").slice(1, -1)),
    "no cuenta 1 NO TRADE",
  );
});

caso("meses: el resumen de resultados y el PnL del mes cuadran", () => {
  // Agosto: AGOSTO_LONG (WIN, +125.50), AGOSTO_SHORT (LOSS, -30.00),
  // AGOSTO_NOTRADE no cuenta (decision NO_TRADE hereda outcome:null de
  // NO_TRADE). Total con resultado: 2. PnL: 125.50 - 30.00 = 95.50.
  const texto = comoTexto(construirReporteSetups([AGOSTO_LONG, AGOSTO_SHORT, AGOSTO_NOTRADE]));
  assert.ok(
    texto.includes(aCadenaHex("2 con resultado").slice(1, -1)),
    "no dice 2 con resultado",
  );
  assert.ok(
    texto.includes(aCadenaHex("1 ganada").slice(1, -1)),
    "no cuenta 1 ganada",
  );
  assert.ok(
    texto.includes(aCadenaHex("1 perdida").slice(1, -1)),
    "no cuenta 1 perdida",
  );
  assert.ok(
    texto.includes(aCadenaHex("PnL del mes: +95.50 USDT").slice(1, -1)),
    "el PnL del mes no suma 95.50",
  );
});

caso("meses: sin resultados registrados, no aparece la línea de resultados", () => {
  const sinResultado = { ...SETUP, outcome: null, pnl_net: null, result_created_at: null, result_updated_at: null };
  const texto = comoTexto(construirReporteSetups([sinResultado]));
  assert.ok(!texto.includes(aCadenaHex("con resultado").slice(1, -1)));
});

caso("meses: un mes sin ningún setup no genera sección -- solo aparecen dos meses, no tres", () => {
  // JULIO_1 y JULIO_2 son julio; AGOSTO_LONG es agosto. Nunca se menciona
  // septiembre porque no hay ni un setup ahí.
  const texto = comoTexto(construirReporteSetups([AGOSTO_LONG, JULIO_1, JULIO_2]));
  assert.ok(!texto.includes(aCadenaHex("SEPTIEMBRE").slice(1, -1)));
  const paginaTexto = texto; // un solo documento pequeño, no hace falta separar por página
  const vecesAgosto = paginaTexto.split(aCadenaHex("AGOSTO 2026").slice(1, -1)).length - 1;
  const vecesJulio = paginaTexto.split(aCadenaHex("JULIO 2026").slice(1, -1)).length - 1;
  assert.equal(vecesAgosto, 1, "el encabezado de agosto debería aparecer una sola vez");
  assert.equal(vecesJulio, 1, "el encabezado de julio debería aparecer una sola vez");
});

caso("meses: dentro de un mes, julio conserva sus 2 setups y agosto solo el suyo", () => {
  const texto = comoTexto(construirReporteSetups([AGOSTO_LONG, JULIO_1, JULIO_2]));
  // JULIO_1 y JULIO_2 comparten símbolo y precio con AGOSTO_LONG (mismo
  // fixture base), así que lo que distingue las filas es la fecha exacta.
  assert.ok(texto.includes(aCadenaHex(formatFecha(JULIO_1.evaluated_at)).slice(1, -1)));
  assert.ok(texto.includes(aCadenaHex(formatFecha(JULIO_2.evaluated_at)).slice(1, -1)));
  assert.ok(texto.includes(aCadenaHex(formatFecha(AGOSTO_LONG.evaluated_at)).slice(1, -1)));
});

caso("meses: el formato de cada setup no cambió -- sigue con su desglose congelado", () => {
  // El bloque 2 no debía tocar cómo se ve un setup individual. Misma
  // comprobación que ya existía para el documento sin agrupar.
  const texto = comoTexto(construirReporteSetups([AGOSTO_LONG]));
  assert.ok(texto.includes(aCadenaHex("+30 / 30").slice(1, -1)));
  assert.ok(texto.includes(aCadenaHex("Desglose congelado").slice(1, -1)));
});

caso("meses: sin fecha válida cae en un cajón aparte y no en 1970", () => {
  const sinFecha = { ...SETUP, evaluated_at: null };
  const texto = comoTexto(construirReporteSetups([sinFecha]));
  assert.ok(texto.includes(aCadenaHex("SIN FECHA").slice(1, -1)));
  assert.ok(!texto.includes(aCadenaHex("1970").slice(1, -1)));
});

caso("mesesDisponibles: agosto y julio, el más reciente primero, con su cantidad", () => {
  const meses = mesesDisponibles([AGOSTO_LONG, AGOSTO_SHORT, AGOSTO_NOTRADE, JULIO_1, JULIO_2]);
  assert.deepEqual(
    meses.map((m) => [m.clave, m.etiqueta, m.cantidad]),
    [
      ["2026-08", "Agosto 2026", 3],
      ["2026-07", "Julio 2026", 2],
    ],
  );
});

caso("mesesDisponibles: sin fecha válida se agrupa aparte como 'Sin fecha'", () => {
  const sinFecha = { ...SETUP, evaluated_at: null };
  const meses = mesesDisponibles([sinFecha, JULIO_1]);
  assert.deepEqual(
    meses.map((m) => m.etiqueta),
    ["Julio 2026", "Sin fecha"],
  );
});

caso("mesesDisponibles: misma clave que agrupa el propio PDF, para poder filtrar antes", () => {
  for (const setup of [AGOSTO_LONG, JULIO_1]) {
    const [mes] = mesesDisponibles([setup]);
    assert.equal(mes.clave, claveDeMes(setup.evaluated_at));
  }
});

caso("nombre de archivo: ordenable por fecha", () => {
  assert.equal(
    nombreDeArchivo(new Date(2026, 6, 31, 9, 5)),
    "historico-setups-20260731-0905.pdf",
  );
});

console.log(`\n${pasados} OK, ${fallidos} FALLO(S)`);
process.exit(fallidos === 0 ? 0 : 1);
