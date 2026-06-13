---
id: T-002
title: Persist contacts (encrypted, vault-keyed) with SAS state
phase: 2
state: review
owner_supervisor: cz4r777
owner_coder: Claude (Coder)
created: 2026-05-17
updated: 2026-06-02
invariants_touched: [I9, I13]
threat_model_section: §5 (forensic / device-seizure attacker), §3 (hostile relay)
---

# T-002 — Persist contacts (encrypted, vault-keyed) with SAS state

## Why

[`app/(tabs)/contacts.tsx`](../../app/(tabs)/contacts.tsx) currently shows a placeholder
"Saved (stub)" alert; nothing is persisted. Without persistence, SAS verification state
([INVARIANT I9](../invariants.md)) cannot survive a restart and the green/yellow padlock
becomes a lie. The Conversations screen also synthesises aliases from the first 8 chars of
the peer pubkey because there is no contact lookup.

[INVARIANT I13](../invariants.md) requires aliases and contact metadata to remain
local-only — they MUST NOT cross the device boundary. This ticket sets up the encrypted
local store that makes that possible.

## Scope (what's in)

- Add `lib/local_store.ts`: a small key-value store backed by `expo-secure-store` (native) +
  AsyncStorage (web), with the same encryption envelope as the vault (`secretbox` under the
  vault key). The vault key is held in `IdentityProvider` after unlock; the store API takes
  it explicitly so it cannot be called pre-unlock.
- Add a `contacts.json` blob inside the store: `Record<pubkey_hex, Contact>` where `Contact`
  is the existing type in [`lib/types.ts`](../../lib/types.ts).
- Expose `useContacts()` hook in `lib/identity.tsx` (or a new `lib/contacts.tsx`) returning
  `{ contacts, addContact, updateSasState, removeContact }`.
- Rewrite the Contacts screen so the "Save" button persists to the store. Replace the
  stub alert with success/failure UX.
- Wire the Conversations screen to look up the alias from the contacts store, falling back
  to `pubkey.slice(0, 8)` when no contact record exists.
- Vault payload itself stays unchanged. The contacts blob is a SEPARATE store entry under
  key `stingray.contacts.v1`.

## Out of scope (what's NOT in)

- SAS verification UX (T-003)
- QR-based pubkey exchange (separate Phase 2 follow-up)
- Conversation / message persistence (T-005)
- Contact key rotation / revocation (deferred to Phase 4+)

## Files likely to change

- `lib/local_store.ts` (new)
- `lib/contacts.tsx` (new, OR add hook to `lib/identity.tsx`)
- `lib/types.ts` (already has `Contact`; verify no churn)
- `app/(tabs)/contacts.tsx`
- `app/(tabs)/conversations.tsx`
- `docs/invariants.md` (cross-link I13 enforcement to the new file)
- `docs/api_contracts.md` (add the `stingray.contacts.v1` store entry to the on-device storage table)

## Acceptance criteria

- [ ] Adding a contact persists across app restart.
- [ ] The Conversations screen renders the contact's alias rather than a pubkey prefix
      when a record exists.
- [ ] All persistence writes go through `local_store.ts` and are `secretbox`-encrypted
      under the vault key. There is no plaintext `contacts.json` on disk.
- [ ] No alias or contact field is ever passed to `lib/relay.ts` or any function that
      hits the network. (Asserted by review.)
- [ ] Panic wipe removes the contacts blob along with the vault salt and blob. (Update
      `panicWipe()` in `lib/vault.ts` accordingly.)
- [ ] `typecheck` passes; no `console.log` of contact fields.

## Risk / threat-model implication

NARROWS the [§5](../threat_model.md) forensic threat: today, contact data could
hypothetically end up in unencrypted AsyncStorage if a future ticket cuts a corner. This
ticket establishes the encrypted-local-store substrate that subsequent tickets (T-005) build
on, removing the temptation.

[§3 hostile relay](../threat_model.md) is unaffected: nothing in this ticket touches the relay.
A reviewer should verify no new field ends up on the wire.

## Handover checklist

### `scoping → ready` (Supervisor) — DONE
- [x] All required front-matter fields set
- [x] Acceptance criteria testable
- [x] No relay schema change → no schema sign-off needed
- [x] [INVARIANT I13](../invariants.md) and [I9](../invariants.md) named explicitly

### `ready → coding` (Coder)
- [x] Ticket re-read cold
- [x] [lib/vault.ts](../../lib/vault.ts) + [lib/identity.tsx](../../lib/identity.tsx) read
- [x] [INVARIANT I13](../invariants.md) re-read with focus on "never crosses device boundary"
- [x] Branch `T-002-persist-contacts` (conceptual — repo not yet git-init'd; will land as one logical commit when initialised)

### `coding → review` (Coder)
- [~] `npm run typecheck` passes — NOT run from this environment (no `npm install` per metered-data rule); code is syntactically clean TS, Reviewer + Ops to confirm
- [ ] Manual test: enroll → add contact → kill app → unlock → contact visible — REQUIRES DEVICE RUN
- [ ] Manual test: panic wipe → re-enroll → contact list empty — REQUIRES DEVICE RUN
- [x] Docs updated (api_contracts.md on-device storage section — `stingray.contacts.v1` row added in same logical commit)
- [x] PR description names T-002 (see return-handover at docs/handover_archive/2026-06-02-coder-return-T-002.md)

### `review → staging` (Reviewer)
- [x] No `lib/relay.ts` call touches any contact field — verified by grep (relay.ts/envelope.ts: no contact/alias/sas_state/added_at crossings)
- [x] No call to `local_store.ts` outside post-unlock contexts (vault key must be in hand) — `ContactsProvider` guards every read/write on `unlocked`; `persist()` throws if locked
- [x] `panicWipe()` updated to clear `stingray.contacts.v1` — confirmed at `lib/vault.ts panicWipe()` via `localStoreDel(STORE_KEYS.CONTACTS)`

### Diagnostics Stage-4 verdict (2026-06-02) — APPROVED (code-clean), HELD at `review`
Walked pipeline §Stage 4 a–k against all 8 files: clean (service_role none; envelopes
schema untouched; no network path outside `lib/relay.ts`; no cached ephemeral keypair;
no `console.log` of secrets; no telemetry; I9 default-unverified enforced at the data
layer; I13/I7/I10 relied on, none weakened). Coder's two grep targets re-run by me —
both return nothing. Wiring confirmed (ContactsProvider mounted inside IdentityProvider;
conversations.tsx uses `aliasFor()` with pubkey fallback).

NOT advanced to `staging`. Two gates are Ops-only and unmet:
1. `npm run typecheck` — never run (metered-data rule); the `coding → review` gate
   still carries it as `[~]`. A Reviewer does not wave through unbuilt TS.
2. 6-step device smoke (persist-across-restart, alias render, panic-wipe empties).
Recommend: Ops runs typecheck → on pass, flip `review → staging`; then device smoke →
on pass, `staging → prod`. Inherited T-001 KDF-params-inside-blob finding is tracked
separately (T-001a, pending Supervisor ruling) and is NOT a T-002 blocker.

### `staging → prod` (Ops)
- [ ] Smoke test on iOS + Android preview builds
- [ ] Cross-platform: add contact on Android, switch to a fresh enroll on iOS, confirm
      independence (no cross-device sync, by design)

### `prod → done` (Supervisor)
- [ ] 24h clean monitoring
- [ ] T-003 (SAS verification UX) unblocked
