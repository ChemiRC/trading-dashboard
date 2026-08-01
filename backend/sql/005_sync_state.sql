-- =============================================================================
--  005 — Marca de la última sincronización   (idempotente, como 001-004)
--
--  `POST /api/trades/sync` necesita saber desde cuándo pedirle historial a
--  Bybit, o cada sincronización volvería a recorrer dos años de operaciones
--  para acabar descartándolas todas por duplicadas.
--
--  Una tabla y no una columna en ningún sitio existente porque la marca no
--  pertenece a ninguna fila: describe el estado de un PROCESO, no de un trade.
--  Con `source` como clave primaria, el día que haya una segunda fuente
--  (otro exchange, un importador de CSV) es un INSERT, no una migración.
--
--  Ojo con lo que NO garantiza: la marca es una optimización, no la fuente de
--  la verdad sobre qué está ya importado. De eso se encarga el UNIQUE de
--  `trades.bybit_order_id`. Por eso la sincronización relee siempre una
--  ventana de solapamiento hacia atrás (ver MARGEN_SOLAPAMIENTO en
--  app/adapters/bybit.py): si una sincronización muere a medias, la siguiente
--  recupera lo que faltaba en vez de saltárselo para siempre.
-- =============================================================================

begin;

create table if not exists sync_state (
  source          text        primary key
                              check (source in ('bybit')),
  last_synced_at  timestamptz,
  updated_at      timestamptz not null default now()
);

comment on table sync_state is
  'Marca de la ultima sincronizacion por fuente. Optimizacion para no releer '
  'todo el historial; la deduplicacion real la hace trades.bybit_order_id.';

drop trigger if exists sync_state_set_updated_at on sync_state;
create trigger sync_state_set_updated_at
  before update on sync_state
  for each row execute function set_updated_at();

alter table sync_state enable row level security;

commit;
