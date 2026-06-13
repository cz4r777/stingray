---
id: T-005
title: Persist conversations + messages in vault-encrypted local store
phase: cross-cutting (depends on T-001, T-002)
state: coding
owner_supervisor: cz4r777
owner_coder: Claude (Coder)
created: 2026-05-17
updated: 2026-06-02
invariants_touched: [I7, I11, I12, I13]
threat_model_section: §5 (forensic / device-seizure attacker)
batch: T-003 + T-005 (alpha)
---

# T-005 — Persist conversations + messages locally (encrypted)

## Why

[`app/(tabs)/conversations.tsx`](../../app/(tabs)/conversations.tsx) currently roll-ups
conversations from a single relay drain on mount, and [`app/chat/[peer].tsx`](../../app/chat/[peer].tsx)
only renders messages received during the current screen mount. As a result:

- Restarting the app loses the conversation list and history.
- Messages received in the chat screen are dropped after navigating away.
- The ack-delete-on-decrypt path in [`lib/envelope.ts`](../../lib/envelope.ts) does its job —
  the relay no longer has the envelope — so without local persistence, the message is
  effectively gone.

This is a usability bug that, if "solved" the wrong way (caching plaintext in AsyncStorage),
becomes a [forbidden_patterns.md B7.1](../forbidden_patterns.md) violation: plaintext on
disk unprotected.

The right fix is: persist into the same vault-encrypted local store T-002 establishes for
contacts.

## Scope (what's in)

- Extend the `local_store` API from T-002 with `getJSON / setJSON / appendJSON` helpers.
- Persist a `conversations.json` blob: `Record<peer_pubkey_hex, Plaintext[]>`. Keep the array
  capped (e.g. last 500 messages per conversation) and document the cap in a comment.
- On envelope receive: append to the conversation's array AFTER successful decrypt + ack-delete.
  The order is: decrypt → persist locally → ack-delete on relay. A crash between persist and
  ack-delete is acceptable (we may re-receive the same message later and the decrypted-message
  id is the dedupe key).
- On envelope decrypt failure: drop silently, no persistence, no log. [INVARIANT I12](../invariants.md).
- Rewrite `conversations.tsx` to read from the persisted store, supplemented by a
  background drain on mount.
- Rewrite `chat/[peer].tsx` to read history from the persisted store on mount, then layer
  realtime subscription on top.
- Panic wipe deletes `conversations.json` along with everything else.

## Out of scope (what's NOT in)

- Search across history (separate Phase 4+ ticket once persistence is in)
- Multi-device sync (intentionally hard / probably never)
- Export-to-paper for archival (later, with explicit threat-model entry)

## Files likely to change

- `lib/local_store.ts` (extend; from T-002)
- `lib/envelope.ts` (callback that hands plaintexts to a persistence layer)
- `lib/conversations.tsx` (new — hook + store wrappers)
- `app/(tabs)/conversations.tsx`
- `app/chat/[peer].tsx`
- `lib/vault.ts` (`panicWipe` clears `stingray.conversations.v1`)
- `docs/api_contracts.md` (add to the on-device storage table)
- `docs/invariants.md` (cross-link I11 / I12 enforcement)

## Acceptance criteria

- [ ] A message received while the chat screen is open is persisted; closing and reopening
      the app shows it again.
- [ ] A message received while the app is backgrounded is persisted on next foreground drain.
- [ ] Bit-flipped relay ciphertext addressed to this user is dropped (no persistence, no
      log). [INVARIANT I12](../invariants.md).
- [ ] Panic wipe removes the conversations store.
- [ ] Storage is bounded — the last-500 cap is enforced; older messages are evicted
      first-in-first-out.
- [ ] `typecheck` passes; no `console.log` of plaintext bodies, aliases, or pubkeys beyond
      the first 8 chars.

## Risk / threat-model implication

NARROWS [§5](../threat_model.md): forensic attacker now needs the vault key (passphrase) to
read history, just as for the contacts store.

WIDENS one residual risk: more plaintext lives on disk (encrypted) than before. The cap
mitigates indefinitely-growing exposure. A future "auto-burn old messages" toggle in Settings
would further reduce this and is a candidate follow-up ticket.

## Handover checklist

### `scoping → ready` (Supervisor)
- [ ] Decide on the cap value (default proposal: 500 per conversation)
- [ ] Decide whether dedupe key is `id` (sender-set) or `(sender_pubkey, id, sent_at)` tuple
- [ ] T-002 must be `staging` or `done` before this moves to `ready`

### `ready → coding` (Coder)
- [x] Ticket re-read cold
- [x] [INVARIANT I11](../invariants.md), [I12](../invariants.md), [B7.1](../forbidden_patterns.md), [B7.2](../forbidden_patterns.md) read
- [x] Branch `T-005-persist-conversations` (conceptual — repo not yet git-init'd; alpha batch)

### `coding → review` (Coder)
- [~] `npm run typecheck` passes — NOT run from this environment (metered-data rule); code is syntactically clean TS
- [ ] Manual test: send + receive + kill + relaunch → history present — REQUIRES DEVICE RUN
- [ ] Manual test: corrupt one envelope on the relay (manually update via SQL) →
      recipient drops silently, no plaintext placeholder in the conversation — REQUIRES DEVICE RUN + relay SQL access
- [ ] Manual test: panic wipe → conversation store gone — REQUIRES DEVICE RUN
- [x] PR description names T-005 and links T-002 (see batch return-handover at docs/handover_archive/2026-06-02-coder-return-T003-T005-batch.md)

### `review → staging` (Reviewer)
- [x] No plaintext written outside the encrypted local store — all writes go through `localStore.set` (secretbox) under the vault key
- [x] Ack-delete still happens BEFORE returning to the UI thread — `drainInbox` acks each envelope inside the loop, before the function returns `out`
- [x] No `console.log` near `openEnvelope` / persistence layer — grep clean
- [~] Cap is real and tested — `MAX_PER_PEER = 500` FIFO enforced in `appendMessage`; cap test coverage in `conversations.test.ts` to be confirmed by Ops typecheck/run

### Diagnostics Stage-4 verdict (2026-06-02) — ❌ BLOCKED, regress to `coding`
The headline "persist-before-ack with id-dedupe makes a crash safe (I11 STRENGTHENED)"
is NOT achieved as implemented. The persist is not durable before the ack fires:

  - `app/chat/[peer].tsx` (drain wiring) `onPersist` does `await appendMessage(...)`.
  - `lib/conversations.tsx appendMessage` is `async` but schedules the disk write as a
    FIRE-AND-FORGET `void localStore.set(...)` INSIDE a `setConversations` updater.
    Its returned promise resolves as soon as `setConversations` is *called* — NOT when
    the write lands.
  - `lib/envelope.ts drainInbox` therefore proceeds from `await onPersist(pt)` to
    `await ackEnvelope(e.id)` while the write may still be in flight.
  - A crash between ack-delete and the write flush = PERMANENT message loss. The relay
    row is gone, so the id-dedupe/redeliver safety can never trigger. This is the exact
    data-loss class the reorder claimed to close — the window is smaller, not closed.

ROOT CAUSE: side-effect (disk write) performed inside a React state-updater, which (a)
cannot be awaited by the caller and (b) double-fires under StrictMode.

REQUIRED FIX (Coder): make `appendMessage` durably await the write before resolving —
compute `next` from current state (ref or functional read), `await localStore.set(...)`,
THEN `setConversations(next)`, and return that awaited promise. Only then does
`await onPersist` in `drainInbox` guarantee durability before ack. Add a test that
asserts the persisted blob contains the message id BEFORE ack is allowed to run (or at
minimum that `appendMessage`'s promise does not resolve until the store reflects the id).

NOT BLOCKING but fix while here: the outgoing-send and subscribeInbox paths use
fire-and-forget `void appendMessage(...)` — acceptable there (no ack coupling), but they
inherit the same impure-updater smell; the durability fix above resolves all three.

T-003 in the same batch is logic-clean but SHARE-COUPLED to `chat/[peer].tsx`; it is held
at `review` and must be re-reviewed together with this fix, not promoted independently.

### `staging → prod` (Ops)
- [ ] Two-device chat over staging relay; restart both; confirm history persists on both
- [ ] Verify on iOS and Android — secure-store has different size limits per platform

### `prod → done` (Supervisor)
- [ ] 24h clean monitoring
- [ ] No user-reported message loss
