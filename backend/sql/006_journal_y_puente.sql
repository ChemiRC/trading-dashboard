-- =============================================================================
--  006 · Notas de journal en cada operación, y el puente Histórico ↔ Operaciones
--
--  Idempotente. Ya incluido en 001 para instalaciones nuevas.
--
--  ---------------------------------------------------------------------------
--  NO SE AÑADE NINGUNA COLUMNA. Se usa `trades.comments`, que ya existía.
--  ---------------------------------------------------------------------------
--
--  La tabla `trades` nació (001) con cuatro columnas subjetivas reservadas para
--  el journal: `entry_reason`, `exit_reason`, `emotion_code` y `comments`. De
--  las cuatro solo se usa `exit_reason`, y no con su nombre: la vista de abajo
--  la publica como `result_notes` desde la migración 003.
--
--  Las notas libres de una operación —motivo de entrada, de salida, cómo se
--  vivió— son exactamente para lo que se reservó `comments`. Crear una columna
--  nueva llamada `journal_notes` al lado de una `comments` vacía dejaría dos
--  sitios donde escribir lo mismo y, dentro de seis meses, la pregunta de cuál
--  de las dos es la buena. Se publica como `journal_notes` en la API por el
--  mismo mecanismo con el que `exit_reason` se publica como `result_notes`:
--  aquí eso ya es la costumbre, no una excepción.
--
--  Si algún día hacen falta los otros tres campos por separado (motivo de
--  entrada, emoción), las columnas siguen ahí esperando.
-- =============================================================================


-- -----------------------------------------------------------------------------
--  La vista del histórico, ampliada con la operación vinculada
--
--  El Histórico responde «¿qué decidí?» y Operaciones «¿qué hice?»: siguen
--  siendo dos pantallas. Pero al abrir un setup que sí acabó en operación, no
--  poder ver cuál fue obligaba a cambiar de pantalla y buscarla a ojo. Estos
--  campos son ese puente.
--
--  `security_invoker = true` se conserva de la 004: sin él la vista volvería a
--  ejecutarse con los permisos de su dueño y dejaría leer el histórico con la
--  clave `anon`, que es pública.
-- -----------------------------------------------------------------------------
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
  t.updated_at  as result_updated_at,

  -- ---- Puente hacia Operaciones -------------------------------------------
  t.symbol      as trade_symbol,
  t.side        as trade_side,
  t.opened_at   as trade_opened_at,
  t.closed_at   as trade_closed_at,
  t.entry_price as trade_entry_price,
  t.exit_price  as trade_exit_price,
  t.quantity    as trade_quantity,
  t.comments    as trade_journal_notes
from setups s
left join trades t on t.setup_id = s.id;
