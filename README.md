# Trading Dashboard — Sistema de decisión para swing trading

Herramienta de apoyo a la decisión para swing trading en cripto (BTC y otros, en Bybit).

**No es** un generador de señales, **no** ejecuta operaciones y **no** se conecta al
exchange para operar. En ninguna fase.

Su único propósito es hacer que el proceso de análisis sea **objetivo, consistente,
medible y repetible**, respondiendo una sola pregunta antes de cada operación:

> ¿Existe suficiente evidencia para justificar esta operación según mi estrategia,
> o la mejor decisión es esperar?

El sistema está diseñado para poder decir **NO TRADE** aunque uno o dos indicadores
se vean atractivos. Su trabajo es cuestionar el sesgo del trader, no confirmarlo.

---

## Modelo de decisión

La estrategia se basa en **confluencias**: ningún indicador por sí solo justifica una
entrada.

El resultado **no** es un score de 0 a 100. Es un **balance con signo de -100 a +100**:

| Balance      | Significado                          |
| ------------ | ------------------------------------ |
| **Positivo** | candidato **LONG**                   |
| **Negativo** | candidato **SHORT**                  |
| Valor absoluto | la **fuerza** de la señal          |

Cada indicador aporta un valor **con signo** según su propia lectura: lo que se ve
alcista suma, lo que se ve bajista resta. El balance es la suma con signo de todas las
aportaciones.

> **La dirección no la elige el usuario.** El formulario nunca pregunta LONG o SHORT.
> El trader solo describe lo que ve en el gráfico; la dirección la deduce el motor del
> signo del balance.

### Catálogo de aportaciones

| # | Indicador                     | Peso | Opción                                              | Puntos |
| - | ----------------------------- | ---- | --------------------------------------------------- | ------ |
| 1 | **Divergencia RSI** *(1H/4H)* | 30   | divergencia regular alcista                          | **+30** |
|   |                               |      | divergencia oculta alcista                           | **+10** |
|   |                               |      | sin divergencia                                      | *ver Regla A* |
|   |                               |      | divergencia oculta bajista                           | **−10** |
|   |                               |      | divergencia regular bajista                          | **−30** |
| 2 | **Tendencia semanal**         | 20   | alcista                                              | **+20** |
|   | *(no existe estado neutral)*  |      | bajista                                              | **−20** |
| 3 | **Soporte / Resistencia**     | 15   | precio cerca de soporte                              | **+15** |
|   |                               |      | precio lejos de cualquier zona                       | 0 |
|   |                               |      | precio cerca de resistencia                          | **−15** |
| 4 | **Liquidez**                  | 15   | barrida la liquidez inferior *(reversión al alza)*   | **+15** |
|   |                               |      | sin barrido                                          | 0 |
|   |                               |      | barrida la liquidez superior *(reversión a la baja)* | **−15** |
| 5 | **Patrones gráficos**         | 10   | patrón alcista *(bull flag, doble piso, HCH inv.)*   | **+10** |
|   |                               |      | sin patrón                                           | 0 |
|   |                               |      | patrón bajista *(bear flag, doble techo, HCH)*       | **−10** |
| 6 | **Barreras Kiyotaka**         | 10   | barrera compradora fuerte *(soporta el precio)*      | **+10** |
|   |                               |      | sin barrera relevante                                | 0 |
|   |                               |      | barrera vendedora fuerte *(frena el precio)*         | **−10** |

Máximo teórico: **+100** (todo alcista) / **−100** (todo bajista).

### Clasificación

Se aplica sobre el **valor absoluto** del balance. La dirección sale del signo; la
clasificación, de la magnitud.

| \|Balance\| | Lectura              |
| ----------- | -------------------- |
| 90–100      | Operación muy fuerte |
| 70–89       | Buena oportunidad    |
| 50–69       | Confianza media      |
| 0–49        | **NO OPERAR**        |

### Las dos reglas que no son indicadores

Están implementadas como **condiciones explícitas del motor**, no como umbrales.

**REGLA A — Puerta de entrada.**
Si la divergencia RSI es *sin divergencia*, el resultado es **NO TRADE inmediato**.
No se calcula balance ni se evalúa nada más. El trader no busca operaciones sin
divergencia: es su disparador obligatorio.

**REGLA B — Contradicción entre disparador y evidencia.**
Si el signo del balance final contradice el signo de la divergencia (por ejemplo,
divergencia alcista +30 pero balance total −40), el resultado es **NO TRADE**. El
disparador apunta a un lado y la evidencia al otro: es justamente el caso en el que
hay que quedarse fuera.

> ✅ **La Regla B está confirmada por el trader** y activa. Se queda detrás del
> interruptor `RULE_B_ENABLED` —que sigue siendo una variable de entorno, no un
> despliegue— porque desactivarla es la única forma de medir cuánto filtra: basta
> ponerla a `false` y comparar el histórico. El valor por defecto es `true`.

> Pesos, opciones y umbrales **viven en la base de datos**, no en el código. Se editan
> desde la pantalla de configuración. Añadir un indicador nuevo debe ser insertar filas,
> no editar y redesplegar código.

### Decisiones cerradas con el trader

- **Regla B — confirmada.** Si el balance contradice el signo de la divergencia, el
  resultado es NO TRADE. Ver el aviso de arriba.
- **Patrones gráficos — todos valen lo mismo dentro de su dirección.** Un patrón
  alcista suma +10 y uno bajista resta −10, sea bull flag, doble piso o HCH invertido:
  el trader los usa como confirmación, no como disparador, y ninguno pesa más que otro.
  **Los triángulos quedan fuera a propósito**: son ambiguos, pueden resolver hacia
  arriba o hacia abajo, y meterlos obligaría a inventarles un signo.

---

## Stack

| Capa          | Tecnología                                      |
| ------------- | ----------------------------------------------- |
| Frontend      | React 18 + Vite + Tailwind CSS                   |
| Cliente HTTP  | `fetch` nativo (sin axios)                      |
| Backend       | Python 3.11 + FastAPI + Pydantic                |
| Base de datos | PostgreSQL en Supabase                          |
| Deploy        | Frontend → Vercel · Backend → Railway           |

Toda la dependencia de producción del frontend es React: ni librería de gráficas, ni de
routing, ni de estado, ni de iconos, ni de WebSockets. La barra de balance son dos
`div` con un ancho en porcentaje; el libro de órdenes en directo es el `WebSocket` que
trae el navegador de serie. **Recharts entra en la Fase 3**, con la equity curve y el
drawdown, que sí son gráficas de verdad.

**`lucide-react` se evaluó y se descartó.** Aquí hacen falta siete iconos estáticos
—seis de pestaña y las flechas de dirección— y eso son unas pocas rutas
SVG, no un problema que justifique una dependencia. Viven en `components/ui/Icons.jsx`,
dibujados con la geometría de lucide (lienzo 24×24, trazo de 2, extremos redondeados) a
propósito: si algún día hacen falta cuarenta, instalar la librería será sustituir ese
archivo y nada más.

**`jsPDF` se evaluó para exportar el histórico y tampoco hizo falta.** Aquí el criterio
no es el de los iconos —generar un PDF sí es un problema de verdad, no unas rutas SVG—
sino mirar *qué* PDF hace falta: el informe es texto en Helvetica sobre A4, sin
imágenes, sin fuentes que incrustar y sin gráficas. Helvetica es una de las catorce
fuentes que todo lector trae de serie, así que no hay nada que empotrar, y el formato se
reduce a escribir objetos y cuadrar la tabla de posiciones del final: son las ~250
líneas de `src/lib/pdf.js` contra unos 110 kB comprimidos de librería. Lo que sí la
justificaría es lo que este informe **no** hace —convertir DOM a PDF, incrustar
tipografías, dibujar gráficas—: el día que haga falta cualquiera de las tres, se tira
ese archivo y se instala jsPDF, y el resto del código no se entera porque solo habla con
`crearDocumento`. Ver [Descargar el histórico en PDF](#descargar-el-histórico-en-pdf).

**El widget de TradingView es la excepción, y conviene decirlo en voz alta.** No es un
paquete de npm —`package.json` no cambia— pero sí carga un script de
`s3.tradingview.com` en tiempo de ejecución y pinta dentro de un iframe suyo. Es el
único código de terceros que corre en esta aplicación, frente a la regla del resto del
proyecto (fuentes del sistema, sin CDN, sin analítica). Se acepta porque la alternativa
—dibujar velas, escalas, temporalidades y el RSI a mano— es un producto entero, no un
componente. No recibe ni un dato del trader: solo un símbolo público.

---

## Estructura del proyecto

```
trading-dashboard/
├── backend/
│   ├── app/
│   │   ├── adapters/
│   │   │   ├── bybit.py       Cliente de solo lectura de la API v5 (firma HMAC)
│   │   │   └── vinculacion.py Emparejar una operación con el setup que la anticipó
│   │   ├── api/
│   │   │   ├── auth.py    Contraseña compartida y tokens firmados
│   │   │   ├── deps.py    Conexión y configuración vigente por petición
│   │   │   ├── errors.py  Errores internos → respuestas HTTP
│   │   │   └── routes/    health · auth · config · setups · trades
│   │   ├── core/          Configuración, lectura de variables de entorno
│   │   ├── db/            Pool y repositorios de PostgreSQL / Supabase
│   │   ├── models/        Esquemas Pydantic (contratos de entrada y salida)
│   │   ├── scoring/       Motor de decisión — función pura, sin dependencias
│   │   └── main.py        Creación de la app, CORS, lifespan
│   ├── sql/               Esquema, seed y migraciones  (001 … 006 · README)
│   ├── tests/             test_engine (puro) · test_api (contra la BD real)
│   ├── Procfile           Comando de arranque para Railway
│   └── .env.example
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── api/
│   │   │   ├── client.js  fetch, token de sesión y errores normalizados
│   │   │   ├── auth.js    login y logout
│   │   │   ├── config.js  catálogo, salud y PATCH de configuración
│   │   │   ├── setups.js  evaluar · guardar · histórico · resultado · borrar
│   │   │   └── trades.js  sincronizar · listar · corregir el vínculo
│   │   ├── components/
│   │   │   ├── decision/
│   │   │   │   ├── DecisionPanel.jsx     Veredicto y barra de balance
│   │   │   │   ├── ConfluenceScore.jsx   Desglose con signo por indicador
│   │   │   │   ├── PermissionPanel.jsx   Clasificación y motivo del NO TRADE
│   │   │   │   └── ResumenMovil.jsx      El veredicto en una barra desplegable
│   │   │   ├── setup/
│   │   │   │   ├── EvaluationForm.jsx    Los 6 indicadores (presentacional)
│   │   │   │   └── SaveSetupPanel.jsx    Símbolo/TF/precio/notas → guardar
│   │   │   ├── history/
│   │   │   │   ├── SetupList.jsx         Tabla del histórico, filas expandibles
│   │   │   │   ├── SetupDetail.jsx       Desglose congelado de un setup
│   │   │   │   └── ExportPdfButton.jsx   Descarga del histórico en PDF
│   │   │   ├── market/
│   │   │   │   ├── SymbolPicker.jsx      Selector único de símbolo de la pantalla
│   │   │   │   ├── TradingViewChart.jsx  Gráfico con RSI (widget incrustado)
│   │   │   │   ├── OrderBookPressure.jsx Desbalance compra/venta en −1..+1
│   │   │   │   ├── OrderBookHeatmap.jsx  Volumen por nivel de precio
│   │   │   │   └── ConnectionStatus.jsx  Estado del WebSocket y antigüedad
│   │   │   ├── trades/
│   │   │   │   ├── SyncButton.jsx        Importar de Bybit y su resumen
│   │   │   │   ├── TradeList.jsx         Tabla (escritorio) y tarjetas (móvil)
│   │   │   │   ├── TradeJournal.jsx      Notas libres de una operación
│   │   │   │   └── LinkSetupPicker.jsx   Vincular a mano con un setup
│   │   │   ├── risk/
│   │   │   │   └── RiskCalculator.jsx    R:B, tamaño de posición, ATR
│   │   │   ├── settings/
│   │   │   │   ├── IndicatorSettings.jsx Pesos y puntos de las opciones
│   │   │   │   ├── ThresholdSettings.jsx Bandas de clasificación
│   │   │   │   ├── ConfigHealth.jsx      Semáforo de v_config_health + Regla B
│   │   │   │   └── EditControls.jsx      Campos y barra de guardado
│   │   │   └── ui/        AnimatedNumber · BalanceBar · BarraGuardado ·
│   │   │                   Insignia · Spinner · Toast · Icons
│   │   ├── hooks/
│   │   │   ├── useEvaluacion.js    Catálogo + selecciones + veredicto (sobre las pestañas)
│   │   │   ├── useOrderBook.js     WebSocket de Bybit: conectar, reconectar, vigilar
│   │   │   └── useConfigDrafts.js  Borradores por fila de la configuración
│   │   ├── lib/
│   │   │   ├── anchos.js        Qué pantallas se ensanchan en monitores grandes
│   │   │   ├── etiquetas.js     Rótulos de los códigos del backend, en un solo sitio
│   │   │   ├── format.js        Puntos con signo, color por signo, cifras, fechas
│   │   │   ├── orderbook.js     Snapshot + deltas, presión y niveles — funciones puras
│   │   │   ├── pdf.js           Generador de PDF mínimo, sin dependencias
│   │   │   ├── reporteSetups.js El histórico en PDF — sin tocar el DOM
│   │   │   └── risk.js          Cálculos de riesgo — funciones puras
│   │   ├── pages/
│   │   │   ├── Login.jsx            Contraseña compartida
│   │   │   ├── Mercado.jsx          Precio, RSI y libro de órdenes en directo
│   │   │   ├── Evaluacion.jsx       Formulario + veredicto + guardado, juntos
│   │   │   ├── RiskCalculation.jsx  Gestión de riesgo
│   │   │   ├── SetupHistory.jsx     Histórico con paginación
│   │   │   ├── Trades.jsx           Operaciones ejecutadas y sincronización
│   │   │   ├── Settings.jsx         Configuración de la estrategia
│   │   │   └── ConnectionCheck.jsx  Diagnóstico (no montada; ver abajo)
│   │   ├── App.jsx        Pestañas entre las seis pantallas
│   │   ├── main.jsx       Punto de entrada de React
│   │   └── index.css      Tokens de diseño (@theme de Tailwind)
│   ├── tests/             test_risk · test_orderbook · test_pdf — sin framework
│   ├── vite.config.js
│   └── .env.example
├── .gitignore
└── README.md
```

### Por qué esta separación

- **`scoring/` aislado del resto.** El motor recibe las opciones elegidas más el
  catálogo y los umbrales, y devuelve el balance con signo, la dirección deducida, la
  clasificación y el desglose. Nada más: no toca la base de datos, no sabe qué es HTTP.
  Así se puede testear con una tabla de casos y, en la Fase 5, reusarlo tal cual para
  hacer backtesting.
- **`adapters/` traduce lo de fuera antes de que llegue al resto.** Los valores de
  los indicadores siguen entrando de un formulario manual, sin capa intermedia —una
  interfaz con una sola implementación es una indirección que no paga su precio— pero
  el historial de Bybit sí pasa por aquí. Lo que sale de `adapters/` ya tiene la forma
  de nuestras tablas: ni los repositorios ni las rutas saben qué aspecto tiene un JSON
  del exchange. El día que haya un segundo origen, lo que cambia es este paquete.
- **`models/` separado de las rutas.** Los esquemas Pydantic son el contrato entre
  frontend y backend, y sirven de documentación viva en `/docs`.
- **`src/api/` es el único que hace `fetch`.** Y el único que sabe qué forma tiene un
  error del backend. De ahí sale o bien datos ya parseados, o bien un `ApiError` con
  `code` y `message` listos para enseñar: ningún componente mira un `response.ok` ni
  un `body.error.message`.
- **`src/index.css` es el único sitio con un color escrito.** Los tokens se declaran
  en el `@theme` de Tailwind y todo lo demás usa las utilidades que genera
  (`text-long`, `bg-surface`, `border-line`). Cambiar la paleta es cambiar ese archivo,
  no perseguir hex sueltos por los componentes.

---

## Frontend

Tema oscuro, tipografía monoespaciada en todo el dashboard. Lo segundo no es estética:
las cifras quedan alineadas en columna y `+30` / `−30` ocupan lo mismo, que es lo que
hace comparable el desglose de un vistazo.

### Las seis pantallas

Se navega entre ellas con pestañas y estado local, **sin librería de routing**: ninguna
necesita URL propia ni botón de atrás, así que un router sería una dependencia entera
para resolver lo que `useState` ya resuelve. Solo la pestaña activa está montada:
cambiar de pestaña desmonta y remonta, así que cada visita al histórico, a operaciones
o a configuración relee del backend en vez de enseñar una copia vieja.

**La evaluación en curso es la excepción y vive por encima de las pestañas**, en el hook
`useEvaluacion`. Si viviera dentro de «Evaluación» se perdería en cuanto el trader
saliera de ella: marcaría sus seis opciones, iría a Mercado a mirar el libro o a Riesgo
a calcular el tamaño, y al volver se encontraría el formulario en blanco. Colgado del
componente que envuelve a todas, `/evaluate` se dispara en el momento de marcar la
opción y el veredicto sigue ahí al volver, sin recalcular ni repreguntar el catálogo.

**Describir y decidir van en la misma pantalla.** El formulario a la izquierda, el
veredicto a la derecha, actualizándose con cada opción que se marca. Estuvo partido en
dos pestañas —«Indicadores» y «Decisión»— y se volvió a juntar: obligaba a cambiar de
pantalla para ver el efecto de cada respuesta, y en una herramienta cuyo argumento es
*«marca y mira lo que sale»* eso es un clic de más entre la causa y su consecuencia.

El precio de juntarlas está asumido y conviene decirlo: **el balance está a la vista
mientras se contesta**, así que la tentación de retocar respuestas hasta que el número
guste ya no la frena la interfaz. La frena el histórico, que guarda el setup con los
puntos congelados y con la fecha, y que existe justamente para que eso se note al
mirar hacia atrás.

Tampoco hay un resumen de lo contestado: el Confluence Score ya enseña indicador,
opción elegida y puntos de los seis, y con el formulario al lado sería decir dos veces
lo mismo en la misma pantalla.

**El veredicto no se va de la pantalla.** En escritorio la columna de la derecha
—Decisión, Confluence Score, Permission Panel— es *sticky*: se queda pegada bajo la
barra de pestañas mientras el formulario se desplaza. Antes el formulario medía más de
mil píxeles y el panel unos pocos cientos, así que al bajar a contestar la última
pregunta el resultado desaparecía justo cuando más falta hacía verlo — se midió:
desplazando 700 px, el panel quedaba fuera de la vista. Con el formulario compacto
(1034 → 742 px de alto) **las seis preguntas caben a la vez** en un monitor de 900 px,
y lo que sobresale es el panel de guardado, que no se mira mientras se contesta.

Cada indicador lleva su icono y su nombre en negrita, y las opciones marcadas se
distinguen por tres señales a la vez —borde claro, fondo elevado y una línea interior—
en vez del relleno sutil de antes, que se perdía al mirar de reojo. El borde es
**siempre** de dos píxeles: engordarlo solo al seleccionar movería de sitio al resto de
las opciones en cada clic.

**Operaciones va aparte del Histórico a propósito.** El Histórico responde *«¿qué
decidí?»* —setups, balance, disciplina— y Operaciones responde *«¿qué hice?»*. Son
preguntas distintas y con volúmenes muy distintos: doscientas operaciones importadas
mezcladas con los setups ahogarían justo lo que el Histórico existe para medir. El
puente entre ambas es la columna «Setup» de Operaciones, no la fusión de las dos
tablas.

En esa pantalla el origen de cada operación se distingue de un vistazo —`Bybit` en
gris, `manual` en ámbar— porque el PnL de una es el dato contable del exchange y el
de la otra lo tecleó el trader. Y **«sin vincular» se pinta en gris neutro, no en
rojo**: las 201 operaciones importadas son anteriores a que el trader empezara a
evaluar setups aquí, así que no tienen ninguno y no lo tendrán nunca. Ese hueco es
el dato que delata haberse saltado el proceso, no una avería.

Por delante de todas hay otra pantalla, el **login**: sin token no se monta
ninguna. No es la comprobación de seguridad —esa la hace el backend, que
rechaza cualquier `/api/*` sin token válido— sino de interfaz: sin sesión, todo lo
que se pintase sería una sucesión de 401.

| Pestaña | Qué hace |
| --- | --- |
| **Mercado** | Precio con RSI y libro de órdenes en directo. Contexto, no evidencia |
| **Evaluación** | Las 6 preguntas y, al lado, los tres paneles del veredicto y el guardado |
| **Riesgo** | R:B, tamaño de posición, pérdida máxima, ratios ATR |
| **Operaciones** | Lo ejecutado en el exchange: sincronización con Bybit y vínculo con su setup |
| **Histórico** | Los setups guardados, su desglose congelado, el registro manual del resultado, el borrado y la descarga en PDF |
| **Configuración** | Pesos, puntos, bandas y el semáforo de salud |

Cada pestaña lleva un icono para poder escanearlas de reojo, y la activa se marca con
un filete superior además del cambio de fondo: con seis, el resaltado por sí solo se
lee mal. «Evaluación» muestra además un punto ámbar mientras queden preguntas sin
contestar, que es el único dato que el trader necesita ver sin ir a buscarlo desde
cualquier otra pantalla.

«Mercado» va la primera porque es el orden en el que se mira —contexto, después
describir y decidir— pero **la pantalla de arranque sigue siendo «Evaluación»**, que es
a lo que se entra a hacer: abrir sesión no debería levantar un WebSocket y un iframe de
TradingView que quizá no se van a mirar.

### El ancho no es el mismo en todas las pantallas

Hasta `2xl` (1536 px) todo mide igual: `max-w-6xl`, 1152 px. Es el ancho con el que se
diseñaron el móvil, la tablet y el portátil. Por encima de ese punto **unas pantallas se
ensanchan hasta 1600 px y otras no**, y el criterio está en un solo sitio,
`lib/anchos.js`:

| | Hasta 1536 px | Desde 1536 px | Por qué |
| --- | --- | --- | --- |
| Mercado · Evaluación · Operaciones · Histórico | 1152 | **1600** | Dentro hay rejillas y tablas: el espacio se convierte en más contenido por fila |
| Riesgo · Configuración | 1152 | **1152** | Dentro hay filas de «etiqueta ↔ valor» y campos de texto que ya ocupan todo lo ancho |

Ensanchar solo vale la pena si algo **se reorganiza**. En Evaluación, cada 250 px de más
son otro botón de opción por fila: a 1920 px pasan de 2 por fila a 4, y el formulario
entero baja de 1340 a 1131 px de alto. En Mercado el gráfico gana 200 px de alto además
de ancho —el RSI estaba aplastado en una banda de cien píxeles— y el heatmap enseña el
doble de niveles sin desplazarse dentro del panel.

En Riesgo y Configuración no se reorganiza nada: sus filas son una etiqueta a la
izquierda y un valor a la derecha, así que los 450 px extra solo separarían las dos
mitades, y el nombre de una opción del catálogo se convertiría en una caja de mil cien
píxeles para escribir «Sin divergencia». Se auditaron las seis pantallas una por una y
estas dos son las que no ganaban nada, así que se quedan donde estaban.

**El tope es 1600 px y no `100%`** a propósito: pasado ese punto una fila de texto deja
de leerse de un vistazo y hay que mover la cabeza. Lo que sobra se va a los márgenes,
que en un monitor grande es exactamente lo que tiene que pasar — a 1920 px quedan 160 px
por lado en vez de 384.

Lo que **no** depende del tamaño de la ventana es `N`, los niveles que mide la presión
del libro: es la medida, y hacerla crecer con la pantalla significaría que el mismo
libro da un número distinto en el portátil y en el monitor. En pantalla grande se ve más
de lo mismo, no se mide otra cosa.

### En un teléfono es otra interfaz, no la misma encogida

Tres cosas cambian por debajo de `sm` (640 px), y ninguna es un ajuste de márgenes:

- **La navegación baja.** Seis pestañas en una barra horizontal arriba se envolvían en
  dos filas que se comían un tercio de la pantalla y quedaban lejos del pulgar. En móvil
  son una **barra fija abajo** con icono y etiqueta corta, celdas de 64 px, y la activa
  marcada con el mismo filete que en escritorio. Se eligió barra y no menú desplegable a
  propósito: un desplegable esconde dónde está uno y cuesta dos toques en vez de uno.
  «Cerrar sesión» no entra ahí —no es un destino, y entre las pestañas se pulsaría por
  error—: se queda arriba a la derecha.
- **El veredicto se convierte en una barra.** No hay ancho para una columna fija, y
  ponerlo debajo de las seis preguntas significaría marcar opciones sin ver nunca el
  efecto. Así que queda **una línea siempre visible** sobre la navegación —«LONG +100 ·
  Operación muy fuerte»— que al tocarla despliega el desglose completo a pantalla
  casi entera, con el fondo bloqueado para que el gesto de leer no arrastre la página
  de detrás.
- **Las tablas se vuelven tarjetas.** Doscientas operaciones en siete columnas obligaban
  a arrastrar de lado para leer una sola fila. En móvil cada operación y cada setup son
  una tarjeta con lo importante arriba —símbolo, lado, PnL, fecha— y el resto en el
  detalle desplegable, que ya existía. El orden del histórico, que en escritorio se
  cambia pulsando la cabecera de columna, pasa a un selector: sin columnas no hay
  cabeceras que pulsar.

Los botones de opción del formulario miden **44 px de alto** en móvil y se relajan a la
altura natural del texto en escritorio: son el control que más se pulsa de toda la
aplicación.

Comprobado a 375 y 414 px en las seis pantallas: ninguna desborda en horizontal.

> **Un detalle que solo aparece en el navegador:** `position: fixed` deja de medirse
> contra la ventana si algún ancestro tiene un `transform`, y el contenedor de la
> pestaña activa lleva `animate-fade-in`, cuya animación deja puesto un transform
> identidad al acabar. Con eso bastaba para que la barra del veredicto terminara a dos
> mil píxeles del borde superior: en el DOM, con `position: fixed`, y fuera de la
> pantalla. Se pinta con un portal a `document.body`.

`ConnectionCheck` sigue en `pages/` pero **ya no se monta**: cumplió su papel en la
entrega 5 —demostrar que el frontend llega a Supabase de punta a punta— y se queda
como herramienta de diagnóstico a la que se vuelve editando `App.jsx`.

### Mercado: datos en directo sin pasar por el backend

Es la única pantalla que **no habla con el backend**. El gráfico lo sirve TradingView y
el libro de órdenes viene del **WebSocket público de Bybit**, los dos directos desde el
navegador.

**Sin credenciales, porque no admiten ninguna.** El endpoint es
`wss://stream.bybit.com/v5/public/linear` y el tópico `orderbook.50.{símbolo}`: no
lleva API key ni firma HMAC —a diferencia de `closed-pnl`, que sí— y devuelve
exactamente lo mismo a cualquiera que se conecte. No hay ningún secreto implicado, así
que no hay ninguno que pudiera filtrarse.

**Y por eso no pasa por el backend.** Es el mismo razonamiento que con el widget de
TradingView. Un proxy en Railway retransmitiendo cincuenta mensajes por segundo
añadiría latencia a datos que caducan en milisegundos, un proceso más que mantener
despierto, y un punto de fallo entre el trader y el exchange — todo para no proteger
nada, porque lo que viaja ya es público. La regla del proyecto no cambia y conviene
enunciarla bien: **lo que toca la cuenta pasa por el backend y solo el backend tiene
llaves**; los datos de mercado, que no son de nadie, no.

Es mainnet siempre, sin mirar `BYBIT_TESTNET`: esa variable protege *la cuenta*, y aquí
no hay cuenta. El libro de testnet no es un mercado real y enseñarlo sería enseñar
ruido.

#### Presión del libro

`(volumen_compra − volumen_venta) / (volumen_compra + volumen_venta)` sobre los **N
niveles más cercanos al precio** (N configurable: 5, 10, 20 o 50; por defecto 20).
Sale entre −1 y +1.

Se pinta con **la misma barra que el balance del setup** —`components/ui/BalanceBar.jsx`,
extraída del Decision Panel para que la usen los dos— porque es el mismo patrón: un
número con signo que se inclina a un lado. Compartir la forma es lo que permite mirar
los dos y compararlos sin traducir nada. Lo único que cambia es la escala y el nombre
de los extremos.

Solo los N más cercanos y no el libro entero: lejos del precio hay órdenes que nadie va
a ejecutar hoy y que, contadas, tapan lo único que se quiere medir.

#### Heatmap

Los niveles ordenados **por precio** —ventas arriba, compras abajo, horquilla en
medio— con una barra proporcional al volumen de cada uno. Ordenado por precio y no por
tamaño porque así se ve *a qué distancia del precio* está cada muro, que es la mitad de
la información: uno pegado al precio y otro a un 2 % no significan lo mismo. Cada barra
se mide contra el mayor nivel visible, no contra un máximo fijo, porque el volumen
absoluto de un libro de BTC y uno de SOL no se parecen en nada.

Es **la foto de ahora, no un histórico**: no se acumula nada en el tiempo. Un heatmap
con memoria —el que enseña dónde hubo liquidez hace una hora— es otra herramienta y
necesita guardar series, no un WebSocket. La lista abre centrada en la horquilla: con
N=20 son cuarenta filas y, abriendo por arriba, solo se vería el lado de venta.

Enseña los mismos N niveles que mide la presión, a propósito: lo que se ve es
exactamente lo que se está contando.

#### Nada de esto puntúa en el score

Los seis indicadores del modelo describen el gráfico. Esto describe el libro en este
segundo, y se lo lleva la corriente en el siguiente. Es contexto para mirar antes de
pulsar el botón, no una séptima confluencia. Si algún día el trader decide que debe
puntuar, será una fila nueva en `indicator_options` y una decisión suya, no un efecto
colateral de esta pantalla.

#### Mantener el libro y sobrevivir a un corte

Bybit no manda el libro entero en cada mensaje: manda un **snapshot** al suscribirse y
después **deltas**. Reconstruirlo es cosa del cliente, y por eso vive en
`lib/orderbook.js` —puro, con 33 tests— separado de `hooks/useOrderBook.js`, que solo
se ocupa del socket.

Los detalles que se pueden equivocar en silencio:

- **Tamaño `0` significa borrar el nivel**, no «hay 0 contratos». Confundirlo deja
  niveles fantasma que ensucian el heatmap para siempre.
- **Los precios se guardan como la cadena que mandó Bybit**, no como número. Es la
  clave con la que llegan los deltas, y `"16493.50"` y `"16493.5"` son el mismo número
  pero distinta clave: pasar por `Number` y volver a texto dejaría niveles huérfanos
  imposibles de borrar. De paso, al pintar se enseña el tick exacto del exchange.
- **Si `u` da un salto, el libro local ya no es el de Bybit** y se tira entero para
  pedir uno nuevo. Seguir aplicando deltas sobre un libro roto no da un error visible:
  da un libro que miente, que es peor. Se contabiliza aparte, como «resinc.».
- **Un libro congelado se ve igual que uno quieto.** Es el fallo que más importa aquí,
  porque no se nota. Un WiFi que se cae **no dispara `close`**: el socket se queda
  abierto contra nadie. Un vigilante marca la conexión como caída tras 12 s sin recibir
  nada, y lo hace **él mismo** en vez de limitarse a cerrar y esperar al `onclose` —se
  midió: sin red, `close()` no completa su saludo y `onclose` tardó 22 segundos, 22
  segundos enseñando datos viejos bajo el rótulo «en vivo»—. Los pings van cada 8 s
  para que el pong sirva de prueba de vida y el vigilante no dé falsas alarmas cuando
  el mercado está quieto.
- Sin conexión, los paneles **se atenúan y aparece un contador de antigüedad**
  («datos de hace 14 s»): siguen consultables, pero dejan de parecer vigentes.
- La reconexión es con espera creciente y algo de azar —si el corte fue de Bybit y no
  del WiFi, medio mundo reconectaría en el mismo milisegundo— y el evento `online` del
  navegador se salta la espera. Se cuenta **la vuelta, no cada intento fallido**: un
  corte de veinte segundos es *una* reconexión, no las cinco veces que se probó
  mientras no había red.

Medido en el navegador contra Bybit real: 90 s seguidos de BTCUSDT sin una sola
resincronización, corte de red detectado en 12 s y recuperado en 2 s al volver.

**No se construye el mapa de liquidaciones.** Necesita un servicio de pago (Coinglass)
y es una decisión aparte, pendiente de que el trader confirme si le compensa la
suscripción.

### Evaluar no es guardar

Son dos acciones distintas y el frontend las mantiene separadas a propósito:

- **Evaluar** ocurre solo, en cada clic sobre una opción, contra
  `POST /api/setups/evaluate`. No escribe nada. Es lo que alimenta el Decision Panel.
- **Guardar** ocurre solo cuando el trader pulsa *Guardar setup*, contra
  `POST /api/setups`. Pide lo que el veredicto no puede deducir —símbolo, timeframe,
  precio al evaluar y notas opcionales— y persiste el setup con sus puntos congelados.
  La confirmación ofrece «Ver en el histórico», que cierra el flujo: evaluar →
  guardar → ver.

Lo que se manda al guardar son **las mismas selecciones**, nunca el balance: el
backend reevalúa. Lo que enseña el Decision Panel es una previsualización, no el
veredicto que se archiva.

El precio viaja como **texto**, no como número: la columna es `numeric` y pasar por un
float de JavaScript convertiría `67432.55` en `67432.549999…`. Es justo el dato que la
Fase 2 comparará con el precio real de entrada en Bybit.

**Los NO TRADE también se guardan, y es intencionado.** Un setup descartado por la
Regla A, la Regla B o por score bajo registra las veces que el trader se contuvo
teniendo evidencia parcial. Esa es la parte del histórico que mide disciplina y no
aciertos, así que la interfaz lo dice en vez de dar a entender que no merece la pena.

### El resultado se registra después — y a mano, de momento

Desde el detalle de un setup en el histórico se registra cómo terminó: ganada,
perdida o breakeven, con PnL y notas de cierre opcionales. Por debajo **no hay
ninguna columna nueva en `setups`**: se crea una fila en `trades` con
`source = 'manual'` vinculada al setup, que es exactamente la estructura que la
Fase 2 rellenará desde Bybit. La vista `v_setups_with_outcome` sigue siendo la
única fuente del resultado.

Cómo convivirá con Bybit:

- **El PnL manda.** Si hay PnL (tecleado hoy, importado mañana), el resultado se
  deriva de su signo; lo que el trader declaró (`manual_outcome`) solo se usa
  cuando no hay PnL del que derivar. Un CHECK del esquema impide que declaración
  y PnL se contradigan.
- **`source` distingue los orígenes.** Las trades manuales y las importadas
  conviven en la misma tabla; la sincronización de la Fase 2 sabe cuáles son
  suyas, y el `UNIQUE` de `trades.setup_id` le impide duplicar un setup ya
  resuelto. Los resultados venidos de Bybit no se editan a mano (409).
- **Los NO TRADE no registran resultado.** Quedarse fuera no tiene desenlace. Si
  el trader operó al margen del veredicto, eso es una operación improvisada —
  trade sin setup vinculado — y llegará por la vía de Bybit.

El registro es **posterior y separado de la evaluación**, a propósito: el
contrato del endpoint no acepta ni selecciones ni balance, y desde la pantalla
no hay forma de tocar el desglose congelado. El valor del sistema depende de que
el setup se evaluó *antes* de saber cómo terminó; aquí solo se añade el
desenlace. Corregir un error de captura sí se puede, y deja huella: la fecha de
la corrección queda visible junto al resultado.

### El journal de cada operación

Toda operación —importada de Bybit o registrada a mano— tiene un campo de
**notas libres**: por qué se entró, por qué se salió, cómo se vivió. Se edita
desplegando su fila en «Operaciones», con el mismo gesto que Configuración
(escribir → «Guardar» → «✓ Guardado»), y la barra de guardado es literalmente
el mismo componente: dos implementaciones del mismo patrón acaban divergiendo
justo en el detalle que más se nota.

**Se editan también en las de Bybit, y eso es el punto.** Los números de una
operación importada son el dato contable del exchange y no se tocan desde
aquí; el motivo de entrada, en cambio, no lo sabe nadie más que el trader. La
operación improvisada de la que no hay setup es precisamente la que más falta
hace explicar.

No se confunde con las notas del resultado (`result_notes`, que se registran
desde el Histórico): aquellas hablan del cierre —«salió por objetivo»—, estas
de la operación entera y sobre todo de la decisión.

**No se creó ninguna columna para esto.** `trades` nació con cuatro columnas
subjetivas reservadas para el journal —`entry_reason`, `exit_reason`,
`emotion_code` y `comments`— de las que solo se usaba una, y no con su nombre:
la vista publica `exit_reason` como `result_notes` desde la migración 003. Las
notas libres son exactamente para lo que se reservó `comments`, así que se
publican como `journal_notes` por el mismo mecanismo. Una columna nueva al
lado de una `comments` vacía habría dejado dos sitios donde escribir lo mismo
y, dentro de seis meses, la duda de cuál de los dos es el bueno.

### El puente entre el Histórico y Operaciones

Las dos pantallas siguen separadas —responden preguntas distintas y con
volúmenes distintos, ver arriba— pero ahora se ven la una a la otra:

- **Desde un setup**, al desplegarlo en el Histórico, aparece la operación en
  la que acabó: lado, precios, fechas, PnL, sus notas de journal y un enlace
  para verla entera en Operaciones. Cuando están los dos precios, se enseña
  además la **diferencia entre el precio al que se evaluó y la entrada real**,
  que es plan contra ejecución y lo que la Fase 5 existe para medir.
- **Desde una operación**, vincularla con un setup dejó de ser un enlace de
  texto perdido entre las columnas de una tabla densa: es un botón con nombre
  —«Vincular con un setup» o «Cambiar setup»— dentro del detalle de la fila.

Los campos del puente viajan solo en `GET /api/setups/{id}`, no en el listado:
la tabla del histórico no enseña nada de eso y traerlos en cada fila de una
página de veinte sería pagar por lo que solo mira quien despliega una.

### Descargar el histórico en PDF

Un botón en el Histórico genera el informe **en el navegador**, sin pasar por el
backend: los datos ya están, y montar una ruta que dibuje PDF en el servidor sería
trabajo nuevo para producir lo mismo.

**Exporta lo que hay en pantalla**, ni más ni menos: los setups cargados, en el orden en
que se están viendo. Si el trader lleva dos «Cargar más» y está ordenando por balance,
eso es lo que sale, y el rótulo del botón lo dice cuando no son todos («Exporta los 20
cargados, no los 47 del histórico»). Un botón que exportara siempre el histórico entero
diría una cosa distinta de la que se está mirando. Sin ningún setup, el botón sigue
visible pero **deshabilitado**, con el motivo al lado, en vez de producir un PDF vacío.

**El desglose no viene en la lista.** `GET /api/setups` devuelve un resumen por setup y
las seis aportaciones congeladas solo están en `GET /api/setups/{id}`, así que la
exportación pide el detalle de cada uno —de seis en seis— antes de componer nada, y
enseña el progreso mientras tanto. Se prefirió eso a engordar el endpoint que más se usa
con datos que la tabla no necesita para pintarse.

Cada bloque lleva fecha, símbolo, timeframe, precio de evaluación, balance con signo,
dirección, decisión, el motivo si es NO TRADE, las seis aportaciones con sus puntos, las
notas y el resultado si está registrado —con la fecha de la corrección si la hubo, que
en un respaldo importa más que en la pantalla—. Un pie con «Página N de M» y salto de
página automático: un bloque no empieza si no le quedan cien puntos por delante, para no
dejar una cabecera huérfana al pie.

**Los puntos son los congelados**, igual que en pantalla: salen de `points_applied` del
setup guardado, no del catálogo vigente. Comprobado bajando de 30 a 12 los puntos de
«Divergencia regular alcista» en Configuración: una evaluación nueva pasó a puntuar 12
—balance 100 → 82— y el PDF del setup viejo siguió diciendo `+30 / 30`, byte a byte
idéntico al de antes del cambio.

El generador (`lib/pdf.js`) no toca el DOM, así que el informe entero se prueba desde
Node. Los dos fallos que encontró la verificación —y que ninguna prueba de «no lanza
excepciones» habría visto— fueron **silenciosos**: el codificador convertía en `?` los
saltos de línea que separan las operaciones del flujo, y el visor dejaba de interpretar
tras la primera línea de cada página; y el `/Title` iba en WinAnsi cuando los
diccionarios usan PDFDocEncoding, así que la raya del título salía como `Š`. Los dos
producían un PDF que abría sin quejarse. Por eso el archivo generado se abre y se mira,
además de pasar los tests.

### Tokens de color

| Token | Para qué |
| --- | --- |
| `base` · `surface` · `raised` · `line` | Superficies, de más al fondo a más al frente |
| `ink` · `ink-dim` · `ink-faint` | Texto principal, secundario, terciario |
| `long` · `long-deep` | Alcista / LONG (verde) |
| `short` · `short-deep` | Bajista / SHORT (rojo) |
| `flat` | Balance 0, opción neutra, NO TRADE |
| `cls-strong` · `cls-good` · `cls-medium` · `cls-none` | Bandas de clasificación |

Los cuatro `cls-*` se llaman **igual que los valores de `color_token`** en
`classification_thresholds`. La base de datos decide la semántica —qué banda es fuerte
y cuál no—, el frontend decide qué aspecto tiene cada una. Van prefijados porque un
token llamado `none` chocaría con la clase `bg-none` que Tailwind ya trae de serie.

Fuentes del sistema, sin CDN: una petición de red menos que pueda fallar y ningún
tercero al que pedirle permiso.

---

## API

Documentación interactiva completa en `/docs`. Resumen:

| Método  | Ruta                             | Auth | Qué hace                                       |
| ------- | -------------------------------- | ---- | ---------------------------------------------- |
| `GET`   | `/health`                        | —    | El proceso responde. No toca la base de datos. |
| `GET`   | `/health/db`                     | —    | La BD responde y la configuración es coherente |
| `POST`  | `/auth/login`                    | —    | Canjear la contraseña por un token             |
| `GET`   | `/api/config/catalog`            | 🔒   | Indicadores, opciones, umbrales y defaults     |
| `GET`   | `/api/config/thresholds`         | 🔒   | Solo las bandas de clasificación               |
| `GET`   | `/api/config/health`             | 🔒   | La vista `v_config_health` + si la Regla B está activa |
| `PATCH` | `/api/config/indicators/{code}`  | 🔒   | Editar peso, nombre, orden, activo             |
| `PATCH` | `/api/config/options/{id}`       | 🔒   | Editar etiqueta, puntos, default, activa       |
| `PATCH` | `/api/config/thresholds/{code}`  | 🔒   | Editar una banda                               |
| `POST`  | `/api/setups/evaluate`           | 🔒   | Evaluar **sin guardar**                        |
| `POST`  | `/api/setups`                    | 🔒   | Evaluar **y guardar**                          |
| `GET`   | `/api/setups`                    | 🔒   | Histórico, con filtros y paginación            |
| `GET`   | `/api/setups/{id}`               | 🔒   | Un setup con su desglose congelado             |
| `DELETE`| `/api/setups/{id}`               | 🔒   | Borrar un setup del histórico                  |
| `POST`  | `/api/setups/{id}/result`        | 🔒   | Registrar a mano cómo terminó                  |
| `PATCH` | `/api/setups/{id}/result`        | 🔒   | Corregir un resultado registrado               |
| `POST`  | `/api/trades/sync`               | 🔒   | Importar historial cerrado de Bybit            |
| `GET`   | `/api/trades`                    | 🔒   | Operaciones, con filtros y paginación          |
| `PATCH` | `/api/trades/{id}/setup`         | 🔒   | Corregir a mano el setup vinculado             |
| `PATCH` | `/api/trades/{id}/notes`         | 🔒   | Editar el journal de una operación             |

🔒 = exige `Authorization: Bearer <token>`.

### Importar el historial de Bybit (Fase 2)

`POST /api/trades/sync` descarga las posiciones cerradas de Bybit y las guarda en
`trades` con `source = 'bybit'`. Es una acción **manual**, que dispara el trader
cuando quiere: mientras el volumen sea el de una persona operando swing,
automatizarlo solo añadiría una pieza que puede fallar de madrugada sin que nadie
mire.

**Solo lectura, siempre.** El adaptador (`app/adapters/bybit.py`) llama a un único
endpoint de consulta, `GET /v5/position/closed-pnl`. No hay ni habrá nada que abra
o cierre una posición, y la API key es de solo lectura por decisión de proyecto.

Detalles que importan:

- **Sin dependencia HTTP nueva.** `urllib` de la biblioteca estándar cubre un GET
  firmado con timeout, igual que `hmac` cubrió la firma de los tokens de sesión.
- **El host sale de `BYBIT_TESTNET`**, nunca está escrito en la llamada. El valor
  por defecto es `true`: olvidarse de la variable apunta a la cuenta de pruebas,
  nunca a la real.
- **La firma sigue el esquema v5**: `HMAC_SHA256(secret, timestamp + api_key +
  recv_window + query)` en `X-BAPI-SIGN`. La cadena que se firma es exactamente la
  que va en la URL —se construye una sola vez— porque firmar una distinta de la
  que se envía es el fallo clásico de esta API.
- **Ventanas de 7 días y paginación por cursor**: `closed-pnl` no acepta rangos
  mayores, así que los rangos largos se trocean, y cada ventana se recorre entera
  siguiendo `nextPageCursor`.
- **Falla ruidosamente.** Si Bybit no responde, contesta un HTTP de error, o
  contesta 200 con `retCode != 0`, la sincronización se detiene con un **502** y
  el motivo dentro. Nunca devuelve un resumen de ceros que parecería "no había
  nada nuevo". Sin `BYBIT_API_KEY` o `BYBIT_API_SECRET`, **503** antes de empezar.
- **`side` se invierte.** En `closed-pnl`, `side` es el lado de la orden que
  *cerró* la posición: una posición larga se cierra vendiendo. Sin invertirlo,
  todo el histórico entraría con la dirección al revés.
- **Deduplicar es cosa del esquema.** El `UNIQUE` de `trades.bybit_order_id` con
  `on conflict do nothing` — no un SELECT previo, que dejaría una ventana entre
  comprobar e insertar.
- **Los perpetuos (`...PERP`) se descartan a propósito.** El trader confirmó
  haberlos usado en el pasado —27 operaciones en `BTCPERP` y `ETHPERP`— pero hoy
  solo opera pares con margen en USDT. El filtro vive en el adaptador
  (`SUFIJOS_EXCLUIDOS`), así que no llegan a procesarse ni a insertarse, y el
  resumen de la sincronización los cuenta en `excluidas` para que la diferencia
  con el total que se ve en Bybit quede explicada. Se filtra por lo que se
  **excluye**, nunca por una lista blanca de pares permitidos: el día que
  estrene un par nuevo entra solo, sin tocar código.
- **La marca de sincronización es una optimización, no la verdad.** Se guarda en
  `sync_state` (migración 005) para no releer dos años cada vez, pero cada
  sincronización relee **24 horas de solapamiento** hacia atrás: si una murió a
  medias, la siguiente recupera lo que faltaba. Preferir releer de más a
  arriesgar un hueco es deliberado — un hueco no se nota hasta que faltan
  operaciones en las estadísticas de la Fase 3.

#### Vinculación automática con el setup

Al importar una operación se busca el setup que la anticipó, y se guarda en
`trades.setup_id`. Los tres criterios son filtros —hay que cumplirlos todos— y el
desempate es la cercanía en el tiempo:

| Criterio | Regla | Constante |
| --- | --- | --- |
| **Símbolo** | Mismo activo base, normalizado | — |
| **Precio** | `\|entrada_real − precio_evaluado\| / precio_evaluado ≤ 0,5 %` | `TOLERANCIA_PRECIO` |
| **Momento** | La operación abre **después** de evaluar, dentro de 48 h | `VENTANA_HORAS` |

La **normalización de símbolo** recorta la cotización para quedarse con el activo
base, de modo que el `BTC` que el trader escribió a mano empareje con el `BTCUSDT`
de Bybit: `BTC` → `BTC`, `btcusdt` → `BTC`, `BTC/USDT` → `BTC`,
`1000PEPEUSDT` → `1000PEPE`. Solo se recorta si queda algo detrás — `USDT` a secas
se queda como está, porque una cadena vacía emparejaría con cualquier cosa.

Que la operación abra **después** de la evaluación no es un detalle: un setup
evaluado más tarde no anticipó nada, por muy cerca que caiga. La ventana de 48 h es
generosa a propósito, porque esto es swing trading: el trader evalúa, espera a que
el precio llegue a su zona, y entra un día o dos después. Una ventana de dashboard
intradía dejaría sin vincular la mayoría.

Si **varios** setups cumplen los tres, gana el evaluado más cerca de la apertura.
Si **ninguno** cumple, la operación se guarda con `setup_id = NULL`: es una
operación improvisada, y el esquema ya sabe representar ese caso —de hecho ese
hueco es el dato que delata haberse saltado el proceso—.

Un setup **sin precio anotado** no se vincula. No poder comprobar un criterio no es
lo mismo que cumplirlo, y es preferible dejarlo suelto a colgarle una operación que
quizá no era suya.

**Puede equivocarse, y está asumido.** Dos setups del mismo par evaluados con veinte
minutos de diferencia son indistinguibles para esta heurística. Por eso el vínculo
vive en una columna editable y hay `PATCH /api/trades/{id}/setup` para corregirlo o
quitarlo (`{"setup_id": null}`): un vínculo equivocado se arregla, uno irreversible
no. El `setup_id` es `UNIQUE`, así que intentar colgar dos operaciones del mismo
setup lo rechaza el esquema con un 409.

### Autenticación: una contraseña compartida

El dashboard está desplegado en internet y sin nada delante cualquiera con la URL
podría leerlo y editarlo. La protección es deliberadamente pequeña: **una
contraseña compartida entre dos personas de confianza**, sin cuentas, sin roles y
sin registro. Supabase Auth y el multiusuario son Fase 6; montarlos hoy sería
resolver un problema que no existe.

Cómo funciona:

1. `POST /auth/login` con la contraseña devuelve un **token firmado** con
   HMAC-SHA256 y 30 días de validez. La contraseña se compara en tiempo
   constante (`secrets.compare_digest`), nunca con `==`: comparar cadenas byte a
   byte filtra por el tiempo de respuesta cuántos caracteres se acertaron.
2. Todo `/api/*` exige `Authorization: Bearer <token>`. Sin él, o con uno
   caducado o manipulado, responde **401** con el sobre de error de siempre y el
   código `UNAUTHORIZED`.
3. `/health` y `/health/db` **se quedan públicos**: no exponen ni un dato del
   trader y son lo que consulta el health check de Railway, que no tiene forma
   de autenticarse.

**Sin firmar el token con una librería de JWT.** La construcción es la misma que
un JWT `HS256` —`payload.firma` en base64url— pero escrita con `hmac` de la
librería estándar y recortada a lo único que aquí hace falta: una caducidad. De
paso desaparece la clase de fallos más conocida de JWT, la del algoritmo
negociable dentro del propio token: aquí el algoritmo está en el código, no en el
mensaje que manda el cliente.

**Falla cerrado.** `APP_PASSWORD` y `APP_TOKEN_SECRET` no tienen valor por
defecto. Si faltan, todo `/api/*` responde **503** en vez de quedarse abierto: un
despliegue al que se le olvidó una variable se vuelve inaccesible, nunca público.

En el frontend el token vive en `localStorage` y lo añade `src/api/client.js` a
toda petición — un solo sitio, ningún componente lo toca. Si una respuesta llega
con 401, el propio cliente borra el token y avisa a `App.jsx`, que vuelve al
login: la sesión caducada se resuelve sola desde el único punto que la conoce.

### Decisiones de esta capa

**`/evaluate` y `POST /api/setups` están separados.** El formulario llama al
primero cada vez que el trader marca una opción, para que el Decision Panel se
actualice en vivo. Si previsualizar guardase, el histórico se llenaría de setups
a medio rellenar y dejaría de medir nada.

**El backend reevalúa siempre; no acepta un balance calculado por el cliente.**
Si el frontend pudiera mandar el veredicto, bastaría un bug —o alguien tocando la
petición— para guardar un setup que dice haber puntuado algo que nunca puntuó.

**No hay campo `direction` en la entrada, y mandarlo es un error 422.** Es la
regla del modelo de decisión hecha contrato: el trader describe lo que ve, el
motor deduce el sentido.

**Las reglas de configuración no se validan en Python.** Que el peso cubra sus
opciones, que solo haya una puerta, que las bandas no se solapen: eso lo hacen
cumplir los triggers y constraints del esquema. La API traduce su negativa a un
`409` y **propaga el mensaje original**, que explica el caso concreto:

```json
{ "error": {
    "code": "DB_CONSTRAINT",
    "message": "No se puede bajar el peso de \"Divergencia RSI\" a 5: ya tiene una opcion de 30 puntos absolutos."
} }
```

Reimplementar esas comprobaciones aquí sería tener la misma verdad en dos sitios
que se pueden desincronizar.

**Todos los errores tienen la misma forma**, `{"error": {"code", "message"}}`,
incluidos los que genera FastAPI por su cuenta:

| Código  | Cuándo                                                          |
| ------- | --------------------------------------------------------------- |
| `422`   | `SELECTION_INVALID` — opción inexistente o indicador sin responder |
| `422`   | `REQUEST_INVALID` — el cuerpo no cumple el contrato               |
| `409`   | `DB_CONSTRAINT` — una regla del esquema lo rechaza                |
| `500`   | `CONFIG_INVALID` — la configuración guardada es incoherente       |
| `503`   | `DB_UNAVAILABLE` — Supabase no responde                           |

**Las rutas son síncronas (`def`, no `async def`).** psycopg en modo asíncrono
necesita `add_reader` sobre sockets, y el `ProactorEventLoop` con el que Windows
arranca asyncio no lo implementa: el pool no llega a abrir ni una conexión en
local, y el arreglo hay que aplicarlo antes de que uvicorn cree el bucle, es
decir, fuera de este código. Con rutas `def` FastAPI las ejecuta en su threadpool,
la concurrencia sigue siendo real, y funciona igual en Windows, en Linux y bajo
pytest. Para un dashboard de un solo usuario cuyo cuello de botella es la latencia
hasta Supabase, la diferencia frente a async es inmedible.

---

## Puesta en marcha

### Requisitos

| Herramienta | Versión | Comprobar con      |
| ----------- | ------- | ------------------ |
| Python      | 3.11+   | `python --version` |
| Node.js     | 18+     | `node --version`   |
| Git         | 2.x     | `git --version`    |

Además, una cuenta gratuita en [Supabase](https://supabase.com) con un proyecto creado.

### Variables de entorno

```powershell
Copy-Item backend\.env.example  backend\.env
Copy-Item frontend\.env.example frontend\.env
```

Después rellena `backend/.env` con las credenciales de Supabase y con las dos
variables de autenticación —sin ellas el backend arranca, pero todo `/api/*`
responde 503—:

```powershell
# La contraseña la eliges tú; el secreto se genera, no se inventa.
openssl rand -hex 32     # → APP_TOKEN_SECRET
```

`frontend/.env` solo necesita la URL del backend.

### Base de datos

En el SQL Editor de Supabase, ejecutar **en este orden**:

```
backend/sql/001_schema.sql         tablas, triggers, vistas, RLS
backend/sql/002_seed.sql           catálogo de indicadores, opciones y umbrales
backend/sql/003_manual_result.sql  registro manual del resultado
backend/sql/004_security_invoker_views.sql   las vistas dejan de saltarse el RLS
backend/sql/005_sync_state.sql     marca de la última sincronización con Bybit
backend/sql/006_journal_y_puente.sql  journal de la operación y puente con el setup
```

003, 004, 005 y 006 ya están incluidos en 001 para instalaciones nuevas; en una base de
datos que ya estaba en marcha, aplican lo que le falta. Ver
[backend/sql/README.md](backend/sql/README.md).

Todos son idempotentes. Comprobar después con `select * from v_config_health;`.

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt -r requirements-dev.txt
uvicorn app.main:app --reload
```

Disponible en `http://localhost:8000` · documentación interactiva en `/docs`.

El arranque **espera a tener conexión** con la base de datos. Si las credenciales
están mal, falla ahí y no en la primera petición del trader.

Tests (194: 41 del motor, 10 de los tokens, 59 del adaptador de Bybit, 54+30 de
la API):

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest
```

Los del motor y los de los tokens son puros y no necesitan nada —el reloj entra
por parámetro, así que la caducidad de 30 días se prueba de verdad en vez de
esperarla—. Los de la API hablan con la base de datos real —las reglas de peso,
solape y coherencia **viven en el esquema**, y un mock las daría todas por
buenas— y se saltan solos si no hay `.env`. Todo lo que escriben usa el símbolo
`ZZTEST` y se borra al terminar.

La suite se autentica sola: inyecta `APP_PASSWORD` y `APP_TOKEN_SECRET` por
entorno y obtiene el token del endpoint real de login, no fabricándolo a mano.
La cabecera va por defecto en el cliente de pruebas, así que los tests que ya
existían no cambiaron ni una línea, y `anon_client` —sin token— es el que
comprueba que lo protegido está protegido.

**La suite nunca llama a Bybit.** Hacerlo la haría lenta, no determinista y
dependiente de una cuenta ajena. La firma, la traducción, el troceado en
ventanas y la vinculación se prueban puros en `test_bybit.py`; la
deduplicación y el vínculo contra setups reales, insertando por el repositorio
en `test_trades_api.py`. Como los tests de la marca de agua escriben en la fila
real de `sync_state` —el CHECK de la tabla no admite un `source` de pruebas—,
una fixture la fotografía antes y la restaura al terminar: si no, la suite
dejaría al trader con una marca falsa y su siguiente sincronización miraría 24
horas atrás en vez de los 90 días de la primera.

### Despliegue del backend en Railway

El repositorio tiene `frontend/` y `backend/` en la misma raíz. Al crear el
servicio en Railway hay que fijar **Root Directory: `backend/`** — si se deja en
blanco, Railway intenta construir desde la raíz del repo y no encuentra ni
`requirements.txt` ni el `Procfile`.

`backend/Procfile` declara el comando de arranque:

```
web: uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

`$PORT` lo asigna Railway en cada despliegue; `--host 0.0.0.0` es obligatorio
porque Railway solo enruta tráfico a ese host, nunca a `127.0.0.1`. El puerto no
se lee en ningún sitio del código a propósito: es un dato de cómo se arranca el
proceso, no de cómo se comporta la aplicación, así que vive en el `Procfile` y no
en `Settings`. En local no cambia nada: `uvicorn app.main:app --reload` sigue sin
`--port` y arranca en `8000`, el valor por defecto del propio uvicorn.

Variables de entorno a rellenar a mano en el dashboard de Railway (los nombres
viven en `backend/.env.example`; los valores, solo en tu `.env` local — nunca se
commitean):

| Variable | Obligatoria | Nota |
| --- | --- | --- |
| `DATABASE_URL` | **Sí** | El pooler de Supabase. Usa el *transaction pooler* (puerto 6543): los procesos de Railway son efímeros y el *session pooler* agota sus conexiones. |
| `APP_PASSWORD` | **Sí** | La contraseña compartida. Sin ella, todo `/api/*` responde 503 — la aplicación queda inaccesible, nunca abierta. |
| `APP_TOKEN_SECRET` | **Sí** | Con qué se firman los tokens. **Genéralo, no lo inventes**: `openssl rand -hex 32`. Cambiarlo invalida todas las sesiones abiertas, que es lo que quieres si sospechas que se filtró un token. |
| `CORS_ORIGINS` | **Sí, en la práctica** | Por defecto es `http://localhost:5173`. Sin cambiarla al dominio real de Vercel, el navegador bloquea toda petición del frontend en producción. |
| `APP_ENV` | Recomendada | `production` apaga `/docs` y `/openapi.json`. |
| `BYBIT_API_KEY` / `BYBIT_API_SECRET` | Solo para sincronizar | **De solo lectura**, sin permiso de trading ni de retiro. Sin ellas el backend arranca igual y solo `POST /api/trades/sync` responde 503. |
| `BYBIT_TESTNET` | Recomendada | Default `true` (cuenta de pruebas). Ponla en `false` cuando quieras importar de la cuenta real. |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | No todavía | Reservadas para el Storage de la Fase 2; el backend arranca sin ellas. |
| `LOG_LEVEL` | No | Default `info`. |
| `RULE_B_ENABLED` | No | Default `true`, ya es la decisión confirmada. |
| `DB_POOL_MIN_SIZE` / `DB_POOL_MAX_SIZE` | No | Defaults `1` / `4`, de sobra para un solo usuario. |

`PORT` **no se configura a mano**: Railway la inyecta sola en cada despliegue.

`BYBIT_API_KEY`, `BYBIT_API_SECRET` y `BYBIT_TESTNET` están en `.env.example`
pero `Settings` (`app/core/config.py`) todavía no las lee — son documentación
para la Fase 2. No hace falta configurarlas en Railway para que el backend de la
Fase 1 funcione.

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Disponible en `http://localhost:5173`. **El backend tiene que estar levantado**: la
pantalla de arranque llama a `GET /api/config/catalog` nada más cargar.

El puerto es `strictPort`: si el 5173 está ocupado, Vite falla en vez de saltar al
5174. El backend autoriza por CORS una lista blanca concreta, así que cambiar de puerto
en silencio convertiría un "puerto ocupado" en un error de CORS incomprensible.

Tests (89: 15 de riesgo, 33 del libro de órdenes y 41 del PDF):

```powershell
cd frontend
node tests/test_risk.mjs
node tests/test_orderbook.mjs
node tests/test_pdf.mjs
```

Sin framework y sin dependencias: `node:assert` basta para funciones puras, y meter un
runner entero para tres archivos sin DOM sería más cadena de suministro que test.
Los de riesgo cubren R:B, tamaño de posición, el caso agnóstico largo/corto, las
divisiones por cero —que devuelven `null`, nunca `Infinity` ni `NaN`— y el ATR
opcional. Los del libro cubren snapshots, deltas, el borrado por tamaño `0`, los saltos
de secuencia y la presión, con mensajes escritos a mano con la forma exacta que manda
Bybit: **nunca se abre un WebSocket**, que haría la suite lenta y no determinista.
Los del PDF comprueban lo que se rompe en silencio: que cada entrada del `xref` cae
justo donde empieza su objeto, que `/Length` es el número real de bytes, que los
acentos viajan en WinAnsi y no en UTF-8, que ninguna línea se sale del papel y que el
documento no cambia cuando cambia el catálogo. Salen con código distinto de 0 si algo
falla, así que sirven tal cual en CI.

El resto del frontend no tiene tests automáticos: se ha verificado a mano contra el
backend real y contra Bybit real, pantalla por pantalla.

### El proyecto no debe vivir dentro de OneDrive

`node_modules` y `.venv` son decenas de miles de archivos que OneDrive intentará
sincronizar: `npm install` falla con `EPERM`/`EBUSY` porque el sincronizador mantiene
archivos bloqueados mientras los sube. Este repositorio vive en `C:\dev\trading-dashboard`
justamente por eso.

---

## Seguridad

Reglas no negociables del proyecto:

1. **Ninguna credencial en el código.** Todo por variables de entorno.
2. **`.env` nunca se commitea.** Solo `.env.example`, con las llaves vacías.
3. **El frontend nunca habla con Supabase, y con el exchange solo por canales
   públicos y sin firmar.** Todo lo que toca la cuenta —historial, PnL,
   posiciones, configuración, setups— pasa por este backend, que es el único
   que tiene credenciales. Un secreto en el frontend es un secreto público:
   acaba dentro del bundle que se descarga el navegador.
   La **única** excepción es el WebSocket público de datos de mercado de la
   pantalla de Mercado: no lleva API key porque el tópico no la admite, y lo
   que devuelve es idéntico para cualquiera que se conecte. No hay nada que
   firmar ni, por tanto, nada que filtrar. Ver
   [Mercado](#mercado-datos-en-directo-sin-pasar-por-el-backend).
   RLS está activado en todas las tablas y sin políticas, y desde la migración
   **004** también las vistas lo respetan (`security_invoker = true`): antes se
   ejecutaban con los permisos de su dueño y dejaban leer el histórico con la
   clave `anon`, que es pública.
4. **La API key de Bybit es de solo lectura.** Sin permiso de trading ni de retiro.
   El adaptador llama a un único endpoint de consulta (`GET
   /v5/position/closed-pnl`) y no hay en todo el código una sola llamada capaz de
   abrir o cerrar una posición.
5. **El sistema nunca ejecuta órdenes.** No es una limitación temporal, es una decisión
   de diseño permanente.
6. **Nada de `/api/*` es público.** Una contraseña compartida protege todo lo que
   toca datos; solo `/health` y `/health/db` quedan abiertos, y no exponen ninguno.
   Si faltan `APP_PASSWORD` o `APP_TOKEN_SECRET`, la API se cierra (503) en vez de
   abrirse. Ver [Autenticación](#autenticación-una-contraseña-compartida).

Si alguna credencial se commitea por accidente: rótala en Supabase o Bybit
inmediatamente. Borrarla del repositorio no basta, queda en el historial de git.
Lo mismo vale para `APP_PASSWORD` y `APP_TOKEN_SECRET`: cambiar el secreto en
Railway invalida al instante todas las sesiones abiertas.

---

## Alcance de la Fase 1

Todos los inputs de indicadores son **manuales**: el trader rellena un formulario y el
sistema calcula el balance. No se detecta nada automáticamente todavía.

**Se construye:**

- [x] Decision Panel — LONG / SHORT / NO TRADE con el balance visible
- [x] Confluence Score — desglose de la aportación con signo de cada indicador
- [x] Permission Panel — clasificación derivada del valor absoluto del balance
- [x] Formulario de evaluación pre-trade, que evalúa en vivo sin escribir nada
- [x] Guardado del setup en el histórico — símbolo, timeframe, precio y notas,
      **antes** de conocer el resultado y con los puntos congelados
- [x] Gestión de riesgo — R:B, tamaño de posición, pérdida máxima
- [x] Configuración — edición de pesos y umbrales sin tocar código
- [x] Backend con endpoints reales contra Supabase (ver [API](#api))

**La Fase 1 está completa.**

**No se construyó en esta fase:** detección automática de divergencias o patrones,
integración con Kiyotaka, panel SDCA e indicadores on-chain, integración con Bybit,
multi-usuario o login. La integración con Bybit y la contraseña compartida llegaron
después, ya en la Fase 2; el multiusuario sigue siendo Fase 6.

### El setup se guarda antes de saber el resultado

El formulario pre-trade se registra **antes** de que la operación se cierre. Es la
decisión de diseño más importante del proyecto: si se evalúa un setup sabiendo que ganó,
se recuerda como bueno; si perdió, como malo. Guardarlo antes convierte la evaluación en
un dato honesto y hace posible medir después si el balance realmente predice algo.

Por el mismo motivo, cada setup guarda **congelados** los puntos que se aplicaron ese
día. Si más adelante se cambian los pesos, los setups antiguos no se reescriben.

---

## Roadmap

| Fase | Contenido                                                                   |
| ---- | --------------------------------------------------------------------------- |
| 1    | Motor de score con inputs manuales, gestión de riesgo, configuración         |
| 2    | Trading Journal con datos de la API de Bybit (solo lectura) + campos manuales |
| 3    | Estadísticas: win rate, profit factor, expectancy, drawdown, equity curve    |
| 4    | Base de datos consultable con filtros combinados                            |
| 5    | Backtesting del score, calendario, comparación plan vs ejecución             |
| 6    | Panel SDCA como contexto macro, multi-usuario                               |

Decisiones tomadas hoy que hacen posibles esas fases:

- Pesos, opciones, umbrales y lista de indicadores en tablas, no en el código.
- El enlace setup ↔ operación real de Bybit es **nullable** (`trades.setup_id`), y
  admite los tres casos: setup sin operar, setup ejecutado, y operación improvisada
  sin setup previo.
- Cada setup guarda una foto congelada de los puntos aplicados: el histórico es
  comparable entre meses aunque cambie la configuración.
- El motor de decisión es una función pura, reutilizable en el backtesting de la Fase 5.

---

## Estado actual

**Fase 1 completa.** Orden de entrega acordado:

1. [x] Estructura de carpetas, `.gitignore`, `.env.example`, README
2. [x] Esquema SQL de la base de datos — ver [backend/sql/README.md](backend/sql/README.md)
3. [x] Backend: motor de decisión (función pura) + tests — `app/scoring/`, 41 tests
4. [x] Backend: endpoints FastAPI — `app/api/`, 33 tests contra la BD real
5. [x] Frontend: Vite + React 18 + Tailwind, cliente de API y pantalla de conexión
6. [x] Frontend: formulario de evaluación de setup
7. [x] Frontend: Decision Panel + Confluence Score + Permission Panel
8. [x] Frontend: gestión de riesgo
9. [x] Frontend: configuración de pesos y umbrales
10. [x] Frontend: guardado del setup en el histórico — `POST /api/setups`,
       incluidos los NO TRADE

**Fase 2 en marcha.** Entregado hasta ahora:

11. [x] Autenticación por contraseña compartida y borrado de setups
12. [x] Backend: adaptador de solo lectura de Bybit, vinculación automática
        setup ↔ operación y `POST /api/trades/sync`
13. [x] Frontend: pantalla de Operaciones — sincronizar, listar, vincular a mano
14. [x] Frontend: pantalla de Mercado — precio con RSI y libro de órdenes en
        directo por WebSocket público
15. [x] Frontend: formulario y veredicto de vuelta en una sola pantalla
        («Evaluación»), después de probarlos partidos en dos pestañas
16. [x] Frontend: descarga del histórico en PDF, generado en el navegador y sin
        dependencias nuevas
17. [x] Journal libre en cada operación y puente visual Histórico ↔ Operaciones
18. [x] Densidad de «Evaluación» (veredicto fijo, formulario compacto) y
        rediseño de móvil: navegación inferior, veredicto en barra desplegable
        y tablas convertidas en tarjetas

### Mejoras futuras

Ninguna bloquea lo que queda de Fase 2; son cosas que se han quedado a propósito fuera
del alcance.

- **Mapa de liquidaciones.** Requiere un servicio de pago (Coinglass): decisión
  pendiente de que el trader confirme si le compensa la suscripción. El WebSocket
  público de Bybit no lo sirve.
- **Heatmap con memoria.** El de hoy es la foto del libro ahora; el que enseña dónde
  hubo liquidez hace una hora necesita guardar series en la base de datos, y eso ya no
  es esta pantalla.

- **Puntuar los patrones gráficos de forma distinta entre sí.** Hoy todos los alcistas
  valen +10 y todos los bajistas −10. Si el trader decide que un bull flag pesa más que
  un doble piso, son filas nuevas en `indicator_options`, no código.
- **Ver y reactivar indicadores u opciones inactivos.** La pantalla de configuración
  permite desactivarlos, pero `GET /api/config/catalog` solo devuelve los activos, así
  que desde ahí no se pueden recuperar: hoy hay que reactivarlos en la base de datos.
  Haría falta un parámetro nuevo en el endpoint del catálogo.
- **Filtros combinados en el histórico** (símbolo, decisión, rango de balance): son de
  la Fase 4. La pantalla ya pagina con `limit`/`offset` y `listSetups` ya acepta
  `symbol`, así que añadirlos será pasar parámetros, no reestructurar.
- **Tests automáticos del frontend más allá de `lib/risk.js`.**
