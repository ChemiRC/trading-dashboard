-- =============================================================================
--  TRADING DASHBOARD — Esquema de base de datos
--  PostgreSQL 15+ / Supabase
--
--  Ejecutar ANTES que 002_seed.sql.
--  Es idempotente: se puede volver a lanzar sin romper nada.
--
--  Principio rector: NADA de pesos, opciones ni umbrales vive en el código.
--  Todo está en estas tablas. Añadir un indicador nuevo es INSERT, no deploy.
-- =============================================================================

begin;

-- gen_random_uuid() es nativo desde PG13, pero Supabase lo expone vía pgcrypto.
create extension if not exists pgcrypto;


-- =============================================================================
--  0. UTILIDADES
-- =============================================================================

-- Mantiene updated_at al día en las tablas de configuración. Importa porque el
-- trader edita pesos y umbrales desde la app y queremos saber cuándo cambió qué.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- =============================================================================
--  1. INDICADORES
--
--  Un indicador es una pregunta que el trader responde sobre el gráfico.
--  `max_weight` es el techo del valor absoluto que ese indicador puede aportar:
--  con peso 30, sus opciones pueden ir de -30 a +30. No es un multiplicador
--  (ver decisión de modelado en sql/README.md); es un límite que se valida.
-- =============================================================================

create table if not exists indicators (
  id             smallint     primary key generated always as identity,

  -- Identificador estable que usan el motor y el frontend. El trader puede
  -- renombrar `name` cuando quiera; `code` no se toca nunca.
  code           text         not null unique,
  name           text         not null,
  description    text,

  -- Techo del valor absoluto de sus opciones. La suma de los pesos de los
  -- indicadores activos debería dar 100 (ver vista v_config_health).
  max_weight     smallint     not null check (max_weight > 0 and max_weight <= 100),

  display_order  smallint     not null,

  -- Desactivar en vez de borrar: borrar rompería los setups históricos.
  is_active      boolean      not null default true,

  -- REGLA A (puerta de entrada). El indicador marcado como puerta es el
  -- disparador obligatorio: si en un setup se elige su opción neutra
  -- (points = 0), el resultado es NO TRADE inmediato y no se calcula balance.
  -- Va como bandera en la tabla, no como `if indicator.code == 'rsi_divergence'`
  -- en el motor: mañana el disparador podría ser otro.
  is_gate        boolean      not null default false,

  created_at     timestamptz  not null default now(),
  updated_at     timestamptz  not null default now()
);

comment on column indicators.is_gate is
  'REGLA A: indicador disparador. Su opcion neutra (points=0) fuerza NO TRADE.';

-- El orden de presentación es único, pero DEFERRABLE para poder intercambiar
-- dos indicadores dentro de una misma transacción sin colisionar a mitad.
alter table indicators drop constraint if exists indicators_display_order_key;
alter table indicators add constraint indicators_display_order_key
  unique (display_order) deferrable initially deferred;

-- Como mucho un indicador puede ser la puerta de entrada. Todas las filas
-- indexadas valen true, así que UNIQUE deja pasar una sola.
create unique index if not exists indicators_single_gate_idx
  on indicators (is_gate) where is_gate;

drop trigger if exists indicators_set_updated_at on indicators;
create trigger indicators_set_updated_at
  before update on indicators
  for each row execute function set_updated_at();


-- =============================================================================
--  2. OPCIONES POR INDICADOR (el catálogo)
--
--  Cada opción es una respuesta posible, con sus puntos CON SIGNO.
--  Lectura alcista → positivo. Lectura bajista → negativo. Neutra → 0.
--  El signo es lo único que define la dirección: no hay columna 'direction'
--  porque sería un dato duplicado que puede desincronizarse.
-- =============================================================================

create table if not exists indicator_options (
  id             smallint     primary key generated always as identity,

  indicator_id   smallint     not null
                              references indicators(id) on delete cascade,

  code           text         not null,
  label          text         not null,

  -- CON SIGNO. Negativos permitidos y esperados.
  -- points = 0 significa "lectura neutra" y es lo que dispara la REGLA A
  -- cuando la opción pertenece al indicador puerta.
  points         smallint     not null check (points between -100 and 100),

  display_order  smallint     not null,

  -- Valor con el que arranca el formulario. Los indicadores sin estado neutro
  -- (tendencia semanal) no tienen default: obligan a elegir.
  is_default     boolean      not null default false,

  is_active      boolean      not null default true,

  created_at     timestamptz  not null default now(),
  updated_at     timestamptz  not null default now(),

  unique (indicator_id, code)
);

comment on column indicator_options.points is
  'Puntos CON SIGNO. Positivo = alcista, negativo = bajista, 0 = neutro.';

alter table indicator_options drop constraint if exists indicator_options_order_key;
alter table indicator_options add constraint indicator_options_order_key
  unique (indicator_id, display_order) deferrable initially deferred;

-- Como mucho un default por indicador.
create unique index if not exists indicator_options_single_default_idx
  on indicator_options (indicator_id) where is_default;

-- Filtro de Fase 4: "todos los setups con divergencia oculta".
create index if not exists indicator_options_indicator_idx
  on indicator_options (indicator_id, display_order);

drop trigger if exists indicator_options_set_updated_at on indicator_options;
create trigger indicator_options_set_updated_at
  before update on indicator_options
  for each row execute function set_updated_at();


-- ---- Coherencia peso ↔ opciones -------------------------------------------
-- Un CHECK no puede mirar otra tabla, así que la regla |points| <= max_weight
-- se vigila desde los dos lados con triggers. Sin esto, `max_weight` sería
-- decorativo y el máximo teórico de ±100 dejaría de ser cierto.

create or replace function enforce_option_within_weight()
returns trigger
language plpgsql
as $$
declare
  v_max  smallint;
  v_name text;
begin
  select max_weight, name into v_max, v_name
    from indicators where id = new.indicator_id;

  if abs(new.points) > v_max then
    raise exception
      'La opcion "%" aporta % puntos, pero el indicador "%" tiene peso maximo %.',
      new.label, new.points, v_name, v_max;
  end if;

  return new;
end;
$$;

drop trigger if exists indicator_options_within_weight on indicator_options;
create trigger indicator_options_within_weight
  before insert or update of points, indicator_id on indicator_options
  for each row execute function enforce_option_within_weight();


create or replace function enforce_weight_covers_options()
returns trigger
language plpgsql
as $$
declare
  v_needed smallint;
begin
  select max(abs(points)) into v_needed
    from indicator_options where indicator_id = new.id;

  if v_needed is not null and v_needed > new.max_weight then
    raise exception
      'No se puede bajar el peso de "%" a %: ya tiene una opcion de % puntos absolutos.',
      new.name, new.max_weight, v_needed;
  end if;

  return new;
end;
$$;

drop trigger if exists indicators_weight_covers_options on indicators;
create trigger indicators_weight_covers_options
  before update of max_weight on indicators
  for each row execute function enforce_weight_covers_options();


-- =============================================================================
--  3. UMBRALES DE CLASIFICACIÓN
--
--  Se aplican sobre el VALOR ABSOLUTO del balance. La dirección sale del signo;
--  la clasificación, de la magnitud. Por eso los rangos van de 0 a 100 y no
--  de -100 a 100: son la misma escala para LONG y para SHORT.
-- =============================================================================

create table if not exists classification_thresholds (
  id               smallint    primary key generated always as identity,

  code             text        not null unique,
  label            text        not null,

  -- Ambos extremos inclusivos: [min, max].
  min_abs_balance  smallint    not null check (min_abs_balance between 0 and 100),
  max_abs_balance  smallint    not null check (max_abs_balance between 0 and 100),

  -- Si es false, caer en esta banda es NO TRADE por magnitud insuficiente.
  -- Es un dato, no un umbral mágico de 50 escrito en el motor.
  is_tradeable     boolean     not null,

  display_order    smallint    not null,

  -- Token semántico para el frontend ('strong','good','medium','none').
  -- El color concreto lo decide el tema de la UI, no la base de datos.
  color_token      text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  check (min_abs_balance <= max_abs_balance),

  -- Dos bandas no pueden solaparse. Si el trader edita los umbrales desde la
  -- app y deja 70-89 y 85-100, la base de datos lo rechaza en vez de dejar que
  -- el motor devuelva una clasificación arbitraria.
  exclude using gist (
    int4range(min_abs_balance::int, max_abs_balance::int, '[]') with &&
  )
);

drop trigger if exists classification_thresholds_set_updated_at on classification_thresholds;
create trigger classification_thresholds_set_updated_at
  before update on classification_thresholds
  for each row execute function set_updated_at();


-- =============================================================================
--  4. SETUPS EVALUADOS
--
--  Se guarda ANTES de saber el resultado. Es la decisión de diseño central del
--  proyecto: un setup evaluado sabiendo que ganó ya no es un dato honesto.
--
--  Todo lo que hay aquí es una FOTO del momento de la evaluación:
--  balance, dirección y clasificación quedan congelados. Si dentro de tres
--  meses el trader sube el peso de la divergencia, este setup no cambia.
-- =============================================================================

create table if not exists setups (
  id                    uuid         primary key default gen_random_uuid(),

  evaluated_at          timestamptz  not null default now(),
  symbol                text         not null,

  -- Temporalidad en la que se observó la divergencia ('1H', '4H'...).
  timeframe             text,

  -- Precio de referencia al evaluar. Sirve en Fase 5 para comparar el plan
  -- con la ejecución real.
  price_at_evaluation   numeric(20,8),

  -- Balance crudo CON SIGNO, tal cual salió: -100 a +100, negativos incluidos.
  -- NULL únicamente cuando la REGLA A cortó la evaluación antes de calcularlo.
  raw_balance           smallint     check (raw_balance between -100 and 100),

  -- Dirección DEDUCIDA del signo del balance. El formulario nunca la pide.
  -- NULL si no hay balance (Regla A) o si el balance es exactamente 0.
  direction             text         check (direction in ('LONG','SHORT')),

  -- Veredicto final del motor.
  decision              text         not null
                                     check (decision in ('LONG','SHORT','NO_TRADE')),

  -- Por qué se descartó. Distinguirlos importa para la Fase 4: no es lo mismo
  -- "no había divergencia" que "la evidencia contradecía a la divergencia".
  --   GATE_NO_DIVERGENCE    → REGLA A: sin divergencia, ni se calcula.
  --   TRIGGER_CONTRADICTION → REGLA B: el balance contradice al disparador.
  --   ZERO_BALANCE          → balance exactamente 0, sin dirección deducible.
  --   BELOW_THRESHOLD       → banda de clasificación con is_tradeable = false.
  no_trade_reason       text         check (no_trade_reason in (
                                       'GATE_NO_DIVERGENCE',
                                       'TRIGGER_CONTRADICTION',
                                       'ZERO_BALANCE',
                                       'BELOW_THRESHOLD')),

  -- Clasificación aplicada. La FK permite navegar; el label es la foto textual
  -- por si el trader renombra la banda más adelante.
  classification_id     smallint     references classification_thresholds(id)
                                     on delete set null,
  classification_code   text,
  classification_label  text,

  notes                 text,
  created_at            timestamptz  not null default now(),

  -- Un setup operable tiene dirección y balance; uno descartado tiene motivo.
  constraint setups_decision_coherente check (
    (decision = 'NO_TRADE' and no_trade_reason is not null)
    or (decision <> 'NO_TRADE'
        and no_trade_reason is null
        and raw_balance is not null
        and direction = decision)
  ),

  -- REGLA A corta antes de calcular: no puede haber balance ni dirección.
  constraint setups_regla_a_sin_balance check (
    no_trade_reason is distinct from 'GATE_NO_DIVERGENCE'
    or (raw_balance is null and direction is null)
  ),

  -- El resto de motivos sí tienen balance calculado.
  constraint setups_resto_con_balance check (
    no_trade_reason is null
    or no_trade_reason = 'GATE_NO_DIVERGENCE'
    or raw_balance is not null
  )
);

comment on constraint setups_regla_a_sin_balance on setups is
  'REGLA A: sin divergencia no se calcula balance ni se evalua nada mas.';

create index if not exists setups_symbol_time_idx
  on setups (symbol, evaluated_at desc);

create index if not exists setups_decision_idx
  on setups (decision, evaluated_at desc);

create index if not exists setups_no_trade_reason_idx
  on setups (no_trade_reason) where no_trade_reason is not null;


-- =============================================================================
--  5. SELECCIONES DEL SETUP  (setup ↔ opción elegida en cada indicador)
--
--  La tabla que hace posible la Fase 4: "dame todos los setups con divergencia
--  oculta bajista y tendencia semanal alcista".
--
--  Guarda la FK a la opción Y los puntos que se aplicaron ese día. La columna
--  redundante es deliberada: congela el histórico. Ver sql/README.md.
-- =============================================================================

create table if not exists setup_selections (
  setup_id        uuid      not null references setups(id) on delete cascade,

  -- RESTRICT, no CASCADE: una opción usada en un setup histórico no se borra.
  -- Para retirarla del formulario se pone is_active = false.
  indicator_id    smallint  not null references indicators(id)        on delete restrict,
  option_id       smallint  not null references indicator_options(id) on delete restrict,

  -- CONGELADOS en el momento de la evaluación.
  points_applied  smallint  not null check (points_applied between -100 and 100),
  option_label    text      not null,

  created_at      timestamptz not null default now(),

  -- Una sola opción por indicador y setup. La PK ya lo garantiza.
  primary key (setup_id, indicator_id)
);

comment on column setup_selections.points_applied is
  'Puntos congelados. Editar los pesos hoy NO reescribe los setups de ayer.';

-- Búsqueda inversa: de una opción a todos los setups que la usaron.
create index if not exists setup_selections_option_idx
  on setup_selections (option_id);


-- =============================================================================
--  6. OPERACIONES  (vacía hasta Fase 2)
--
--  Datos objetivos traídos de la API de Bybit (SOLO LECTURA) + campos que solo
--  el trader puede rellenar. Separados a propósito: los primeros se pueden
--  resincronizar sin miedo, los segundos son irrecuperables si se pisan.
--
--  El enlace con el setup vive AQUÍ (trades.setup_id), no en setups:
--    · setup sin trade  → se evaluó y salió NO TRADE, o no se ejecutó
--    · trade sin setup  → operación improvisada; ese hueco es el dato que
--                         delata haberse saltado el proceso
-- =============================================================================

-- Catálogo de emociones. PROVISIONAL: pendiente de confirmar con el trader.
-- Va en tabla y no en un CHECK para que ampliarlo sea un INSERT.
create table if not exists trade_emotions (
  code           text        primary key,
  label          text        not null,
  display_order  smallint    not null,
  is_active      boolean     not null default true
);


create table if not exists trades (
  id                uuid         primary key default gen_random_uuid(),

  -- 1:1 opcional con el setup. UNIQUE: un setup no puede generar dos trades.
  setup_id          uuid         unique references setups(id) on delete set null,

  -- ---- Objetivo: viene de Bybit -------------------------------------------
  bybit_order_id    text         unique,   -- el UUID de la orden en Bybit
  bybit_exec_id     text,
  symbol            text         not null,
  side              text         not null check (side in ('LONG','SHORT')),

  entry_price       numeric(20,8),
  exit_price        numeric(20,8),
  quantity          numeric(20,8),         -- tamaño, en unidades del contrato
  leverage          numeric(6,2),

  opened_at         timestamptz,
  closed_at         timestamptz,

  -- Derivada, no se escribe a mano: no puede desincronizarse de las fechas.
  duration          interval     generated always as (closed_at - opened_at) stored,

  -- Los cuatro se guardan tal cual los da Bybit. pnl_net NO es una columna
  -- calculada: el neto del exchange es la verdad contable, y recalcularlo
  -- nosotros introduciría discrepancias de céntimos con el extracto real.
  pnl_gross         numeric(20,8),
  fees              numeric(20,8),
  funding           numeric(20,8),
  pnl_net           numeric(20,8),

  -- Registro manual (003): lo que el trader declaró cuando no hay PnL del
  -- que derivar el resultado. La vista solo lo usa como respaldo; si el PnL
  -- existe, el dato contable manda y el CHECK de abajo impide contradicciones.
  manual_outcome    text         check (manual_outcome in ('WIN','LOSS','BREAKEVEN')),

  -- ---- Subjetivo: solo lo rellena el trader ------------------------------
  entry_reason      text,
  exit_reason       text,
  emotion_code      text         references trade_emotions(code) on delete set null,
  comments          text,

  -- ---- Trazabilidad -------------------------------------------------------
  source            text         not null default 'bybit'
                                 check (source in ('bybit','manual')),
  synced_at         timestamptz,
  created_at        timestamptz  not null default now(),
  updated_at        timestamptz  not null default now(),

  check (closed_at is null or opened_at is null or closed_at >= opened_at),

  -- Declaración manual y PnL no pueden contradecirse (ver 003).
  constraint trades_manual_outcome_coherente check (
    manual_outcome is null
    or pnl_net is null
    or (manual_outcome = 'WIN'       and pnl_net > 0)
    or (manual_outcome = 'LOSS'      and pnl_net < 0)
    or (manual_outcome = 'BREAKEVEN' and pnl_net = 0)
  )
);

drop trigger if exists trades_set_updated_at on trades;
create trigger trades_set_updated_at
  before update on trades
  for each row execute function set_updated_at();

create index if not exists trades_symbol_time_idx on trades (symbol, opened_at desc);
create index if not exists trades_closed_idx      on trades (closed_at desc)
  where closed_at is not null;


-- Capturas de pantalla. Tabla aparte porque una operación tiene varias
-- (entrada, salida, contexto) y meterlas como columnas fijas obligaría a
-- migrar el esquema la primera vez que quieras adjuntar una tercera.
create table if not exists trade_screenshots (
  id             uuid        primary key default gen_random_uuid(),
  trade_id       uuid        not null references trades(id) on delete cascade,

  -- Ruta en Supabase Storage. La base de datos guarda la referencia, no el
  -- binario: las imágenes no tienen por qué inflar los backups de la BD.
  storage_path   text        not null,

  kind           text        not null default 'context'
                             check (kind in ('entry','exit','context')),
  caption        text,
  display_order  smallint    not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists trade_screenshots_trade_idx
  on trade_screenshots (trade_id, display_order);


-- =============================================================================
--  7. VISTAS
-- =============================================================================

-- Lo que el frontend pide para pintar el formulario. Un solo GET y ya tiene
-- indicadores, opciones, puntos y defaults, en orden. Cero catálogo en el JS.
create or replace view v_indicator_catalog
with (security_invoker = true) as
select
  i.id            as indicator_id,
  i.code          as indicator_code,
  i.name          as indicator_name,
  i.description,
  i.max_weight,
  i.is_gate,
  i.display_order as indicator_order,
  o.id            as option_id,
  o.code          as option_code,
  o.label         as option_label,
  o.points,
  o.is_default,
  o.display_order as option_order
from indicators i
join indicator_options o on o.indicator_id = i.id
where i.is_active and o.is_active
order by i.display_order, o.display_order;


-- Salud de la configuración. Si el trader edita pesos hasta que dejen de sumar
-- 100, la pantalla de ajustes lo enseña en vez de dejar que el ±100 sea mentira.
create or replace view v_config_health
with (security_invoker = true) as
select
  (select coalesce(sum(max_weight), 0) from indicators where is_active)      as suma_pesos,
  (select coalesce(sum(max_weight), 0) from indicators where is_active) = 100 as suma_es_100,
  (select count(*) from indicators where is_active and is_gate) = 1           as tiene_puerta,
  -- Los umbrales no se solapan (lo garantiza el EXCLUDE), pero sí pueden
  -- dejar huecos. Comprobamos que cubren 0..100 sin agujeros.
  (select coalesce(sum(max_abs_balance - min_abs_balance + 1), 0)
     from classification_thresholds) = 101                                    as umbrales_cubren_0_100;


-- El "campo de resultado nullable" del setup, resuelto como vista en vez de
-- como columna duplicada: el resultado ya lo sabe `trades`, y una copia en
-- `setups` sería un dato que se puede quedar desactualizado.
--
-- El outcome se deriva del PnL cuando existe (el dato contable manda, venga
-- de Bybit o tecleado a mano) y de `manual_outcome` como respaldo cuando no:
-- en el registro manual el PnL es opcional y el trader aún sabe si ganó.
create or replace view v_setups_with_outcome
with (security_invoker = true) as
select
  s.*,
  t.id        as trade_id,
  t.pnl_net,
  case
    when t.id is null          then null            -- todavía sin resultado
    when t.pnl_net > 0         then 'WIN'
    when t.pnl_net < 0         then 'LOSS'
    when t.pnl_net is not null then 'BREAKEVEN'
    else t.manual_outcome                           -- sin PnL: lo declarado
  end as outcome,
  t.exit_reason as result_notes,
  t.source      as trade_source,
  t.created_at  as result_created_at,
  t.updated_at  as result_updated_at
from setups s
left join trades t on t.setup_id = s.id;


-- =============================================================================
--  8. SEGURIDAD (Supabase)
--
--  RLS activado y CERO políticas: anon y authenticated no pueden tocar nada.
--  El backend usa la service_role key, que salta RLS por diseño. Es la
--  traducción a SQL de la regla del README: el frontend nunca habla con
--  Supabase, solo con nuestro backend.
-- =============================================================================

alter table indicators                enable row level security;
alter table indicator_options         enable row level security;
alter table classification_thresholds enable row level security;
alter table setups                    enable row level security;
alter table setup_selections          enable row level security;
alter table trades                    enable row level security;
alter table trade_emotions            enable row level security;
alter table trade_screenshots         enable row level security;

commit;
