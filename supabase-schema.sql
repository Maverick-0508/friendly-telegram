-- Lawn Craft Supabase schema
-- Run this once in the Supabase SQL Editor. It is idempotent: safe to run
-- against a fresh project AND against pre-existing tables (it adds missing
-- columns/indexes and normalizes id columns without losing existing data).
--
-- The app connects with the service-role key (which bypasses RLS), so these
-- tables are written and read directly by the backend. Do not expose them to
-- anonymous clients; keep the anon key disabled where unused.

-- Clients (Client Hub profiles)
create table if not exists public.clients (
  id text primary key,
  name text,
  phone text,
  email text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.clients add column if not exists name text;
alter table public.clients add column if not exists phone text;
alter table public.clients add column if not exists email text;
alter table public.clients add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.clients add column if not exists created_at timestamptz not null default now();

create index if not exists clients_phone_idx on public.clients (phone);
create index if not exists clients_email_idx on public.clients (lower(email));

-- Work Orders (dispatch queue)
create table if not exists public.work_orders (
  id text primary key,
  client_id text,
  status text,
  invoice_id text,
  phone text,
  email text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.work_orders add column if not exists client_id text;
alter table public.work_orders add column if not exists status text;
alter table public.work_orders add column if not exists invoice_id text;
alter table public.work_orders add column if not exists phone text;
alter table public.work_orders add column if not exists email text;
alter table public.work_orders add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.work_orders add column if not exists created_at timestamptz not null default now();

create index if not exists work_orders_client_idx on public.work_orders (client_id);
create index if not exists work_orders_phone_idx on public.work_orders (phone);
create index if not exists work_orders_email_idx on public.work_orders (lower(email));
create index if not exists work_orders_status_idx on public.work_orders (status);

-- Invoices
create table if not exists public.invoices (
  id text primary key,
  client_id text,
  status text,
  phone text,
  email text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.invoices add column if not exists client_id text;
alter table public.invoices add column if not exists status text;
alter table public.invoices add column if not exists phone text;
alter table public.invoices add column if not exists email text;
alter table public.invoices add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.invoices add column if not exists created_at timestamptz not null default now();

create index if not exists invoices_client_idx on public.invoices (client_id);
create index if not exists invoices_phone_idx on public.invoices (phone);
create index if not exists invoices_email_idx on public.invoices (lower(email));
create index if not exists invoices_status_idx on public.invoices (status);

-- Quotes (form submissions + portal estimates)
create table if not exists public.quotes (
  id text primary key,
  client_id text,
  phone text,
  email text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.quotes add column if not exists client_id text;
alter table public.quotes add column if not exists phone text;
alter table public.quotes add column if not exists email text;
alter table public.quotes add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.quotes add column if not exists created_at timestamptz not null default now();

create index if not exists quotes_client_idx on public.quotes (client_id);
create index if not exists quotes_phone_idx on public.quotes (phone);
create index if not exists quotes_email_idx on public.quotes (lower(email));

-- Leads (contact form submissions)
create table if not exists public.leads (
  id bigserial primary key,
  name text not null,
  email text not null,
  phone text not null,
  message text not null default '',
  source text not null default 'website',
  created_at timestamptz not null default now()
);

create index if not exists leads_email_idx on public.leads (lower(email));

-- Clean up: pre-existing tables (from earlier iterations of this project) used
-- bigint/serial identity ids and may be referenced by legacy foreign keys
-- (e.g. contacts.client_id). Drop any FK pointing at our tables so we can
-- normalize the id columns without a type mismatch.

do $$
declare
  r record;
begin
  for r in
    select con.conname,
           con.conrelid::regclass as tbl
    from pg_constraint con
    where con.contype = 'f'
      and con.confrelid in (
        'public.clients'::regclass,
        'public.work_orders'::regclass,
        'public.invoices'::regclass,
        'public.quotes'::regclass,
        'public.leads'::regclass
      )
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

-- Normalize primary key columns to text (the app writes cl_*/wo_*/inv_*/qt_* ids).
-- Tolerates columns that are already text or no longer identity columns.
do $$
declare
  r record;
begin
  for r in
    select column_name,
           table_name,
           table_schema
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'id'
      and table_name in ('clients', 'work_orders', 'invoices', 'quotes')
      and data_type <> 'text'
  loop
    begin
      execute format('alter table %I.%I alter column id drop identity', r.table_schema, r.table_name);
    exception when others then
      null; -- column is not an identity column; ignore
    end;
    execute format('alter table %I.%I alter column id type text', r.table_schema, r.table_name);
  end loop;
end $$;