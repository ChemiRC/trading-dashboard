/**
 * Generador de PDF mínimo, sin dependencias.
 *
 * **Por qué no jsPDF.** Se evaluó y no hizo falta. Un PDF es un formato de
 * texto con una tabla de posiciones al final, y este informe es texto en
 * Helvetica sobre A4: ni imágenes, ni fuentes incrustadas, ni transparencias,
 * ni curvas. Helvetica es una de las catorce fuentes que todo lector de PDF
 * trae de serie —no hay que empotrar nada— así que el trabajo se reduce a
 * escribir objetos, medir cadenas y cuadrar los desplazamientos del `xref`.
 * Son las doscientas líneas de aquí abajo contra ~110 kB comprimidos de
 * librería, en un proyecto cuyo README presume de que React es su única
 * dependencia de producción.
 *
 * Lo que sí justificaría la librería es lo que aquí **no** se hace: convertir
 * DOM a PDF, incrustar tipografías, o dibujar gráficas. Si algún día el
 * informe necesita cualquiera de esas tres, este archivo se tira y se instala
 * jsPDF; el resto del código no se entera, porque solo habla con
 * `crearDocumento`.
 *
 * Referencia: PDF 1.7 (ISO 32000-1), §7.5 estructura, §9.4 operadores de
 * texto. Es un formato congelado desde 2008: esto no envejece.
 */

// --- Codificación ----------------------------------------------------------

/**
 * Los caracteres de CP1252 que no coinciden con Unicode, más los que este
 * informe usa de verdad. Las fuentes base usan `WinAnsiEncoding`, que es
 * CP1252: de 0xA0 a 0xFF coincide con Latin-1 —y con Unicode— así que las
 * vocales acentuadas y la eñe entran solas. Lo que no coincide es el tramo
 * 0x80–0x9F, donde CP1252 mete comillas tipográficas, guiones largos y
 * puntos suspensivos.
 */
const A_WINANSI = new Map([
  [0x20ac, 0x80], // €
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85], // …
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x2030, 0x89],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x2018, 0x91],
  [0x2019, 0x92], // ’
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95], // •
  [0x2013, 0x96], // –
  [0x2014, 0x97], // —
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x0178, 0x9f],
  // El menos tipográfico (U+2212) no existe en CP1252. La interfaz lo usa
  // («−30»), así que se degrada al guión de toda la vida en vez de perderse.
  [0x2212, 0x2d],
  [0x00a0, 0x20], // espacio duro -> espacio normal
]);

/** Un carácter sin representación en WinAnsi. Mejor visible que desaparecido. */
const SUSTITUTO = 0x3f; // ?

/** Texto JavaScript → bytes WinAnsi. */
export function aBytesWinAnsi(texto) {
  const bytes = [];
  for (const caracter of String(texto)) {
    const punto = caracter.codePointAt(0);
    if (punto >= 0x20 && punto <= 0x7e) bytes.push(punto);
    else if (punto >= 0xa1 && punto <= 0xff) bytes.push(punto);
    else if (A_WINANSI.has(punto)) bytes.push(A_WINANSI.get(punto));
    // Tabulador, salto de línea y retorno se conservan tal cual. Convertirlos
    // en «?» como al resto de lo desconocido destrozaría cualquier cosa que
    // dependa de ellos como separador.
    else if (punto === 0x09 || punto === 0x0a || punto === 0x0d) bytes.push(punto);
    else bytes.push(SUSTITUTO);
  }
  return bytes;
}

/**
 * Cadena de texto para diccionarios (el `/Title` del `/Info`), en UTF-16BE con
 * BOM.
 *
 * **No vale WinAnsi aquí.** Las cadenas de texto de un diccionario se
 * interpretan en PDFDocEncoding, que coincide con WinAnsi en el ASCII pero no
 * en el tramo 0x80–0x9F: una raya «—» escrita como 0x97 se lee como «Š» en el
 * título de la ventana. Pasó, se vio en la pestaña del visor, y se arregla
 * mandando UTF-16 explícito, que no admite interpretación (§7.9.2.2).
 */
export function aCadenaTexto(texto) {
  let salida = "<feff";
  for (let i = 0; i < texto.length; i += 1) {
    salida += texto.charCodeAt(i).toString(16).padStart(4, "0");
  }
  return `${salida}>`;
}

/**
 * Cadena hexadecimal `<48656C…>` en vez de literal `(Hello)`.
 *
 * Un literal obliga a escapar `(`, `)` y `\`, y olvidarse de uno rompe el
 * documento entero de forma silenciosa —el lector se pierde a mitad del flujo
 * y no enseña nada—. En hexadecimal no hay nada que escapar: a cambio, ocupa
 * el doble, que en un informe de texto son unos kilobytes.
 */
export function aCadenaHex(texto) {
  let salida = "<";
  for (const b of aBytesWinAnsi(texto)) salida += b.toString(16).padStart(2, "0");
  return `${salida}>`;
}

// --- Métrica de Helvetica --------------------------------------------------

// Anchos oficiales (unidades por millar) de Helvetica y Helvetica-Bold para
// los códigos 32..126, en orden. Son los AFM de Adobe: no se estiman, se
// copian, porque de esto depende que el texto no se salga del margen.
const ASCII_REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const ASCII_NEGRITA = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

// Los acentuados que este informe usa. En Helvetica el glifo compuesto avanza
// lo mismo que su letra base -- á ocupa lo que a -- salvo las íes, que ganan
// hueco para el acento.
const EXTRA_REGULAR = new Map([
  [0x85, 1000], [0x91, 222], [0x92, 222], [0x93, 333], [0x94, 333], [0x95, 350],
  [0x96, 556], [0x97, 1000], [0xa1, 333], [0xaa, 370], [0xab, 556], [0xba, 365],
  [0xb7, 278], [0xbb, 556], [0xbf, 611], [0xc1, 667], [0xc9, 667], [0xcd, 278],
  [0xd1, 722], [0xd3, 778], [0xda, 722], [0xdc, 722], [0xe1, 556], [0xe9, 556],
  [0xed, 278], [0xf1, 556], [0xf3, 556], [0xfa, 556], [0xfc, 556],
]);

const EXTRA_NEGRITA = new Map([
  [0x85, 1000], [0x91, 278], [0x92, 278], [0x93, 500], [0x94, 500], [0x95, 350],
  [0x96, 556], [0x97, 1000], [0xa1, 333], [0xaa, 494], [0xab, 556], [0xba, 494],
  [0xb7, 278], [0xbb, 556], [0xbf, 611], [0xc1, 722], [0xc9, 667], [0xcd, 278],
  [0xd1, 722], [0xd3, 778], [0xda, 722], [0xdc, 722], [0xe1, 556], [0xe9, 556],
  [0xed, 278], [0xf1, 611], [0xf3, 611], [0xfa, 611], [0xfc, 611],
]);

// Ancho de reserva para cualquier byte que no esté en las tablas. Se elige
// generoso a propósito: pasarse midiendo parte una línea antes de tiempo, algo
// que no se nota; quedarse corto la saca del papel, que sí.
const ANCHO_DESCONOCIDO = 611;

/** Ancho de un texto, en puntos, para un cuerpo dado. */
export function anchoTexto(texto, tamano, negrita = false) {
  const ascii = negrita ? ASCII_NEGRITA : ASCII_REGULAR;
  const extra = negrita ? EXTRA_NEGRITA : EXTRA_REGULAR;
  let milesimas = 0;
  for (const b of aBytesWinAnsi(texto)) {
    if (b >= 32 && b <= 126) milesimas += ascii[b - 32];
    else milesimas += extra.get(b) ?? ANCHO_DESCONOCIDO;
  }
  return (milesimas * tamano) / 1000;
}

/**
 * Parte un texto en líneas que quepan en `anchoMax`.
 *
 * Corta por espacios; si una sola palabra no cabe —una URL, un identificador—
 * la parte por donde sea, porque el mal menor es partirla y no que se salga
 * del papel. Respeta los saltos de línea que ya trae el texto: las notas del
 * trader vienen de un textarea y sus párrafos son suyos.
 */
export function partirEnLineas(texto, anchoMax, tamano, negrita = false) {
  const lineas = [];

  for (const parrafo of String(texto).split("\n")) {
    if (parrafo.trim() === "") {
      lineas.push("");
      continue;
    }

    let actual = "";
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const tentativa = actual === "" ? palabra : `${actual} ${palabra}`;
      if (anchoTexto(tentativa, tamano, negrita) <= anchoMax) {
        actual = tentativa;
        continue;
      }
      if (actual !== "") lineas.push(actual);

      if (anchoTexto(palabra, tamano, negrita) <= anchoMax) {
        actual = palabra;
        continue;
      }
      // Palabra más ancha que la caja: se trocea carácter a carácter.
      let trozo = "";
      for (const caracter of palabra) {
        if (anchoTexto(trozo + caracter, tamano, negrita) > anchoMax && trozo !== "") {
          lineas.push(trozo);
          trozo = caracter;
        } else {
          trozo += caracter;
        }
      }
      actual = trozo;
    }
    if (actual !== "") lineas.push(actual);
  }

  return lineas;
}

// --- Documento -------------------------------------------------------------

export const A4 = { ancho: 595.28, alto: 841.89 };

const FUENTE = { regular: "F1", negrita: "F2" };

/** Redondeo a 2 decimales: más precisión no la usa nadie y engorda el archivo. */
const n = (valor) => Number(valor.toFixed(2));

/**
 * Un documento en construcción. Se dibuja con coordenadas de PDF —origen
 * abajo a la izquierda— pero la API expone `y` desde arriba, que es como se
 * piensa un informe, y la conversión la hace `posY`.
 */
export function crearDocumento({ pagina = A4 } = {}) {
  const paginas = [];
  let actual = null;

  function nuevaPagina() {
    actual = [];
    paginas.push(actual);
    return paginas.length;
  }

  const posY = (desdeArriba) => pagina.alto - desdeArriba;

  const doc = {
    pagina,
    nuevaPagina,
    get numeroDePaginas() {
      return paginas.length;
    },

    /** Texto en (x, y), con y medida desde el borde superior. */
    texto(x, y, contenido, { tamano = 10, negrita = false, gris = 0 } = {}) {
      if (actual === null) nuevaPagina();
      const cadena = aCadenaHex(contenido);
      actual.push(
        `BT ${n(gris)} g /${negrita ? FUENTE.negrita : FUENTE.regular} ${n(tamano)} Tf ` +
          `${n(x)} ${n(posY(y))} Td ${cadena} Tj ET`,
      );
    },

    /** Texto alineado a la derecha de `x`. */
    textoDerecha(x, y, contenido, opciones = {}) {
      const ancho = anchoTexto(contenido, opciones.tamano ?? 10, opciones.negrita ?? false);
      doc.texto(x - ancho, y, contenido, opciones);
    },

    /** Línea horizontal. Para separar bloques sin dibujar cajas. */
    linea(x1, y, x2, { grosor = 0.5, gris = 0.75 } = {}) {
      if (actual === null) nuevaPagina();
      actual.push(
        `${n(gris)} G ${n(grosor)} w ${n(x1)} ${n(posY(y))} m ${n(x2)} ${n(posY(y))} l S`,
      );
    },

    /** Rectángulo relleno. Se usa como fondo de cabecera de bloque. */
    rectangulo(x, y, ancho, alto, { gris = 0.93 } = {}) {
      if (actual === null) nuevaPagina();
      actual.push(
        `${n(gris)} g ${n(x)} ${n(posY(y + alto))} ${n(ancho)} ${n(alto)} re f`,
      );
    },

    /**
     * Serializa a PDF. `pieDePagina(numero, total)` se llama al final, cuando
     * ya se sabe cuántas páginas hay -- que es justo lo que no se puede saber
     * mientras se dibuja.
     */
    serializar({ pieDePagina, titulo = "" } = {}) {
      if (paginas.length === 0) nuevaPagina();

      if (pieDePagina) {
        const total = paginas.length;
        paginas.forEach((contenido, indice) => {
          actual = contenido;
          pieDePagina(indice + 1, total);
        });
      }
      return construir(paginas, pagina, titulo);
    },
  };

  return doc;
}

// --- Serialización ---------------------------------------------------------

function construir(paginas, tamanoPagina, titulo) {
  const objetos = []; // 1-indexados: objetos[0] es el objeto 1

  const idCatalogo = 1;
  const idPaginas = 2;
  const idRegular = 3;
  const idNegrita = 4;
  const primeraPagina = 5;

  // Cada página son dos objetos: la página y su flujo de contenido.
  const idsDePagina = paginas.map((_, i) => primeraPagina + i * 2);

  objetos[idCatalogo] = `<< /Type /Catalog /Pages ${idPaginas} 0 R >>`;
  objetos[idPaginas] =
    `<< /Type /Pages /Count ${paginas.length} ` +
    `/Kids [${idsDePagina.map((id) => `${id} 0 R`).join(" ")}] >>`;
  objetos[idRegular] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objetos[idNegrita] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

  paginas.forEach((operaciones, i) => {
    const idPagina = idsDePagina[i];
    const idFlujo = idPagina + 1;
    objetos[idPagina] =
      `<< /Type /Page /Parent ${idPaginas} 0 R ` +
      `/MediaBox [0 0 ${n(tamanoPagina.ancho)} ${n(tamanoPagina.alto)}] ` +
      `/Resources << /Font << /${FUENTE.regular} ${idRegular} 0 R /${FUENTE.negrita} ${idNegrita} 0 R >> >> ` +
      `/Contents ${idFlujo} 0 R >>`;
    objetos[idFlujo] = { flujo: operaciones.join("\n") };
  });

  const info = objetos.push(
    `<< /Title ${aCadenaTexto(titulo)} /Producer ${aCadenaTexto("Trading Dashboard")} >>`,
  ) - 1;

  // --- Bytes -------------------------------------------------------------
  const bytes = [];
  const escribir = (texto) => {
    for (let i = 0; i < texto.length; i += 1) bytes.push(texto.charCodeAt(i) & 0xff);
  };

  escribir("%PDF-1.4\n");
  // Comentario con bytes altos: marca el archivo como binario para las
  // herramientas que transfieren en modo texto. Lo recomienda la propia
  // especificación (§7.5.2).
  bytes.push(0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a);

  const desplazamientos = [];
  for (let id = 1; id < objetos.length; id += 1) {
    const objeto = objetos[id];
    if (objeto === undefined) continue;
    desplazamientos[id] = bytes.length;
    escribir(`${id} 0 obj\n`);
    if (typeof objeto === "string") {
      escribir(`${objeto}\n`);
    } else {
      // El flujo de contenido es ASCII puro **por construcción**: los
      // operadores lo son, y el texto va en cadenas hexadecimales. Se escribe
      // tal cual, sin pasar por el codificador de texto -- que convertía en
      // «?» los saltos de línea que separan las operaciones y dejaba al lector
      // sin poder interpretar nada después de la primera.
      const flujo = objeto.flujo;
      if (!/^[\x09\x0a\x0d\x20-\x7e]*$/.test(flujo)) {
        throw new Error("El flujo de contenido tiene bytes que no son ASCII.");
      }
      escribir(`<< /Length ${flujo.length} >>\nstream\n`);
      escribir(flujo);
      escribir("\nendstream\n");
    }
    escribir("endobj\n");
  }

  const inicioXref = bytes.length;
  const totalObjetos = objetos.length; // objetos.length = último id + 1
  escribir(`xref\n0 ${totalObjetos}\n`);
  escribir("0000000000 65535 f \n");
  for (let id = 1; id < totalObjetos; id += 1) {
    const desplazamiento = desplazamientos[id] ?? 0;
    escribir(`${String(desplazamiento).padStart(10, "0")} 00000 n \n`);
  }

  escribir(
    `trailer\n<< /Size ${totalObjetos} /Root ${idCatalogo} 0 R /Info ${info} 0 R >>\n` +
      `startxref\n${inicioXref}\n%%EOF\n`,
  );

  return new Uint8Array(bytes);
}
