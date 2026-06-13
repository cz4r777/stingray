---
date: 2026-06-02
type: handover
role: Coder
event: batch_return
batch: T-003 + T-005 (alpha)
issuer: Claude (Coder)
issued_to: Reviewer + Diagnostics + Supervisor
sprint_state: T-001 review findings open (separate, tracked as T-001a); T-002 review (separate); T-003 + T-005 ready-for-review (this batch); T-004 + T-006 scoping
references:
  - ../tickets/T-003-sas-verification-ux.md
  - ../tickets/T-005-persist-conversations.md
  - ../coder_batch_mode.md
  - ../api_contracts.md
  - ../invariants.md
  - ../roles.md
---

# Coder batch return-handover — T-003 + T-005 (2026-06-02)

Alpha-batch implementation reports back. Ticket boundaries kept visible; both
state-flipped to `coding` mid-batch; both ticked through `coding → review`
gates with device-run items marked `[ ]` (Ops responsibility).

```
╔══════════════════════════════════════════════════════════════════════════════════════╗
║  CODER BATCH RETURN — T-003 + T-005  Trust UX + Encrypted Conversation History       ║
║  Repo root  :  C:\Users\z\Desktop\code\stingray                                      ║
║  Branches   :  T-003-sas-verification-ux, T-005-persist-conversations (conceptual)   ║
║  Mode       :  Alpha batch — Supervisor → Coder → Diagnostics                        ║
║  Coder      :  Claude                                                                ║
╠══════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                      ║
║  TICKET-BY-TICKET RESULTS                                                            ║
║                                                                                      ║
║    T-003 — SAS verification UX  ──────────────────────────────────────  COMPLETE     ║
║      Files changed (6):                                                              ║
║        lib/contacts.tsx               markVerified / markMismatched +                ║
║                                       mismatched-immovable data guard +              ║
║                                       sasFor() + refuseMediaSend() helpers           ║
║        app/(tabs)/contacts.tsx        explicit "I verified the same 7 digits"        ║
║                                       Modal as the ONLY path to verified;            ║
║                                       Mark mismatched action with destructive        ║
║                                       confirm; status dots per contact               ║
║        app/(tabs)/conversations.tsx   trust-state dot per row; accessibility         ║
║                                       label per state; sasDotColor +                 ║
║                                       sasAccessibilityLabel exports                  ║
║        app/chat/[peer].tsx            Stack.Screen header coloured-dot title;        ║
║                                       trust banner (yellow/red) under header for     ║
║                                       unverified/mismatched; "+" attach button       ║
║                                       wired to refuseMediaSend()                     ║
║        docs/api_contracts.md          sas_state enum note + T-003 confirm-modal      ║
║                                       rule on the stingray.contacts.v1 row           ║
║        docs/tickets/T-003-*.md        state → coding; ready→coding ticked            ║
║                                                                                      ║
║      Acceptance status:                                                              ║
║        ✓ (code) verified state only via explicit modal                               ║
║        ✓ (code) trust state visible on contacts list, conversations list,           ║
║                 chat header, chat trust banner                                       ║
║        ✓ (code) mismatched is immovable (data layer + UI)                            ║
║        ✓ (code) refuseMediaSend gate exists and is wired                             ║
║        ⏸ device-run gates (typecheck + 4 manual flows) deferred to Ops               ║
║                                                                                      ║
║    T-005 — Persist conversations  ───────────────────────────────────  COMPLETE     ║
║      Files changed (8):                                                              ║
║        lib/local_store.ts             STORE_KEYS.CONVERSATIONS added; grep           ║
║                                       marker comment about panicWipe coupling        ║
║        lib/vault.ts                   panicWipe() clears STORE_KEYS.CONVERSATIONS;   ║
║                                       grep marker comment for future T-NNN STORE_KEYS║
║                                       entries                                        ║
║        lib/conversations.tsx (NEW)    ConversationsProvider + useConversations()     ║
║                                       hook; appendMessage with id-based dedupe;      ║
║                                       MAX_PER_PEER=500 FIFO cap; rollupFromHistory   ║
║                                       helper                                         ║
║        lib/envelope.ts                drainInbox accepts optional onPersist          ║
║                                       callback; fires AFTER successful decrypt +     ║
║                                       BEFORE ack-delete (fixes latent data-loss      ║
║                                       order bug from earlier v0); persistence        ║
║                                       failure → skip ack so envelope is              ║
║                                       redeliverable next drain                        ║
║        app/_layout.tsx                ConversationsProvider wraps Gate (inside       ║
║                                       ContactsProvider, inside IdentityProvider)     ║
║        app/(tabs)/conversations.tsx   reads roll-up from persisted history;          ║
║                                       background drain persists via onPersist        ║
║                                       callback; useMemo on roll-up for stability     ║
║        app/chat/[peer].tsx            history sourced from getHistory(peer);         ║
║                                       drainInbox + subscribeInbox both call          ║
║                                       appendMessage; outgoing messages persisted     ║
║                                       locally on send                                ║
║        docs/api_contracts.md          stingray.conversations.v1 row added            ║
║        docs/tickets/T-005-*.md        state → coding; ready→coding ticked            ║
║                                                                                      ║
║      Plus a new test:                                                                ║
║        lib/__tests__/conversations.test.ts (NEW)                                     ║
║          import-time self-test gated behind STINGRAY_RUN_CONVERSATIONS_TESTS=1;      ║
║          round-trip + dedupe + FIFO cap + rollup ordering. Backs up + restores       ║
║          any pre-existing value so a dev with a live vault is never clobbered.       ║
║                                                                                      ║
║      Acceptance status:                                                              ║
║        ✓ (code) inbound + outbound messages persist; history survives restart        ║
║                 via ConversationsProvider hydration on unlock                        ║
║        ✓ (code) bit-flipped envelope: decrypt returns null → onPersist never        ║
║                 fires → ack-delete never fires → INVARIANT I12 preserved             ║
║                 (no plaintext placeholder, no log)                                   ║
║        ✓ (code) panic wipe clears stingray.conversations.v1 alongside contacts       ║
║                 + vault salts/blobs                                                   ║
║        ✓ (code) per-peer cap MAX_PER_PEER=500 with FIFO eviction                     ║
║        ⏸ device-run gates (typecheck + 3 manual flows) deferred to Ops               ║
║                                                                                      ║
║  ORDER-OF-OPERATIONS FIX (subtle, flag for Reviewer)                                 ║
║    Earlier drainInbox did:  decrypt → ack-delete → push                              ║
║    New drainInbox does:     decrypt → onPersist → ack-delete → push                  ║
║    Why it matters: a crash between ack and persist in the OLD order was DATA LOSS.   ║
║    The NEW order plus id-based dedupe in ConversationsProvider.appendMessage         ║
║    makes a crash safe: the envelope remains on the relay until next drain, where     ║
║    we re-receive it, see the duplicate id, and no-op. INVARIANT I11 preserved.       ║
║                                                                                      ║
║  INVARIANT IMPACT (both tickets)                                                     ║
║    T-003                                                                             ║
║      I9   STRENGTHENED at the data layer: mismatched is immovable in code,           ║
║           not just UX. updateSasState + markVerified both refuse to write            ║
║           when current state is 'mismatched'.                                        ║
║      B5.2 enforced: addContact defaults to 'unverified'; only the explicit           ║
║           "I verified" modal path reaches 'verified'. There is no other UI path.     ║
║                                                                                      ║
║    T-005                                                                             ║
║      I7   relied on (not weakened). conversations.v1 blob sits under the same        ║
║           vault-key seal as contacts.v1 and the vault payload itself.                ║
║      I11  STRENGTHENED. drainInbox now persists BEFORE ack-delete; dedupe at         ║
║           the persistence layer makes the contract crash-safe.                       ║
║      I12  relied on (not weakened). decrypt failure short-circuits before            ║
║           onPersist runs; persistence layer never sees a failed envelope.            ║
║      I13  relied on (not weakened). Conversation bodies stay local-only.             ║
║      I10  relied on. panicWipe extended to clear conversations alongside             ║
║           contacts + vault.                                                          ║
║                                                                                      ║
║    No invariant added or weakened. No threat_model section narrowed (T-003           ║
║    narrows §3 active-MITM by closing the false-trust surface; T-005 narrows §5       ║
║    forensic by keeping history under the vault seal). No forbidden_patterns §A       ║
║    entries (feature work, not incident).                                             ║
║                                                                                      ║
║  REVIEWER PRE-FLIGHT (pipeline.md §Stage 4 a–k against both tickets together)        ║
║    a. Diff size — 14 files total; large but every change is on the path the         ║
║       two tickets describe. No drive-by refactors.                                  ║
║    b. service_role — none added; grep clean.                                        ║
║    c. envelopes schema columns — unchanged.                                         ║
║    d. fetch() outside lib/relay.ts — none added.                                    ║
║    e. cached ephemeral keypair / plaintext private key — none.                      ║
║    f. console.log near crypto — none. Test files have console.log/error/warn       ║
║       for PASS/FAIL/SKIPPED surfaces; no secret material.                            ║
║    g. telemetry / crash SDK — none introduced.                                      ║
║    h. Android secure-shell overclaim — n/a.                                         ║
║    i. Threat-model implication — declared per ticket in this handover.              ║
║    j. Docs updated — api_contracts.md updated in same logical commit (both         ║
║       rows). invariants.md NOT modified (both tickets only rely on / strengthen     ║
║       existing wording; no rule change needed).                                     ║
║    k. Test coverage — local_store + conversations + crypto suites; gated behind     ║
║       env vars to avoid clobbering live vaults; backup+restore on every run.        ║
║                                                                                      ║
║  GREP TARGETS FOR REVIEWER (paste these — all should return nothing meaningful)      ║
║    grep -r 'service_role\|SERVICE_ROLE' app lib                                      ║
║    grep -r 'console\.log.*\(body\|alias\|sas_state\)' lib app                        ║
║    grep -rn 'fetch(\|supabase\.from(' app lib | grep -v 'lib/relay\.ts'              ║
║    grep -rn 'STORE_KEYS\.' lib                                                       ║
║      → should show CONTACTS + CONVERSATIONS, both in panicWipe()                    ║
║                                                                                      ║
║  WHAT COULD NOT BE VERIFIED FROM THIS ENVIRONMENT                                    ║
║    1. npm install + npm run typecheck — not run (metered-data rule).               ║
║    2. T-003 4 manual flows (unverified yellow / verified green / mismatched red    ║
║       sticky / send-media refused) — REQUIRES DEVICE RUN.                            ║
║    3. T-005 3 manual flows (history survives restart / corrupted envelope drops    ║
║       silently / panic-wipe clears conversations) — REQUIRES DEVICE RUN + a relay   ║
║       SQL admin path for the corruption test.                                        ║
║    4. expo-secure-store per-entry size behaviour with a 500-message conversation    ║
║       at average ~80B body = ~80 KB blob — flagged in lib/conversations.tsx          ║
║       CAP RATIONALE comment. Ops should confirm both iOS and Android tolerate        ║
║       this; if Android KeyStore rejects, MAX_PER_PEER drops in a follow-up.         ║
║                                                                                      ║
║  RATIFICATION ASKS                                                                   ║
║    Reviewer:                                                                         ║
║      - Walk Stage 4 a–k against the combined 14-file diff.                          ║
║      - Run the four grep targets above; all should be negative.                     ║
║      - Approve OR send back to `coding`. Two tickets to flip on approval.            ║
║                                                                                      ║
║    Diagnostics:                                                                      ║
║      - Confirm the order-of-operations fix in lib/envelope.ts (persist-before-ack    ║
║        with id-dedupe) is a strengthening, not a regression.                         ║
║      - Spot-check sasFor()/refuseMediaSend() callers — no UI path bypasses them.    ║
║                                                                                      ║
║    Ops:                                                                              ║
║      - Run typecheck after npm install.                                              ║
║      - Run the 7 manual flows (4 for T-003, 3 for T-005) on iOS + Android preview.  ║
║      - Confirm secure-store inspector shows stingray.contacts.v1 AND                ║
║        stingray.conversations.v1 as opaque base64, never plaintext.                  ║
║                                                                                      ║
║    Supervisor:                                                                       ║
║      - No invariant change, no threat-model change. No ratification required.       ║
║      - On Ops smoke pass, close `prod → done` after 24h monitoring window per       ║
║        ticket (T-003 first, then T-005 since T-005 depends on T-003's substrate).   ║
║                                                                                      ║
║  STOP-CONDITION REPORT  (per coder_batch_mode.md §Stop conditions)                  ║
║    No hard stops hit. Two soft observations worth flagging:                         ║
║      1. T-002 was at `review` not `staging`/`done` when batch started.              ║
║         Supervisor explicitly authorized via alpha-batch handover. No issue          ║
║         materialised.                                                                ║
║      2. The pre-existing drainInbox order (ack-before-persist) was a latent          ║
║         data-loss bug. Fixed it inside T-005 scope rather than spawning a            ║
║         separate ticket — judged inside-scope because T-005 is the ticket that       ║
║         introduces local persistence and must be persist-before-ack to be            ║
║         correct. Flagged here for Reviewer awareness.                                ║
║                                                                                      ║
╚══════════════════════════════════════════════════════════════════════════════════════╝
```

## Receiving party response

*(Reviewer: walk Stage 4 a–k and run the four grep targets. Diagnostics:
confirm the persist-before-ack ordering fix. Ops: typecheck + 7 manual
flows on iOS + Android. Supervisor: close after 24h per-ticket monitoring.)*
