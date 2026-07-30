-- =============================================================================
--  003 — Resultado manual de un setup   (idempotente, como 001 y 002)
--
--  El trader ya opera en vivo y necesita registrar cómo terminó un setup sin
--  esperar a la integración con Bybit. La estructura elegida es la que el
--  esquema ya dejaba preparada: una fila en `trades` con `source = 'manual'`
--  vinculada al setup. Así `v_setups_with_outcome` sigue siendo la única
--  fuente del resultado y la Fase 2 no tiene nada que deshacer: las trades
--  manuales y las importadas conviven distinguidas por `source`.
--
--  Lo único que faltaba: la vista derivaba el outcome SOLO del signo del PnL,
--  y en el registro manual el PnL es opcional. Un trade sin PnL caía en el
--  `else` y salía BREAKEVEN aunque fuera una ganada. De ahí la columna
--  `manual_outcome`: lo que el trader declaró. La vista la usa únicamente
--  como respaldo cuando no hay PnL — cuando el PnL exista (a mano hoy, desde
--  Bybit mañana), el dato contable manda y la declaración no puede
--  contradecirlo (lo garantiza el CHECK, no el backend).
-- =============================================================================

begin;

alter table trades
  add column if not exists manual_outcome text
    check (manual_outcome in ('WIN', 'LOSS', 'BREAKEVEN'));

-- Declaración y PnL no pueden contradecirse. Con nombre propio para que
-- app/api/errors.py lo traduzca a un mensaje útil en vez del texto de Postgres.
alter table trades drop constraint if exists trades_manual_outcome_coherente;
alter table trades add constraint trades_manual_outcome_coherente check (
  manual_outcome is null
  or pnl_net is null
  or (manual_outcome = 'WIN'       and pnl_net > 0)
  or (manual_outcome = 'LOSS'      and pnl_net < 0)
  or (manual_outcome = 'BREAKEVEN' and pnl_net = 0)
);

-- La misma vista, con dos cambios:
--   · el outcome usa `manual_outcome` como respaldo cuando no hay PnL; si hay
--     PnL, se deriva de su signo igual que siempre (el dato objetivo manda).
--   · expone lo que el detalle del histórico necesita del resultado: notas de
--     cierre, origen y fechas (la de edición es la que delata una corrección).
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
