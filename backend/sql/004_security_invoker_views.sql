-- =============================================================================
--  004 — Las vistas respetan el RLS de sus tablas   (idempotente, como 001-003)
--
--  Aviso "Security Definer View" del Advisor de Supabase, y no era teórico.
--
--  Una vista de PostgreSQL se ejecuta por defecto con los permisos de su
--  DUEÑO, no de quien la consulta. Estas tres las creó `postgres`, que tiene
--  BYPASSRLS, así que atravesaban el RLS de las tablas base. Y como Supabase
--  concede SELECT sobre todo lo de `public` a los roles `anon` y
--  `authenticated`, el resultado medido antes de aplicar esto era:
--
--      set role anon;
--      select count(*) from setups;                 -- 0   (RLS funciona)
--      select count(*) from v_setups_with_outcome;  -- 2   (RLS atravesado)
--
--  Es decir: cualquiera con la URL del proyecto y la clave `anon` —que es
--  pública por definición, va en el bundle de cualquier frontend de Supabase—
--  podía leer el histórico entero a través de la vista. La regla del README
--  ("RLS activado y cero políticas: anon no puede tocar nada") era cierta para
--  las tablas y falsa para las vistas.
--
--  `security_invoker = true` (PostgreSQL 15+) hace que la vista se ejecute con
--  los permisos de QUIEN la consulta. El backend no se entera: se conecta como
--  `postgres`, que sigue teniendo BYPASSRLS. `anon` deja de ver nada, porque
--  el RLS de las tablas base ya no se salta y no hay ni una política.
--
--  Se recrean con CREATE OR REPLACE en vez de un ALTER VIEW ... SET para que
--  este archivo sea legible por sí solo: la definición que queda es la que se
--  lee aquí, no hay que ir a buscarla a 001 y 003.
-- =============================================================================

begin;

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


create or replace view v_config_health
with (security_invoker = true) as
select
  (select coalesce(sum(max_weight), 0) from indicators where is_active)      as suma_pesos,
  (select coalesce(sum(max_weight), 0) from indicators where is_active) = 100 as suma_es_100,
  (select count(*) from indicators where is_active and is_gate) = 1           as tiene_puerta,
  (select coalesce(sum(max_abs_balance - min_abs_balance + 1), 0)
     from classification_thresholds) = 101                                    as umbrales_cubren_0_100;


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

commit;
