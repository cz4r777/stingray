# Relay setup (Supabase)

> Supabase is reused here as an **opaque ciphertext mailbox**. The relay
> stores fields you can see in [schema.sql](schema.sql) — recipient public
> key, ciphertext bytes, ephemeral pubkey, bucket size, timestamp — and
> nothing else. **The server cannot decrypt anything.** If you ever change
> this file in a way that adds plaintext fields (sender, subject,
> readable metadata) you are violating [INVARIANT I3 in docs/invariants.md](../docs/invariants.md).

## Why a relay at all?

Live peer-to-peer (WebRTC over Wi-Fi) is the goal, but most of the time at
least one peer is offline. The relay buffers ciphertext until the recipient
reconnects on a non-cellular transport. It is the simplest dumb-pipe option
that supports realtime push.

The day live P2P over Wi-Fi-only or local mesh becomes solid, the relay can
become an optional "offline mailbox" toggle — see [docs/workflow.md Phase 5](../docs/workflow.md).

## Setup

1. Create a project at https://supabase.com (free tier).
2. Open **Project Settings → API** and copy:
   - Project URL → `EXPO_PUBLIC_RELAY_URL`
   - `anon` `public` key → `EXPO_PUBLIC_RELAY_ANON_KEY`
3. Paste those into `.env` (copy from `.env.example`).
4. Open **SQL Editor → New query**, paste the contents of `schema.sql`, run it.
   Re-running is safe (idempotent).
5. Confirm Realtime is enabled on `public.envelopes` (the schema does this).

## What's NOT here

| Not present | Why |
|---|---|
| User accounts / auth | Identity is a public key generated on-device. The relay does not authenticate writers — anyone can drop ciphertext for any recipient. See [docs/threat_model.md §3](../docs/threat_model.md). |
| Profiles, names | Aliases are local-only. See [docs/invariants.md I13](../docs/invariants.md). |
| Read receipts | Would leak who-read-what to the relay. Banned by [docs/forbidden_patterns.md §B4](../docs/forbidden_patterns.md). |
| Push routing tokens | APNs/FCM hand-off is a deferred feature; when added, it must use blinded tokens or a separate push provider that does not see the recipient pubkey. |
| Account deletion endpoint | There is no account. Panic-wipe deletes the local vault; old ciphertext addressed to a wiped key becomes undecryptable garbage. |

## When you change the schema

Edit `schema.sql` idempotently (`if not exists`, `drop policy if exists`).
Update [docs/api_contracts.md](../docs/api_contracts.md) in the **same commit**.
If the change widens what the relay can see, it must clear the
[review gate in docs/pipeline.md](../docs/pipeline.md) §Stage 4.
