-- =============================================================================
--  TRADING DASHBOARD — Seed del catálogo
--
--  Ejecutar DESPUÉS de 001_schema.sql.
--  Idempotente: usa UPSERT contra los `code`, así que se puede relanzar tantas
--  veces como haga falta sin duplicar filas ni romper los setups históricos.
--
--  NO borra nada. Retirar un indicador o una opción del formulario se hace con
--  is_active = false, nunca con DELETE: hay setups apuntando a estas filas.
-- =============================================================================

begin;

-- =============================================================================
--  INDICADORES
--
--  Los pesos suman 100: 30 + 20 + 15 + 15 + 10 + 10.
--  Ese es el máximo teórico ±100 del balance.
-- =============================================================================

insert into indicators (code, name, description, max_weight, display_order, is_gate) values
  ('rsi_divergence',     'Divergencia RSI',
   'Disparador obligatorio de la estrategia. Sin divergencia no se busca operacion.',
   30, 1, true),

  ('weekly_trend',       'Tendencia semanal',
   'Contexto macro. No tiene estado neutral: o es alcista o es bajista.',
   20, 2, false),

  ('support_resistance', 'Soporte / Resistencia',
   'Proximidad del precio a una zona clave.',
   15, 3, false),

  ('liquidity',          'Liquidez',
   'Si ya se barrio liquidez, aumenta la probabilidad de reversion hacia el lado contrario.',
   15, 4, false),

  ('chart_pattern',      'Patrones graficos',
   'Confirmacion adicional. Nunca genera entrada por si solo.',
   10, 5, false),

  ('kiyotaka_barrier',   'Barreras Kiyotaka',
   'Barreras institucionales en el order book. Aparecen poco, pero pesan.',
   10, 6, false)
on conflict (code) do update set
  name          = excluded.name,
  description   = excluded.description,
  max_weight    = excluded.max_weight,
  display_order = excluded.display_order,
  is_gate       = excluded.is_gate;


-- =============================================================================
--  OPCIONES
--
--  Orden de presentación dentro de cada indicador: alcista → neutro → bajista.
--  Signo: positivo = alcista, negativo = bajista, 0 = neutro.
-- =============================================================================

-- ---- 1. DIVERGENCIA RSI — peso 30 — DISPARADOR ------------------------------
-- 'sin divergencia' vale 0 puntos y este indicador es la puerta (is_gate):
-- elegirla dispara la REGLA A y el motor devuelve NO TRADE sin calcular nada.
insert into indicator_options (indicator_id, code, label, points, display_order, is_default)
select i.id, v.code, v.label, v.points, v.display_order, v.is_default
from indicators i,
     (values
       ('regular_bullish', 'Divergencia regular alcista',  30::smallint, 1::smallint, false),
       ('hidden_bullish',  'Divergencia oculta alcista',   10::smallint, 2::smallint, false),
       ('none',            'Sin divergencia',               0::smallint, 3::smallint, true),
       ('hidden_bearish',  'Divergencia oculta bajista',  -10::smallint, 4::smallint, false),
       ('regular_bearish', 'Divergencia regular bajista', -30::smallint, 5::smallint, false)
     ) as v(code, label, points, display_order, is_default)
where i.code = 'rsi_divergence'
on conflict (indicator_id, code) do update set
  label = excluded.label, points = excluded.points,
  display_order = excluded.display_order, is_default = excluded.is_default;


-- ---- 2. TENDENCIA SEMANAL — peso 20 -----------------------------------------
-- Sin opción neutra y SIN DEFAULT a propósito: el trader está obligado a mirar
-- el semanal y decidir. Un default aquí sería una respuesta que nadie dio.
insert into indicator_options (indicator_id, code, label, points, display_order, is_default)
select i.id, v.code, v.label, v.points, v.display_order, v.is_default
from indicators i,
     (values
       ('bullish', 'Alcista',  20::smallint, 1::smallint, false),
       ('bearish', 'Bajista', -20::smallint, 2::smallint, false)
     ) as v(code, label, points, display_order, is_default)
where i.code = 'weekly_trend'
on conflict (indicator_id, code) do update set
  label = excluded.label, points = excluded.points,
  display_order = excluded.display_order, is_default = excluded.is_default;


-- ---- 3. SOPORTE / RESISTENCIA — peso 15 -------------------------------------
insert into indicator_options (indicator_id, code, label, points, display_order, is_default)
select i.id, v.code, v.label, v.points, v.display_order, v.is_default
from indicators i,
     (values
       ('near_support',    'Precio cerca de soporte',      15::smallint, 1::smallint, false),
       ('far',             'Precio lejos de cualquier zona', 0::smallint, 2::smallint, true),
       ('near_resistance', 'Precio cerca de resistencia', -15::smallint, 3::smallint, false)
     ) as v(code, label, points, display_order, is_default)
where i.code = 'support_resistance'
on conflict (indicator_id, code) do update set
  label = excluded.label, points = excluded.points,
  display_order = excluded.display_order, is_default = excluded.is_default;


-- ---- 4. LIQUIDEZ — peso 15 --------------------------------------------------
-- Ojo al signo: barrer liquidez INFERIOR es señal ALCISTA (reversión al alza).
insert into indicator_options (indicator_id, code, label, points, display_order, is_default)
select i.id, v.code, v.label, v.points, v.display_order, v.is_default
from indicators i,
     (values
       ('lower_swept', 'Barrida la liquidez inferior (reversion al alza)',  15::smallint, 1::smallint, false),
       ('none',        'Sin barrido',                                        0::smallint, 2::smallint, true),
       ('upper_swept', 'Barrida la liquidez superior (reversion a la baja)',-15::smallint, 3::smallint, false)
     ) as v(code, label, points, display_order, is_default)
where i.code = 'liquidity'
on conflict (indicator_id, code) do update set
  label = excluded.label, points = excluded.points,
  display_order = excluded.display_order, is_default = excluded.is_default;


-- ---- 5. PATRONES GRÁFICOS — peso 10 -----------------------------------------
-- DECIDIDO con el trader: todos los patrones valen lo mismo dentro de su
-- dirección (+10 alcista / -10 bajista), sin distinguir el tipo. Los usa como
-- confirmación, no como disparador. Los triángulos quedan FUERA a propósito:
-- son ambiguos y meterlos obligaría a inventarles un signo. Si algún día uno
-- pesa distinto que otro, esto son INSERT, no código.
insert into indicator_options (indicator_id, code, label, points, display_order, is_default)
select i.id, v.code, v.label, v.points, v.display_order, v.is_default
from indicators i,
     (values
       ('bullish', 'Patron alcista (bull flag, doble piso, HCH invertido)',  10::smallint, 1::smallint, false),
       ('none',    'Sin patron',                                              0::smallint, 2::smallint, true),
       ('bearish', 'Patron bajista (bear flag, doble techo, HCH)',          -10::smallint, 3::smallint, false)
     ) as v(code, label, points, display_order, is_default)
where i.code = 'chart_pattern'
on conflict (indicator_id, code) do update set
  label = excluded.label, points = excluded.points,
  display_order = excluded.display_order, is_default = excluded.is_default;


-- ---- 6. BARRERAS KIYOTAKA — peso 10 -----------------------------------------
insert into indicator_options (indicator_id, code, label, points, display_order, is_default)
select i.id, v.code, v.label, v.points, v.display_order, v.is_default
from indicators i,
     (values
       ('buy_wall',  'Barrera compradora fuerte (soporta el precio)',  10::smallint, 1::smallint, false),
       ('none',      'Sin barrera relevante',                           0::smallint, 2::smallint, true),
       ('sell_wall', 'Barrera vendedora fuerte (frena el precio)',    -10::smallint, 3::smallint, false)
     ) as v(code, label, points, display_order, is_default)
where i.code = 'kiyotaka_barrier'
on conflict (indicator_id, code) do update set
  label = excluded.label, points = excluded.points,
  display_order = excluded.display_order, is_default = excluded.is_default;


-- =============================================================================
--  UMBRALES DE CLASIFICACIÓN
--
--  Se aplican sobre el VALOR ABSOLUTO del balance. Cubren 0..100 sin huecos
--  ni solapes (el EXCLUDE de la tabla impide los solapes; v_config_health
--  avisa de los huecos).
-- =============================================================================

insert into classification_thresholds
  (code, label, min_abs_balance, max_abs_balance, is_tradeable, display_order, color_token) values
  ('very_strong', 'Operacion muy fuerte', 90, 100, true,  1, 'strong'),
  ('good',        'Buena oportunidad',    70,  89, true,  2, 'good'),
  ('medium',      'Confianza media',      50,  69, true,  3, 'medium'),
  ('no_trade',    'NO OPERAR',             0,  49, false, 4, 'none')
on conflict (code) do update set
  label           = excluded.label,
  min_abs_balance = excluded.min_abs_balance,
  max_abs_balance = excluded.max_abs_balance,
  is_tradeable    = excluded.is_tradeable,
  display_order   = excluded.display_order,
  color_token     = excluded.color_token;


-- =============================================================================
--  EMOCIONES  (Fase 2)
--
--  PROVISIONAL. Nadie ha confirmado este vocabulario todavía. Está aquí para
--  que la tabla `trades` tenga a qué apuntar; ampliarlo o cambiarlo es INSERT.
-- =============================================================================

insert into trade_emotions (code, label, display_order) values
  ('disciplined',   'Disciplinado, seguí el plan', 1),
  ('doubtful',      'Con dudas',                   2),
  ('fomo',          'FOMO',                        3),
  ('revenge',       'Revancha',                    4),
  ('fear',          'Miedo',                       5),
  ('overconfident', 'Exceso de confianza',         6),
  ('bored',         'Aburrimiento',                7)
on conflict (code) do update set
  label = excluded.label, display_order = excluded.display_order;


commit;


-- =============================================================================
--  COMPROBACIÓN
--  Debe devolver: suma_pesos = 100, y true en las tres banderas.
-- =============================================================================
-- select * from v_config_health;
