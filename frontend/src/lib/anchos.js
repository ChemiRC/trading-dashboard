/**
 * El ancho de las pantallas, en un solo sitio.
 *
 * Hasta `2xl` (1536 px) todas miden lo mismo: `max-w-6xl`, 1152 px. Es el
 * ancho con el que se diseñaron el móvil, la tablet y el portátil, y no se
 * toca. Por encima de ese punto **algunas** pantallas se ensanchan, y otras
 * no, según lo que tengan dentro:
 *
 * - **`CONTENEDOR_DENSO` (hasta 1600 px)** — Mercado, Evaluación, Operaciones
 *   e Histórico. Lo que crece ahí dentro son rejillas y tablas: más botones
 *   de opción por fila, columnas que dejan de truncarse, paneles del libro más
 *   anchos. El espacio se convierte en **más contenido por fila**, que es lo
 *   único que justifica usarlo.
 *
 * - **`CONTENEDOR_COMPACTO` (se queda en 1152 px)** — Riesgo y Configuración.
 *   Ahí dentro no hay rejilla que crezca: son filas de «etiqueta a la
 *   izquierda, valor a la derecha» y campos de texto que ya ocupan todo lo
 *   ancho. Estirarlas a 1600 px no enseñaría ni un dato más; solo separaría
 *   cada etiqueta de su valor y convertiría el nombre de una opción en una
 *   caja de mil cien píxeles para escribir «Sin divergencia». Se auditaron las
 *   seis pantallas una por una y estas dos son las que no ganaban nada.
 *
 * El tope de 1600 px es deliberado y no `100%`: pasado ese punto una fila de
 * texto deja de leerse de un vistazo y hay que mover la cabeza. Lo que sobra a
 * partir de ahí se va a los márgenes, que en un monitor grande es exactamente
 * lo que tiene que pasar.
 */

/** El marco de cualquier pantalla: fondo, relleno y alto mínimo.
 *
 * `2xl:py-6` (24px) recorta el `sm:py-10` (40px) que traía de antes, solo a
 * partir de 1536px: un monitor grande tiene margen de sobra a los lados
 * (por eso `CONTENEDOR_DENSO` se ensancha ahí) pero el alto sigue siendo el
 * mismo número de píxeles físicos que en un portátil -- y el alto es
 * justo lo que hace falta recuperar para que Evaluación quepa sin
 * desplazarse. Medido: 16px menos de hueco antes de "Trading Dashboard". */
export const PANTALLA = "min-h-screen bg-base px-4 py-6 sm:px-6 sm:py-10 2xl:px-10 2xl:py-6";

/** Rejillas y tablas: se ensanchan hasta 1600 px. */
export const CONTENEDOR_DENSO =
  "mx-auto flex w-full max-w-6xl flex-col gap-6 2xl:max-w-[1600px]";

/** Formularios y listas de etiqueta/valor: se quedan en 1152 px. */
export const CONTENEDOR_COMPACTO = "mx-auto flex w-full max-w-6xl flex-col gap-6";
