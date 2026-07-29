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

> ⚠️ La Regla B está **pendiente de confirmación final con el trader** y podría cambiar.
> Está aislada en el código y en el esquema para poder retirarla sin tocar nada más.

> Pesos, opciones y umbrales **viven en la base de datos**, no en el código. Se editan
> desde la pantalla de configuración. Añadir un indicador nuevo debe ser insertar filas,
> no editar y redesplegar código.

### Pendiente de confirmar con el trader

- **Catálogo definitivo de patrones gráficos** y si todos valen lo mismo. Ahora mismo
  hay tres opciones genéricas (alcista / sin patrón / bajista) a ±10. **Los triángulos
  quedan fuera a propósito**: son ambiguos, pueden resolver hacia arriba o hacia abajo,
  y meterlos ahora obligaría a inventarles un signo.
- **Confirmación de la Regla B.**

---

## Stack

| Capa          | Tecnología                                      |
| ------------- | ----------------------------------------------- |
| Frontend      | React 18 + Vite + Tailwind CSS + Recharts       |
| Cliente HTTP  | `fetch` nativo (sin axios)                      |
| Backend       | Python 3.11 + FastAPI + Pydantic                |
| Base de datos | PostgreSQL en Supabase                          |
| Deploy        | Frontend → Vercel · Backend → Railway           |

---

## Estructura del proyecto

```
trading-dashboard/
├── backend/
│   ├── app/
│   │   ├── adapters/      Interfaz de fuentes de datos (hoy manual, mañana API)
│   │   ├── api/routes/    Endpoints FastAPI
│   │   ├── core/          Configuración, lectura de variables de entorno
│   │   ├── db/            Acceso a PostgreSQL / Supabase
│   │   ├── models/        Esquemas Pydantic (contratos de entrada y salida)
│   │   └── scoring/       Motor de decisión — función pura, sin dependencias
│   ├── sql/               Esquema y seed  (001_schema · 002_seed · README)
│   ├── tests/             Tests del motor de decisión
│   └── .env.example
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── api/           Cliente fetch contra el backend
│   │   ├── components/
│   │   │   ├── decision/  Decision Panel, Confluence Score, Permission Panel
│   │   │   ├── setup/     Formulario de evaluación pre-trade
│   │   │   ├── risk/      Gestión de riesgo
│   │   │   ├── settings/  Edición de pesos y umbrales
│   │   │   └── ui/        Componentes reutilizables
│   │   ├── hooks/
│   │   ├── lib/           Utilidades puras (formato, validación)
│   │   └── pages/
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
- **`adapters/` desde el día uno.** Hoy los valores de los indicadores llegan de un
  formulario manual. En fases posteriores llegarán de la API de Bybit o de un detector
  automático. Si todo entra por la misma interfaz, cambiar el origen no obliga a
  reescribir el resto.
- **`models/` separado de las rutas.** Los esquemas Pydantic son el contrato entre
  frontend y backend, y sirven de documentación viva en `/docs`.

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

Después rellena `backend/.env` con las credenciales de Supabase.
`frontend/.env` solo necesita la URL del backend.

### Base de datos

En el SQL Editor de Supabase, ejecutar **en este orden**:

```
backend/sql/001_schema.sql    tablas, triggers, vistas, RLS
backend/sql/002_seed.sql      catálogo de indicadores, opciones y umbrales
```

Ambos son idempotentes. Comprobar después con `select * from v_config_health;`.

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Disponible en `http://localhost:8000` · documentación interactiva en `/docs`.

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

Disponible en `http://localhost:5173`.

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

Si alguna credencial se commitea por accidente: rótala en Supabase o Bybit
inmediatamente. Borrarla del repositorio no basta, queda en el historial de git.

---

## Alcance de la Fase 1

Todos los inputs de indicadores son **manuales**: el trader rellena un formulario y el
sistema calcula el balance. No se detecta nada automáticamente todavía.

**Se construye:**

- [ ] Decision Panel — LONG / SHORT / NO TRADE con el balance visible
- [ ] Confluence Score — desglose de la aportación con signo de cada indicador
- [ ] Permission Panel — clasificación derivada del valor absoluto del balance
- [ ] Formulario de evaluación pre-trade (se guarda **antes** de conocer el resultado)
- [ ] Gestión de riesgo — R:B, tamaño de posición, pérdida máxima
- [ ] Configuración — edición de pesos y umbrales sin tocar código
- [ ] Backend con endpoints mockados

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

Orden de entrega acordado:

1. [x] Estructura de carpetas, `.gitignore`, `.env.example`, README
2. [x] Esquema SQL de la base de datos — ver [backend/sql/README.md](backend/sql/README.md)
3. [x] Backend: motor de decisión (función pura) + tests — `app/scoring/`, 41 tests
4. [ ] Backend: endpoints FastAPI
5. [ ] Frontend: setup de Vite + Tailwind + estructura de componentes
6. [ ] Frontend: formulario de evaluación de setup
7. [ ] Frontend: Decision Panel + Confluence Score + Permission Panel
8. [ ] Frontend: gestión de riesgo
9. [ ] Frontend: configuración de pesos y umbrales
