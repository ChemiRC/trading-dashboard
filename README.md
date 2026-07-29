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
entrada. Cada indicador aporta puntos y la suma produce un score de 0 a 100.

| Indicador                | Peso inicial |
| ------------------------ | ------------ |
| Divergencia RSI (1H/4H)  | 30           |
| Tendencia semanal        | 20           |
| Liquidez                 | 15           |
| Soporte / Resistencia    | 15           |
| Patrones gráficos        | 10           |
| Barreras Kiyotaka        | 10           |
| **Total**                | **100**      |

Clasificación del score:

| Score  | Lectura                |
| ------ | ---------------------- |
| 90–100 | Operación muy fuerte   |
| 70–89  | Buena oportunidad      |
| 50–69  | Confianza media        |
| < 50   | **NO OPERAR**          |

> Pesos y umbrales **viven en la base de datos**, no en el código. Se editan desde la
> pantalla de configuración. Añadir un indicador nuevo debe ser insertar una fila,
> no editar y redesplegar código.

Semántica de cada indicador:

- **Divergencia RSI** — disparador principal. Sin divergencia, normalmente no hay operación.
- **Tendencia semanal** — alcista / bajista / neutral. Define si se opera a favor o en
  contra del macro.
- **Liquidez** — si ya se barrió liquidez superior o inferior, aumenta la probabilidad
  de reversión.
- **Soporte / Resistencia** — cuanto más cerca esté el precio de una zona clave, más
  valor aporta.
- **Patrones gráficos** — bull flag, bear flag, triángulos, doble techo, doble piso,
  hombro-cabeza-hombro. Son confirmación adicional; no generan entrada por sí solos.
- **Barreras Kiyotaka** — barreras institucionales en el order book. Barrera vendedora
  fuerte → sesgo short; barrera compradora fuerte → sesgo long. Aparecen poco, pero pesan.

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
│   │   └── scoring/       Motor de scoring — función pura, sin dependencias
│   ├── sql/               Scripts de creación del esquema
│   ├── tests/             Tests del motor de scoring
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

- **`scoring/` aislado del resto.** El motor recibe los valores de los indicadores más
  la configuración de pesos y devuelve el score y su desglose. Nada más: no toca la base
  de datos, no sabe qué es HTTP. Así se puede testear con una tabla de casos y, en la
  Fase 5, reusarlo tal cual para hacer backtesting.
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
sistema calcula el score. No se detecta nada automáticamente todavía.

**Se construye:**

- [ ] Decision Panel — LONG / SHORT / NO TRADE con el score visible
- [ ] Confluence Score — desglose de la aportación de cada indicador
- [ ] Permission Panel — clasificación derivada del score
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
un dato honesto y hace posible medir después si el score realmente predice algo.

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

- Pesos, umbrales y lista de indicadores en tablas, no en el código.
- La tabla de setups tiene un campo de resultado **nullable**, para enlazarlo en la
  Fase 2 con la operación real traída de Bybit.
- El motor de scoring es una función pura, reutilizable en el backtesting de la Fase 5.

---

## Estado actual

Orden de entrega acordado:

1. [x] Estructura de carpetas, `.gitignore`, `.env.example`, README
2. [ ] Esquema SQL de la base de datos
3. [ ] Backend: motor de scoring (función pura) + tests
4. [ ] Backend: endpoints FastAPI
5. [ ] Frontend: setup de Vite + Tailwind + estructura de componentes
6. [ ] Frontend: formulario de evaluación de setup
7. [ ] Frontend: Decision Panel + Confluence Score + Permission Panel
8. [ ] Frontend: gestión de riesgo
9. [ ] Frontend: configuración de pesos y umbrales
