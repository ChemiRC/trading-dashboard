# Esquema de base de datos

## Orden de ejecución

```
001_schema.sql               → tablas, triggers, vistas, RLS
002_seed.sql                 → catálogo de indicadores, opciones, umbrales y emociones
003_manual_result.sql        → registro manual del resultado (columna manual_outcome,
                               CHECK de coherencia y vista ampliada)
004_security_invoker_views.sql → las vistas dejan de saltarse el RLS
```

Todos son **idempotentes**. Se pueden relanzar sin duplicar nada. Pegarlos en el
SQL Editor de Supabase o ejecutarlos con `psql "$DATABASE_URL" -f 001_schema.sql`.

003 y 004 existen para bases de datos que ya estaban en marcha antes de esas
entregas; 001 incluye lo mismo para instalaciones desde cero. Mantener 001 en
sincronía con las migraciones es deliberado: 001 es la verdad completa, las
numeradas son el camino desde una base de datos vieja.

Comprobación después del seed:

```sql
select * from v_config_health;
-- suma_pesos = 100, y true en suma_es_100, tiene_puerta, umbrales_cubren_0_100
```

---

## Mapa de tablas

```
indicators ──1:N──> indicator_options
     │                     │
     │  (FK RESTRICT)      │  (FK RESTRICT)
     └──────────┬──────────┘
                ▼
setups ──1:N──> setup_selections          classification_thresholds
   │                                              ▲
   │                                              └── setups.classification_id
   ▼ (FK en trades, nullable + unique)
trades ──1:N──> trade_screenshots
   └──> trade_emotions
```

---

## Por qué cada tabla está así

### `indicators` — la lista de preguntas

`code` y `name` están separados a propósito. El trader puede renombrar
"Barreras Kiyotaka" a lo que quiera desde la pantalla de ajustes; el motor y el
frontend referencian `code`, que no se toca nunca. Si el identificador fuese el
nombre visible, cada renombrado rompería el código.

`max_weight` es un **techo del valor absoluto**, no un multiplicador. Con peso 30,
las opciones de ese indicador pueden ir de -30 a +30. Dos triggers vigilan la
regla desde los dos lados: no puedes crear una opción que se pase del peso, ni
bajar el peso por debajo de una opción que ya existe. Sin esos triggers
`max_weight` sería un adorno y el máximo teórico de ±100 dejaría de ser cierto.

`is_gate` es la **Regla A convertida en dato**. El motor no pregunta
"¿este indicador se llama divergencia RSI?"; pregunta "¿este es el indicador
puerta y se ha elegido su opción neutra?". Si mañana el disparador pasa a ser
otro, es un `UPDATE`, no un deploy. Un índice único parcial garantiza que solo
haya una puerta.

`is_active` en vez de `DELETE`: hay setups históricos apuntando a estas filas.
Retirar un indicador del formulario es desactivarlo, nunca borrarlo.

### `indicator_options` — el catálogo

**No hay columna `direction`.** La dirección de una opción es el signo de sus
puntos, y punto. Una columna aparte sería un dato duplicado que tarde o temprano
se desincroniza (`points = -30` con `direction = 'bullish'`).

`points = 0` significa lectura neutra. Es lo único que necesita saber el motor
para aplicar la Regla A, así que no hace falta una bandera `is_neutral` extra.

`is_default` marca con qué valor arranca el formulario, y hay un índice único
parcial que impide dos defaults en el mismo indicador. **Tendencia semanal no
tiene default**: como no existe estado neutral, un valor por defecto sería una
respuesta que el trader nunca dio. Lo obliga a mirar el semanal.

En la divergencia RSI, el default es `Sin divergencia`. El formulario arranca en
NO TRADE y hay que justificar salir de ahí, que es el espíritu de la herramienta.

### `classification_thresholds` — las bandas

Los rangos van de **0 a 100, no de -100 a 100**, porque se aplican sobre el valor
absoluto: la misma banda sirve para un LONG de +85 y para un SHORT de -85.

Los dos extremos son inclusivos, `[min, max]`, y hay una **restricción de
exclusión** (`EXCLUDE USING gist`) que impide bandas solapadas. Como estos
umbrales se editan desde la app, sin ella el trader podría dejar 70-89 y 85-100 y
el motor devolvería una clasificación arbitraria según el orden del `SELECT`.
Ahora la base de datos rechaza el guardado.

`is_tradeable` es un booleano en la tabla, no un `if score < 50` en el motor.
El "NO OPERAR por debajo de 50" es configuración, no lógica.

### `setups` — la foto del momento

Todo lo que hay aquí está **congelado**: balance, dirección, clasificación. Si
dentro de tres meses subes el peso de la divergencia, este setup sigue valiendo
lo que valía el día que lo evaluaste. Es lo que hace respondible la pregunta de
la Fase 5: *¿el score predice algo?* Con un histórico que se reescribe solo, no
se puede medir nada.

`decision` y `direction` son campos distintos y la diferencia importa:

- `direction` es el **signo del balance** — hacia dónde apunta la evidencia.
- `decision` es el **veredicto** — LONG, SHORT o NO_TRADE.

Un setup puede tener `direction = 'LONG'` y `decision = 'NO_TRADE'` (balance +35,
por debajo del umbral). Fundirlos en un solo campo perdería justo el dato
interesante: cuántas veces la evidencia apuntaba a algo y aun así no se operó.

`no_trade_reason` distingue los cuatro motivos de descarte. Para la Fase 4 no es
lo mismo "no había divergencia" que "la divergencia decía una cosa y el resto
otra". Son análisis distintos del comportamiento del trader.

Tres `CHECK` mantienen la coherencia de la Regla A: si el motivo es
`GATE_NO_DIVERGENCE`, el balance y la dirección tienen que ser `NULL`, porque la
regla dice literalmente que no se calcula nada. La base de datos no deja escribir
un setup que diga haber aplicado la Regla A pero traiga un balance calculado.

`classification_id` (FK) **y** `classification_label` (texto) conviven: la FK
sirve para navegar y agrupar, el texto es la foto por si renombras la banda.

### `setup_selections` — el puente

La PK compuesta `(setup_id, indicator_id)` garantiza por construcción **una sola
opción por indicador y setup**. No hace falta validarlo en el backend.

Guarda la FK a la opción **y además** `points_applied` y `option_label`. Esa
redundancia es deliberada y es la decisión que congela el histórico: la FK dice
*qué se eligió*, las columnas copiadas dicen *cuánto valía y cómo se llamaba
entonces*.

Las FK a `indicators` y `indicator_options` son **`ON DELETE RESTRICT`**. No se
puede borrar una opción que algún setup usó. La vía correcta es `is_active =
false`: desaparece del formulario, sigue existiendo para el histórico.

El índice sobre `option_id` es el que resuelve la consulta de la Fase 4:
"todos los setups con divergencia oculta".

### `trades` — hoy el registro manual, mañana Bybit

Las columnas están **separadas en dos bloques**: lo que viene de Bybit y lo que
solo puede escribir el trader. La razón es operativa: los datos de Bybit se
pueden resincronizar en cualquier momento sin miedo; los motivos de entrada, la
emoción y los comentarios son irrecuperables si un `UPSERT` los pisa. Teniéndolos
identificados, la sincronización de la Fase 2 sabe qué le está permitido tocar.

Desde 003, el **registro manual del resultado** (adelanto de la Fase 2) escribe
aquí: una fila con `source = 'manual'`, el `manual_outcome` que el trader declaró
y, si lo tenía a mano, el PnL. `opened_at`/`closed_at` quedan a NULL a propósito
— el trader registra a posteriori y no sabemos cuándo cerró de verdad; inventar
un `now()` sería fabricar un dato que Bybit sí traerá. Un CHECK
(`trades_manual_outcome_coherente`) impide que la declaración contradiga al PnL,
y el UNIQUE de `setup_id` es el mismo que le impedirá a la sincronización de la
Fase 2 duplicar un setup ya resuelto.

`pnl_net` **no** es una columna calculada a partir de `pnl_gross - fees +
funding`. El neto que da el exchange es la verdad contable; recalcularlo nosotros
produciría discrepancias de céntimos con el extracto real. Se guardan los cuatro
valores tal cual llegan.

`duration` **sí** es una columna generada, a partir de `closed_at - opened_at`.
Es una resta de dos campos que ya están en la fila: escribirla a mano solo abre
la puerta a que se desincronice.

**El enlace con el setup vive aquí (`trades.setup_id`), no en `setups`.** Cubre
los tres casos reales:

| Situación                          | Cómo se ve                        |
| ---------------------------------- | --------------------------------- |
| Setup evaluado que salió NO TRADE  | setup sin trade                   |
| Setup evaluado y ejecutado         | trade con `setup_id`              |
| Operación improvisada, sin evaluar | trade con `setup_id = NULL`       |

El tercero es el importante: ese `NULL` es el dato que delata haberse saltado el
proceso. Con el enlace en `setups` esa operación no tendría dónde colgarse.

El "campo de resultado nullable" del setup existe como la vista
**`v_setups_with_outcome`**, que expone `outcome` (`WIN` / `LOSS` / `BREAKEVEN` /
`NULL`). Como vista y no como columna: el resultado ya lo sabe `trades`, y una
copia en `setups` sería un dato que se queda viejo. La derivación tiene un orden
deliberado: si hay PnL, el signo manda —el dato contable es la verdad, venga de
Bybit o tecleado—; solo cuando no lo hay se usa `manual_outcome`, lo que el
trader declaró. Sin esa columna, una ganada registrada sin PnL caería en el
`else` y saldría BREAKEVEN.

`emotion_code` apunta a un catálogo (`trade_emotions`) en vez de ser texto libre.
Con texto libre, las estadísticas de la Fase 3 no se pueden agrupar: "FOMO",
"fomo" y "un poco de fomo" serían tres emociones distintas.

### `trade_screenshots` — tabla aparte

Una operación tiene varias capturas (entrada, salida, contexto). Como columnas
fijas (`screenshot_1`, `screenshot_2`) habría que migrar el esquema la primera
vez que quieras adjuntar una tercera.

Guarda la **ruta en Supabase Storage**, no el binario. Las imágenes no tienen por
qué inflar los backups de la base de datos.

---

## Seguridad

RLS está **activado en todas las tablas y no hay ni una política**. El efecto es
que las claves `anon` y `authenticated` no pueden leer ni escribir nada. El
backend se conecta por `DATABASE_URL` como `postgres`, que tiene `BYPASSRLS`.

Es la traducción a SQL de la regla del README principal: *el frontend nunca habla
con Supabase, solo con este backend*. Si algún día alguien se lleva la URL de
Supabase y la clave pública al navegador, no consigue nada.

### Las vistas también respetan el RLS (004)

Durante un tiempo esa última frase fue mentira, y el Advisor de Supabase lo
avisaba como *"Security Definer View"*. Una vista se ejecuta por defecto con los
permisos de su **dueño**, no de quien la consulta; como las creó `postgres`,
atravesaban el RLS de las tablas base. Y Supabase concede `SELECT` sobre todo lo
de `public` a `anon` y `authenticated`. Medido antes de arreglarlo:

```sql
set role anon;
select count(*) from setups;                 -- 0   RLS funcionando
select count(*) from v_setups_with_outcome;  -- 2   RLS atravesado
```

Cualquiera con la URL del proyecto y la clave `anon` —pública por definición—
podía leer el histórico entero por la vista. Las tres se recrearon con
**`security_invoker = true`** (PostgreSQL 15+), que las hace ejecutarse con los
permisos de quien consulta. El backend no nota nada, porque `postgres` sigue
saltándose el RLS; `anon` pasa a ver cero filas.

`v_config_health` es el único caso especial: al ser una vista de agregados sigue
devolviendo **una fila** a `anon`, pero llena de ceros (`suma_pesos = 0`,
`suma_es_100 = false`). No filtra ningún dato: es el resultado de contar filas
que no puede ver.

---

## Decisiones cerradas con el trader

- **Patrones gráficos: todos valen lo mismo dentro de su dirección** (±10, tres
  opciones genéricas). **Los triángulos están fuera a propósito**: son ambiguos,
  pueden resolver hacia arriba o hacia abajo, y meterlos obligaría a inventarles
  un signo. Si algún día un patrón concreto pesa distinto, son `INSERT` en
  `indicator_options`, no código.
- **Regla B: confirmada y activa.** Implementada como
  `no_trade_reason = 'TRIGGER_CONTRADICTION'` y aislada en ese único valor, con
  su interruptor (`RULE_B_ENABLED`) para poder apagarla y medir cuánto filtra
  sin tocar el esquema.

## Pendiente de confirmar con el trader

- **Vocabulario de emociones.** El seed de `trade_emotions` es provisional.
