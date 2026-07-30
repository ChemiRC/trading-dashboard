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
routing, ni de estado. La barra de balance del Decision Panel son dos `div` con un
ancho en porcentaje, y no hay nada más que dibujar en la Fase 1. **Recharts entra en la
Fase 3**, con la equity curve y el drawdown, que sí son gráficas de verdad.

---

## Estructura del proyecto

```
trading-dashboard/
├── backend/
│   ├── app/
│   │   ├── adapters/      Vacío: reservado para las fuentes de datos de la Fase 2
│   │   ├── api/
│   │   │   ├── auth.py    Contraseña compartida y tokens firmados
│   │   │   ├── deps.py    Conexión y configuración vigente por petición
│   │   │   ├── errors.py  Errores internos → respuestas HTTP
│   │   │   └── routes/    health · auth · config · setups
│   │   ├── core/          Configuración, lectura de variables de entorno
│   │   ├── db/            Pool y repositorios de PostgreSQL / Supabase
│   │   ├── models/        Esquemas Pydantic (contratos de entrada y salida)
│   │   ├── scoring/       Motor de decisión — función pura, sin dependencias
│   │   └── main.py        Creación de la app, CORS, lifespan
│   ├── sql/               Esquema, seed y migraciones  (001 · 002 · 003 · README)
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
│   │   │   └── setups.js  evaluar · guardar · histórico · resultado · borrar
│   │   ├── components/
│   │   │   ├── decision/
│   │   │   │   ├── DecisionPanel.jsx     Veredicto y barra de balance
│   │   │   │   ├── ConfluenceScore.jsx   Desglose con signo por indicador
│   │   │   │   └── PermissionPanel.jsx   Clasificación y motivo del NO TRADE
│   │   │   ├── setup/
│   │   │   │   ├── EvaluationForm.jsx    Los 6 indicadores; evalúa en vivo
│   │   │   │   └── SaveSetupPanel.jsx    Símbolo/TF/precio/notas → guardar
│   │   │   ├── history/
│   │   │   │   ├── SetupList.jsx         Tabla del histórico, filas expandibles
│   │   │   │   └── SetupDetail.jsx       Desglose congelado de un setup
│   │   │   ├── risk/
│   │   │   │   └── RiskCalculator.jsx    R:B, tamaño de posición, ATR
│   │   │   ├── settings/
│   │   │   │   ├── IndicatorSettings.jsx Pesos y puntos de las opciones
│   │   │   │   ├── ThresholdSettings.jsx Bandas de clasificación
│   │   │   │   ├── ConfigHealth.jsx      Semáforo de v_config_health + Regla B
│   │   │   │   └── EditControls.jsx      Campos y barra de guardado
│   │   │   └── ui/        Reservado para componentes reutilizables (vacío)
│   │   ├── hooks/
│   │   │   └── useConfigDrafts.js  Borradores por fila de la configuración
│   │   ├── lib/
│   │   │   ├── format.js  Puntos con signo, color por signo, cifras, fechas
│   │   │   └── risk.js    Cálculos de riesgo — funciones puras
│   │   ├── pages/
│   │   │   ├── Login.jsx            Contraseña compartida
│   │   │   ├── SetupEvaluation.jsx  Formulario + los tres paneles
│   │   │   ├── RiskCalculation.jsx  Gestión de riesgo
│   │   │   ├── SetupHistory.jsx     Histórico con paginación
│   │   │   ├── Settings.jsx         Configuración de la estrategia
│   │   │   └── ConnectionCheck.jsx  Diagnóstico (no montada; ver abajo)
│   │   ├── App.jsx        Pestañas entre las cuatro pantallas
│   │   ├── main.jsx       Punto de entrada de React
│   │   └── index.css      Tokens de diseño (@theme de Tailwind)
│   ├── tests/             test_risk.mjs — cálculos de riesgo, sin framework
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
- **`adapters/` está reservado, todavía vacío.** Hoy los valores de los indicadores
  llegan de un formulario manual y entran directamente por los modelos Pydantic, sin
  capa intermedia: en la Fase 1 no hay dos orígenes que abstraer, y una interfaz con
  una sola implementación es una indirección que no paga su precio. La carpeta existe
  para que la Fase 2 —API de Bybit, detección automática— tenga sitio evidente donde
  ir, no porque ya haya nada dentro.
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

### Las cuatro pantallas

Se navega entre ellas con pestañas y estado local, **sin librería de routing**: ninguna
necesita URL propia ni botón de atrás, así que un router sería una dependencia entera
para resolver lo que `useState` ya resuelve. Solo la pestaña activa está montada:
cambiar de pestaña desmonta y remonta, así que cada visita al histórico o a
configuración relee del backend en vez de enseñar una copia vieja.

Por delante de las cuatro hay una quinta pantalla, el **login**: sin token no se
monta ninguna. No es la comprobación de seguridad —esa la hace el backend, que
rechaza cualquier `/api/*` sin token válido— sino de interfaz: sin sesión, todo lo
que se pintase sería una sucesión de 401.

| Pestaña | Qué hace |
| --- | --- |
| **Evaluación de setup** | Los 6 indicadores, los tres paneles de decisión y el guardado |
| **Gestión de riesgo** | R:B, tamaño de posición, pérdida máxima, ratios ATR |
| **Histórico** | Los setups guardados, su desglose congelado, el registro manual del resultado y el borrado |
| **Configuración** | Pesos, puntos, bandas y el semáforo de salud |

`ConnectionCheck` sigue en `pages/` pero **ya no se monta**: cumplió su papel en la
entrega 5 —demostrar que el frontend llega a Supabase de punta a punta— y se queda
como herramienta de diagnóstico a la que se vuelve editando `App.jsx`.

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

🔒 = exige `Authorization: Bearer <token>`.

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
backend/sql/003_manual_result.sql  registro manual del resultado (ya incluido en 001
                                   para instalaciones nuevas; en las existentes, aplica
                                   la columna y la vista que faltan)
```

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

Tests (105: 41 del motor, 10 de los tokens, 54 de la API):

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

Tests (15, sobre los cálculos de riesgo):

```powershell
cd frontend
node tests/test_risk.mjs
```

Sin framework y sin dependencias: `node:assert` basta para funciones puras, y meter un
runner entero para un archivo de aritmética sería más cadena de suministro que test.
Cubren R:B, tamaño de posición, el caso agnóstico largo/corto, las divisiones por cero
—que devuelven `null`, nunca `Infinity` ni `NaN`— y el ATR opcional. Salen con código
distinto de 0 si algo falla, así que sirven tal cual en CI.

El resto del frontend no tiene tests automáticos: se ha verificado a mano contra el
backend real, pantalla por pantalla.

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
3. **El frontend nunca habla con Supabase ni con el exchange.** Solo con este backend.
   El backend es el único que tiene credenciales. Un secreto en el frontend es un
   secreto público: acaba dentro del bundle que se descarga el navegador.
4. **La API key de Bybit (Fase 2) será de solo lectura.** Sin permiso de trading ni de
   retiro.
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

**No se construye en esta fase:** detección automática de divergencias o patrones,
integración con Kiyotaka, panel SDCA e indicadores on-chain, integración con Bybit,
multi-usuario o login.

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

### Mejoras futuras

Ninguna bloquea la Fase 2; son cosas que se han quedado a propósito fuera del alcance.

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
