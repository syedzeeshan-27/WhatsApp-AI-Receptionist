-- WhatsApp AI Receptionist — database tables.
-- Paste this into Supabase → SQL Editor → New query → Run. Safe to run twice.
-- Only needed if you want chats to survive restarts; without SUPABASE_URL the
-- bot keeps everything in memory.

-- Every message in and out, grouped by customer (wa_id = WhatsApp number).
create table if not exists public.conversations (
  id             bigint generated always as identity primary key,
  wa_id          text        not null,
  role           text        not null check (role in ('user', 'assistant')),
  content        text        not null,
  wa_message_id  text,                       -- WhatsApp's message id (inbound only)
  created_at     timestamptz not null default now()
);

-- Meta sometimes delivers the same message twice. This unique index makes the
-- second insert fail (code 23505), which the bot treats as "already handled".
create unique index if not exists conversations_wa_message_id_key
  on public.conversations (wa_message_id);

create index if not exists conversations_wa_id_created_at_idx
  on public.conversations (wa_id, created_at desc);

-- Appointments reported by the Cal.com webhook, so the bot can hand a patient
-- their own reschedule/cancel link when they ask for it.
create table if not exists public.bookings (
  id               bigint generated always as identity primary key,
  wa_id            text        not null,
  uid              text        not null,      -- Cal.com booking uid
  reschedule_link  text,
  cancel_link      text,
  start_time       timestamptz,
  title            text,
  created_at       timestamptz not null default now()
);

create index if not exists bookings_wa_id_created_at_idx
  on public.bookings (wa_id, created_at desc);
create index if not exists bookings_uid_idx on public.bookings (uid);

-- Lock the tables down. The server uses the service_role key, which bypasses
-- RLS; with RLS on and no policies, the public anon key can't read anything.
alter table public.conversations enable row level security;
alter table public.bookings enable row level security;
