-- Cache de velas server-side.
--
-- Correr una sola vez en Supabase → SQL Editor → New query → Run.
-- Es idempotente: volver a correrlo no rompe nada.
--
-- La PK (symbol, tf, time_sec) es lo que hace que el ingest sea idempotente:
-- `upsertCandles` usa ese conflicto, así que re-ingestar el mismo rango
-- actualiza en vez de duplicar.

create table if not exists public.candles (
  symbol   text   not null,
  tf       text   not null,
  time_sec bigint not null,
  o        numeric not null,
  h        numeric not null,
  l        numeric not null,
  c        numeric not null,
  v        numeric not null default 0,
  primary key (symbol, tf, time_sec)
);

-- Todas las lecturas filtran por (symbol, tf) y ordenan por tiempo. La PK ya
-- cubre ese prefijo, pero este índice deja el rango ordenado listo y evita el
-- sort en las consultas de rango largo.
create index if not exists candles_symbol_tf_time_idx
  on public.candles (symbol, tf, time_sec desc);

-- RLS prendido y SIN políticas: nadie entra con la anon key.
-- El acceso va sólo por las API routes, que usan la service key (la bypassea).
-- Sin esto, el proyecto queda con la tabla abierta a cualquiera con la URL.
alter table public.candles enable row level security;
