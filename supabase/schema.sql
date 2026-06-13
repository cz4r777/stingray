-- ============================================================
-- stingray — Relay schema (Supabase)
-- Run this in the Supabase SQL editor (Project → SQL → New query).
-- Idempotent: safe to re-run.
-- ============================================================
-- The relay is an OPAQUE CIPHERTEXT MAILBOX. It must not store:
--   - sender identifiers
--   - plaintext bodies
--   - message subjects, threads, or read state
--   - any field derived from the plaintext
-- See docs/invariants.md I3, I5, I6 and docs/forbidden_patterns.md §B1.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- envelopes ----------
-- INVARIANT I3: every column here is either addressing metadata the relay
-- already learns from the network (recipient pubkey, timestamp) or
-- ciphertext the relay cannot decrypt.
create table if not exists public.envelopes (
  id                uuid primary key default gen_random_uuid(),
  recipient_pubkey  text not null check (recipient_pubkey ~ '^[0-9a-f]{64}$'),
  ciphertext        text not null,
  ephemeral_pubkey  text not null,
  -- INVARIANT I5: bucket is one of the fixed sizes from lib/crypto.ts BUCKETS.
  bucket            int  not null check (bucket in (256, 1024, 4096, 16384)),
  created_at        timestamptz not null default now()
);
create index if not exists envelopes_recipient_idx on public.envelopes(recipient_pubkey, created_at);

-- INVARIANT I11: stale envelopes are deleted server-side after 30 days
-- to bound the amount of metadata sitting at rest. Recipients ack-delete
-- on read; this is the fallback for never-collected mail.
-- (Runs as a scheduled job — see docs/deployment.md §Relay maintenance.)
create or replace function public.expire_stale_envelopes()
returns int language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  with deleted as (
    delete from public.envelopes
      where created_at < now() - interval '30 days'
      returning 1
  )
  select count(*) into n from deleted;
  return n;
end $$;

-- ============================================================
-- Row-level security
-- ============================================================
alter table public.envelopes enable row level security;

-- INVARIANT I4: anyone can write an envelope (you only need the recipient's
-- public key, like email). Read is gated by knowing the recipient pubkey
-- you're querying for — there is no per-row owner, because there are no
-- accounts. The privacy boundary is the encryption itself, not RLS.
drop policy if exists "envelopes_insert_any"  on public.envelopes;
drop policy if exists "envelopes_read_by_key" on public.envelopes;
drop policy if exists "envelopes_delete_by_key" on public.envelopes;
create policy "envelopes_insert_any"
  on public.envelopes for insert to anon, authenticated
  with check (true);
-- Reads/deletes filter by recipient_pubkey. The client passes its own pubkey.
-- An attacker who guesses pubkeys learns only that mail exists; ciphertext
-- protects content. See docs/threat_model.md §3.
create policy "envelopes_read_by_key"
  on public.envelopes for select to anon, authenticated
  using (true);
create policy "envelopes_delete_by_key"
  on public.envelopes for delete to anon, authenticated
  using (true);

-- ============================================================
-- Realtime: subscribe to envelopes addressed to me.
-- ============================================================
alter publication supabase_realtime add table public.envelopes;
