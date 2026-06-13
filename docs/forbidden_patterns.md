# Forbidden Patterns

> **How to use this doc:** before writing or accepting code that touches crypto, transport, vault, or relay, check this list. If your change resembles any pattern below, you are about to recreate a real bug — either from this project's incident log (Section A, currently empty) or from the broader privacy-tool failure catalog (Section B). Each entry has the pattern, why it's wrong, and the guard.

---

# Section A — Production Incidents

*Empty in v0 — we haven't shipped yet. As real incidents (and near-misses) happen, they go here using the template below.*

## Deadline

**Within 24h of detection.** Ops triages and rolls back first ([deployment.md §Rollback](deployment.md)); the §A entry is the durable record that follows. Missing the 24h deadline is itself a process incident — log it as one.

## What qualifies for §A

- **Production incident** — anything that reached users in a degraded state.
- **Near miss** — caught before users were affected but only by luck or by a check that almost wasn't there. Includes invariant weakenings that slipped past review.
- **External report** — a vulnerability or correctness issue reported by an outside party.

Do NOT log: routine bugs caught in dev, ordinary test failures, design discussions that didn't ship. Those belong in tickets, not the forensic record.

## Template

```markdown
## A<N>. <short imperative title; e.g. "Cellular leak via VPN auto-allow">

| Field                  | Value                                                                                     |
|------------------------|-------------------------------------------------------------------------------------------|
| **id**                 | A<N>                                                                                      |
| **severity**           | P0 (user data exposed)  /  P1 (defense weakened)  /  P2 (near miss / process)             |
| **detected**           | YYYY-MM-DD HH:MM by <Ops monitor / user report / Diagnostics audit / external researcher> |
| **mitigated**          | YYYY-MM-DD HH:MM by <commit hash / config change / rollback>                              |
| **time-to-detect**     | <duration from cause-introduced to detected>                                              |
| **time-to-mitigate**   | <duration from detected to mitigated>                                                     |
| **affected releases**  | <build ids / git refs that shipped the bug>                                               |
| **affected users**     | <count, or "none — near miss">                                                            |
| **related invariant**  | I<N>, or "none — gap exposed"                                                             |
| **related §B pattern** | B<N.N>, or "none — net-new"                                                               |

### Symptom
What users / ops / monitors actually observed. No interpretation; just what was seen.

### Cause (root, not proximate)
The actual reason. Five-whys discipline. The "we forgot to..." is the proximate cause —
keep going until you reach the *system gap* that allowed forgetting.

### Fix
- Commit: <hash> — <one-line summary>
- Reverts: <hash> if any
- Schema/config changes: <list>

### Prevention added
What now stops this from recurring. ONE of these must be true:
- **New invariant** I<N>: <name> — added to [invariants.md](invariants.md) in commit <hash>.
- **New §B entry** B<N.N>: <name> — added below in this file in commit <hash>.
- **Tightened §B entry** B<N.N>: <name> — wording strengthened in commit <hash>.
- **Pipeline change**: [pipeline.md §Stage 4](pipeline.md) checklist gained item <letter>.

If none of the above is true, the incident is NOT closed. A symptom patch without
a prevention is forbidden ([§B5.1 spirit](#b51-silent-fallback-on-faraday-block)).

### Forbidden (the durable lesson)
One sentence stating the specific pattern that must never recur. This is what future
Reviewers grep for. Write it as a rule, not a story.

### Cross-references
- Ticket(s): T-<NNN>, T-<NNN>
- Affected docs (updated in same commit as the fix): [<doc>](<doc>.md), ...
- External CVE / advisory: <id>, if applicable
- Ratification entry (if discovered during Supervisor-return audit): [handover_archive/YYYY-MM-DD-ratification-*.md](handover_archive/)
```

## Authoring rules

1. **Append-only.** Once written, an §A entry is forensic. Corrections go in a follow-up entry that names the one it supersedes; the original stays.
2. **Anonymise users.** No email, no IP, no display name. "User A" and "User B" if relationships matter.
3. **Plaintext never appears.** Not in the Symptom, not in the Fix narrative, not in the Cross-references. If the incident involved a leaked message, summarise the leak ("a chat body was exposed in a log sink"); never quote it.
4. **The Forbidden line is the part that matters.** Everything else is context for that sentence. Make it grep-able and unambiguous.
5. **§A entries cross-link to §B.** Net-new patterns spawn a new B entry below; the §A entry cites it. Existing patterns that strengthened spawn a doc commit; the §A entry cites the line.

---

# Section B — Architectural Anti-Patterns

These are general crypto-app and Supabase-as-relay mistakes, ranked by category. Each is enforced by code, schema, or review.

## B1. Relay Surface Area

### B1.1. Adding a sender column to `envelopes`
- **Symptom:** the relay can now correlate sender↔recipient↔timing — the exact metadata the design refuses to hold.
- **Why it happens:** "we'd like to dedupe", "we'd like to rate-limit per sender", "we'd like to support reports".
- **Forbidden:** any schema change to `envelopes` that adds an addressing field beyond `recipient_pubkey`. See [INVARIANT I3](invariants.md). Dedup belongs on the recipient side; rate-limiting can be IP-based at the relay layer without storing per-sender identity.

### B1.2. Adding a "user accounts" table to the relay
- **Symptom:** the relay now has authenticated identities; the privacy boundary degrades from "encryption" to "encryption plus we promise to keep the user table secret".
- **Why it happens:** following a Supabase tutorial that assumes `auth.users` is the source of identity.
- **Forbidden:** any addition of `auth.users`-derived identity to the relay. See [INVARIANT I4](invariants.md). Identity is a public key.

### B1.3. Storing read receipts or delivery state
- **Symptom:** the relay knows "Alice opened the envelope at 14:32" — leaks Alice's online activity even when content is opaque.
- **Why it happens:** product instinct to "make the chat feel responsive".
- **Forbidden:** any column or function that records per-envelope state beyond what's needed for ack-delete + 30-day expiry. The two existing relay operations (insert, delete-after-decrypt) are enough.

### B1.4. Logging ciphertext or addressing values to a server-side log sink
- **Symptom:** the relay's hosted log (Supabase logs / Sentry / etc.) contains ciphertext and recipient pubkeys. A breach of the log sink leaks the same metadata the relay schema is designed to omit.
- **Why it happens:** default tracing in a Postgres function or an Edge Function logs the full row.
- **Forbidden:** any RPC, function, or Edge Function on the relay that logs the row beyond `id` and `created_at`. Aggregates only.

### B1.5. Treating relay RLS as the security boundary
- **Symptom:** developer adds a complex RLS policy "to make the relay secure" — and a bug in the policy is now the entire security story.
- **Why it happens:** Supabase-as-backend pattern assumes RLS is the boundary.
- **Forbidden:** any code or doc that frames RLS as the privacy boundary on this product. The cryptographic envelope IS the boundary; RLS on `envelopes` is intentionally permissive ([INVARIANT I4](invariants.md)) and may not be tightened in a way that gives developers false confidence.

## B2. Transport And The Faraday Gate

### B2.1. Bypassing `assertFaraday()` in a "fast path"
- **Symptom:** a new code path issues a network call directly via `fetch()` or `supabase.from(...)` without the gate. Cellular leak.
- **Why it happens:** "the rest of the app handles it" / "this is just a one-off".
- **Forbidden:** any network call outside `lib/relay.ts` (which gates) or any call inside `lib/relay.ts` that does not begin with `assertFaraday()`. See [INVARIANT I1](invariants.md).

### B2.2. Treating VPN as automatically safe
- **Symptom:** the gate is loosened to allow VPN, the user's VPN happens to be over cellular, traffic still rides the cell radio (encrypted but observable in physical-layer ways the carrier and a stingray care about).
- **Why it happens:** "the user has a VPN, surely they know what they're doing".
- **Forbidden:** auto-allowing VPN. The current gate refuses VPN by default; per-session override is the only path, and it must be in-memory only (no persistence). See [INVARIANT I2](invariants.md).

### B2.3. Persisting the VPN override across app restart
- **Symptom:** the override survives a reboot; the user forgets they enabled it; later cellular leak.
- **Forbidden:** writing the VPN override to `AsyncStorage`, `expo-secure-store`, or any file. Override is a React state variable, scoped to the session.

### B2.4. Silent retry on Faraday block
- **Symptom:** a network call is refused, a background timer retries it, and on the retry the transport has changed to allowed — but the user never saw the refusal and has no idea what was sent when.
- **Forbidden:** automatic retries after a Faraday block. The user must initiate the retry. The gate is a UX surface, not a transient error.

## B3. Vault And Key Custody

### B3.1. Storing private keys outside the encrypted vault
- **Symptom:** a "convenience" cache writes `box_sk` to `AsyncStorage` plaintext.
- **Why it happens:** debugging; "performance".
- **Forbidden:** any persistent write of `box_sk`, `sign_sk`, or any seed material outside the secretbox-encrypted vault blob. See [INVARIANT I7](invariants.md).

### B3.2. Default-trusting a contact before SAS verification
- **Symptom:** a contact is added and immediately shown with a green padlock; an active-MITM-substituted key is treated as authentic.
- **Why it happens:** "we'll add SAS later".
- **Forbidden:** any contact-add path that records `sas_state = 'verified'` without an explicit user-driven verification step. See [INVARIANT I9](invariants.md).

### B3.3. Reusing the vault salt across vaults
- **Symptom:** an attacker who captures the blob from two devices with the same passphrase can compare derived keys — and a duplicate salt collapses the work factor.
- **Forbidden:** any code that derives the salt from a deterministic source (timestamp, user input, pubkey). The salt is `nacl.randomBytes(16)` and only that.

### B3.4. Weak KDF iteration count
- **Symptom:** the placeholder hash chain in `lib/crypto.ts deriveVaultKey` is lowered "for speed". Offline brute-force of weak passphrases becomes tractable.
- **Forbidden:** lowering the iteration count below 200_000 on the v0 placeholder. Phase 1 replaces this with `crypto_pwhash` and an explicit work-factor parameter; that parameter is not to be lowered without a threat-model review.

### B3.5. Partial panic wipe
- **Symptom:** wipe deletes the blob but leaves the salt. A later attacker who captures the blob from a backup AND reads the salt from this device can attempt offline attack with full information.
- **Forbidden:** any code path that removes one of {salt, blob} without removing the other. See [INVARIANT I10](invariants.md).

## B4. Metadata Leakage

### B4.1. Reusing the ephemeral sender keypair
- **Symptom:** the relay sees the same ephemeral pubkey on multiple envelopes from the same sender — links them into a session.
- **Why it happens:** "performance optimisation".
- **Forbidden:** caching `nacl.box.keyPair()` results in `sealEnvelope`. See [INVARIANT I6](invariants.md).

### B4.2. Skipping length padding for "short" messages
- **Symptom:** "hello" goes on the wire as a smaller ciphertext than a paragraph; the relay can distinguish.
- **Forbidden:** any code path that calls `sendEnvelope()` with un-padded ciphertext. Padding is inside `sealEnvelope`; do not bypass it.

### B4.3. Read receipts / typing indicators / presence
- **Symptom:** the relay or any party between learns the user's reading habits.
- **Forbidden:** any feature that exchanges per-message side-channel state with the recipient via the relay. If "Alice is typing" is needed, it has to ride the live P2P data channel (Phase 3), never the relay.

### B4.4. Aliases on the wire
- **Symptom:** the user's local alias for a contact ends up inside an envelope or in a relay column.
- **Forbidden:** including the local alias in any field that crosses the device boundary. See [INVARIANT I13](invariants.md). The plaintext inside an envelope is the only legitimate place, and even there it should not be necessary.

## B5. UX Failures That Are Security Failures

### B5.1. Silent fallback on Faraday block
- **Symptom:** the send button still works, the message disappears from the UI, but no envelope was actually delivered. Worse: the message is queued for retry over cellular when the user "switches networks" (which they may not realise they have done).
- **Forbidden:** any composer or send path that does not visibly disable itself when the gate is blocked, and that does not refuse outright when the user taps anyway.

### B5.2. "Trusted" badge before SAS
- **Symptom:** UI shows a green padlock based on whether the pubkey is well-formed instead of whether the human compared the SAS code.
- **Forbidden:** any visual that conflates "we have a pubkey" with "we have verified the pubkey".

### B5.3. Unlock-once-then-stay-unlocked-forever
- **Symptom:** the vault stays unlocked across app suspensions for "user convenience". A device picked up minutes later by a third party is fully readable.
- **Forbidden:** keeping the unlocked secret in `IdentityProvider` past suspend. Phase 1 adds auto-lock; for v0, the user manually locks via Settings.

## B6. Build / Release

### B6.1. Shipping the service-role key
- **Symptom:** entire relay schema mutable by anyone who reverse-engineers the bundle.
- **Forbidden:** any reference to `service_role` or `SERVICE_ROLE` under `app/`, `lib/`, or `components/`. Anon key only. See [INVARIANT I14](invariants.md).

### B6.2. Telemetry that calls home
- **Symptom:** a "harmless" analytics SDK phones home with anonymised IDs that can be correlated with the user's relay pubkey.
- **Forbidden:** any analytics, crash-reporting, or telemetry SDK that initiates an outbound network request without explicit user-initiated opt-in. The Phase 8 crash-log feature is local-only and user-exported.

### B6.3. Hardcoding the relay URL into the bundle
- **Symptom:** the user wants to self-host; they cannot, because the URL is compiled in.
- **Forbidden:** referencing a literal relay URL in `lib/relay.ts`. The URL must come from `EXPO_PUBLIC_RELAY_URL` so users can override per-build.

### B6.4. Forgetting to flip `EXPO_PUBLIC_FARADAY_MODE` back to `true` after QA
- **Symptom:** a release ships with the gate disabled.
- **Forbidden:** any build profile that sets `EXPO_PUBLIC_FARADAY_MODE=false`. EAS preview / production profiles MUST default to true. QA happens locally on a dev build, not in a distributed binary.

## B7. State Persistence

### B7.1. Caching plaintext in AsyncStorage
- **Symptom:** the conversation list survives an uninstall via AsyncStorage's auto-restore; an attacker who installs over a wiped device sees old conversations.
- **Forbidden:** writing plaintext message bodies to AsyncStorage (or any unencrypted local storage). Plaintext lives in memory and inside the vault-encrypted local store ONLY.

### B7.2. Logging on decrypt failure
- **Symptom:** a console.log with the failed-decrypt ciphertext ends up in the device's system log, then in a crash report.
- **Forbidden:** any logging at all on `openEnvelope` returning `null`. See [INVARIANT I12](invariants.md).

---

# Section C — Deploy-time Anti-Patterns

These are mistakes that don't happen until you ship. Each maps to a stage in [deployment.md](deployment.md).

## C1. Skipping the staging deploy
- **Forbidden:** any prod deploy that did not first pass through the staging relay + staging EAS channel.

## C2. Mismatched OTA vs binary
- **Forbidden:** any `eas update` that introduces a new native dependency or changes `app.json` plugins. Native changes require `eas build` + a fresh binary.

## C3. Schema-before-client (or client-before-schema) without compatibility window
- **Forbidden:** any deploy sequence where the live client and live relay schema are incompatible. The relay's schema is minimal so this rarely bites, but a new `bucket` size (say `65536`) requires the client change to ship FIRST so old clients keep parsing what they understand.

## C4. Committing real secrets into `eas.json` or `app.json`
- **Forbidden:** committing the relay URL or anon key in literal form. Always use EAS secrets resolved at build time.

## C5. App Store privacy questionnaire that overclaims privacy
- **Symptom:** Apple's privacy nutrition label says "no data collected"; in reality the relay logs IP addresses.
- **Forbidden:** declaring less data collection than the app + relay actually does. Even a privacy-tool product can be rejected for misrepresentation; honesty is also a marketing virtue here.

## C6. Pushing schema changes from a non-idempotent file
- **Forbidden:** committing changes to `supabase/schema.sql` that aren't idempotent. Re-run it locally as the last step before commit. See [INVARIANT I15](invariants.md).
