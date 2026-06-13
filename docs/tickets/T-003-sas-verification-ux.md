---
id: T-003
title: SAS verification UX — padlock states, confirm step, media refusal until verified
phase: 2
state: review
owner_supervisor: cz4r777
owner_coder: Claude (Coder)
created: 2026-05-17
updated: 2026-06-02
invariants_touched: [I9]
threat_model_section: §3 (hostile relay — active MITM at pubkey-exchange time)
batch: T-003 + T-005 (alpha)
---

# T-003 — SAS verification UX

## Why

A pasted pubkey can be a substituted pubkey if an active MITM controls the channel the user
received it on. The [INVARIANT I9](../invariants.md) defense is the 7-digit SAS code,
which both parties compare on an independent channel.

Today the SAS code is computed in [`app/(tabs)/contacts.tsx`](../../app/(tabs)/contacts.tsx)
but there is no explicit "I verified this" step, no persisted state, and no UX consequence
for being unverified. That is a "false trust" surface and violates the spirit of
[forbidden_patterns.md B5.2](../forbidden_patterns.md) ("'Trusted' badge before SAS").

## Scope (what's in)

- Add a confirm modal on Contact Add: shows the SAS code in 28-pt monospace; user must
  tap "I verified the same 7 digits with my peer" before the contact persists as `verified`.
- Without the confirm step, the contact persists with `sas_state: 'unverified'`. Default is
  `unverified` everywhere.
- Add a "Mark mismatched" action on existing contacts. Once mismatched, the state is
  immovable (the user must remove and re-add the contact to recover).
- Render padlock state in every place a peer appears:
  - Conversations list row (yellow / green / red dot adjacent to alias)
  - Chat screen header (icon + tooltip)
  - Contact list (icon + label)
- Refuse to render or send media attachments in conversations with an unverified or
  mismatched contact. (Attachments don't exist in v0; this ticket adds the gate so the
  later attachments feature inherits it.)
- Surface the verification state on the Settings screen if the current chat partner is in
  view (deferred — only needs the cross-link if Settings ends up showing per-chat info).
- Update [api_contracts.md](../api_contracts.md) to note that `sas_state` is persisted in
  the `stingray.contacts.v1` store (from T-002).

## Out of scope (what's NOT in)

- QR-based pubkey exchange UI (separate ticket — improves the SAS workflow but is a
  Phase 2 follow-up)
- Multi-key per contact (revocation, key rotation — Phase 4+)
- Signed pubkey introductions ("Bob says here's Alice's key") — future, after the 1:1
  primitive is rock-solid

## Files likely to change

- `app/(tabs)/contacts.tsx`
- `app/(tabs)/conversations.tsx`
- `app/chat/[peer].tsx`
- `lib/contacts.tsx` (from T-002; add `markVerified`, `markMismatched`)
- `lib/types.ts` (no change expected; `Contact.sas_state` already covers it)
- `docs/api_contracts.md`
- `docs/invariants.md` (refine I9 with a UX clause)

## Acceptance criteria

- [ ] A new contact CANNOT be added with `sas_state: 'verified'` without the explicit
      confirm step. (Code-level: the "Save" path defaults to `unverified` and only the
      modal's "I verified" button promotes.)
- [ ] Every screen that names a peer shows the verification state with the correct color
      and an accessible label.
- [ ] Mismatched contacts are immovable from that state — re-adding requires deletion.
- [ ] Send-media gate is in place even though media is not yet implemented (returns a
      deliberate refusal alert when called against an unverified peer).
- [ ] `typecheck` passes; manual test on web + Android verifies the modal flow.

## Risk / threat-model implication

NARROWS the [§3 hostile relay](../threat_model.md) threat at the pubkey-exchange moment.
The SAS code is the user's only defense against a substituted key; making verification
costly-to-skip and visible-once-done is the entire point.

The mismatch state is intentionally non-recoverable — a recoverable mismatch is a social-
engineering vector ("oh I made a mistake, undo it").

## Handover checklist

### `scoping → ready` (Supervisor)
- [ ] All required front-matter fields set
- [ ] Acceptance criteria testable
- [ ] Wireframe / sketch of the modal attached (optional but recommended)
- [ ] Cross-link from [forbidden_patterns.md B5.2](../forbidden_patterns.md) verified

### `ready → coding` (Coder)
- [x] Ticket re-read cold
- [x] [INVARIANT I9](../invariants.md) and [B5.2](../forbidden_patterns.md) read
- [~] T-002 (`local_store`) is `done` or `staging` (this ticket depends on it) — T-002 sits at `review`; Supervisor explicitly authorized alpha-batch execution on top of in-tree T-002 substrate
- [x] Branch `T-003-sas-verification-ux` (conceptual — repo not yet git-init'd)

### `coding → review` (Coder)
- [~] `npm run typecheck` passes — NOT run from this environment (metered-data rule); code is syntactically clean TS
- [ ] Manual test: add unverified → padlock yellow everywhere — REQUIRES DEVICE RUN
- [ ] Manual test: add verified → padlock green everywhere — REQUIRES DEVICE RUN
- [ ] Manual test: mark mismatched → padlock red and immovable — REQUIRES DEVICE RUN
- [ ] Manual test: attempt-send-media against unverified → refused alert — REQUIRES DEVICE RUN
- [x] PR description names T-003 (see batch return-handover at docs/handover_archive/2026-06-02-coder-return-T003-T005-batch.md)

### `review → staging` (Reviewer)
- [x] No place in the UI defaults to "verified" badge — `statusLabel`/`trustHeaderStyle`/`sasFor` all fall through to `unverified`
- [x] No accidental coupling of "knows the pubkey" to "verified" — `addContact` hardcodes `unverified`; `verified` is reachable only via `markVerified` (modal-gated)
- [x] Mismatch state cannot be cleared except by deletion — `updateSasState` early-returns on `mismatched`; `markMismatched` is the only writer into it

### Diagnostics Stage-4 verdict (2026-06-02) — APPROVED (code-clean), HELD at `review`
T-003 logic is sound. I9 mismatched-immovable is enforced at the data layer
(`lib/contacts.tsx updateSasState`/`markMismatched`), `verified` is reachable only
through `markVerified`, media-refusal gate (`refuseMediaSend`) and trust banners are
wired in `app/chat/[peer].tsx`. Stage-4 a–k clean; greps clean.

NOT advanced to `staging` for TWO reasons:
1. `npm run typecheck` never run (Ops gate) + 4 device flows pending (yellow / green /
   red-sticky / media-refused).
2. SHARED-FILE COUPLING with T-005: this batch delivered `lib/contacts.tsx`,
   `app/(tabs)/conversations.tsx`, and `app/chat/[peer].tsx` touching BOTH tickets.
   T-005 is BLOCKED (see its file) for a data-loss defect in `chat/[peer].tsx`'s
   drain wiring. The fix re-touches `chat/[peer].tsx`, so T-003 MUST NOT be promoted
   independently — re-review the shared files together once the T-005 fix lands.

### `staging → prod` (Ops)
- [ ] Cross-device smoke: two real devices, exchange pubkeys, complete SAS, confirm
      green padlock on both sides

### `prod → done` (Supervisor)
- [ ] 24h clean monitoring
