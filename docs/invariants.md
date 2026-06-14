# Invariants

Rules the code must NEVER violate. Each has the rule, the code/policy location enforcing it, the rationale, and how to apply it. Numbered for stable reference from other docs.

> **Reviewer rule:** any change that weakens or removes an invariant must be flagged explicitly in the PR description. Adding new invariants is fine; silently removing one is not.

---

## A. Transport — The Faraday Gate

### I1. No transmission on cellular
**Rule:** Every outbound network operation (send envelope, fetch inbox, subscribe to inbox, delete envelope) MUST first call `assertFaraday()`. If the verdict is `allowed = false`, the operation is refused and the user-visible reason is surfaced.

**Where:**
- [`lib/transport.ts`](../lib/transport.ts) — `evaluateFaraday()` and the polling subscription
- [`lib/relay.ts`](../lib/relay.ts) — `sendEnvelope`, `fetchInbox` (each calls `assertFaraday()` before touching the network)
- [`app/_layout.tsx`](../app/_layout.tsx) — the sticky Faraday banner
- [`app/chat/[peer].tsx`](../app/chat/[peer].tsx) — composer disabled when blocked

**Why:** A stingray (IMSI catcher) sits between the device's cell radio and the legitimate tower and observes every byte of cellular traffic regardless of application-layer encryption. Defeating the threat means not transmitting on that radio in the first place. See [threat_model.md §2](threat_model.md).

**How to apply:** Any new code path that initiates a network operation MUST go through `lib/relay.ts` (which gates) or call `assertFaraday()` directly. A direct `fetch()` call elsewhere is a review-blocking violation.

### I2. VPN over unknown underlying transport is refused
**Rule:** When `expo-network` reports `VPN`, the gate refuses by default. The user may issue a per-session override after manually attesting (and the override is forgotten on app suspend).

**Where:** [`lib/transport.ts`](../lib/transport.ts) — `evaluateFaraday()` branch for `vpn`.

**Why:** A VPN encrypts content end-to-end but does not change which radio carries it. A VPN running over LTE still rides the cell radio; the carrier sees endpoint metadata and a stingray sees the same physical-layer presence the carrier does. The user's protection comes from refusing the radio, not from encrypting on top of it.

**How to apply:** The override must be a session-bound flag in memory, never persisted. See [forbidden_patterns.md B2.2](forbidden_patterns.md).

---

## B. Relay — Metadata Boundary

### I3. The relay sees only opaque ciphertext + addressing
**Rule:** `public.envelopes` columns are limited to `recipient_pubkey`, `ciphertext`, `ephemeral_pubkey`, `bucket`, `created_at`. **No** sender, **no** subject, **no** thread, **no** read state.

**Where:** [`supabase/schema.sql`](../supabase/schema.sql) — `envelopes` table definition.

**Why:** Adding any of those fields would convert the relay from an opaque pipe into a metadata vacuum that a hostile relay operator can mine. The relay is assumed compromised by [threat_model.md §3](threat_model.md); the design has to be robust to that.

**How to apply:** Any schema PR that introduces a new column on `envelopes` is review-blocking unless it is a derivable function of the existing addressing fields. Adding a derived index on `recipient_pubkey` is fine; adding `sender_pubkey` is not.

### I4. No accounts, no auth on the relay
**Rule:** `envelopes` is writable by `anon`, readable by `anon`, deletable by `anon`. No row owner. No JWT requirement.

**Where:** [`supabase/schema.sql`](../supabase/schema.sql) — RLS policies `envelopes_insert_any`, `envelopes_read_by_key`, `envelopes_delete_by_key`.

**Why:** Account creation introduces a server-side identifier the relay can correlate with traffic patterns. We deliberately have none. The relay grants the same permissions to everyone because the privacy boundary is the encryption, not the database policy.

**How to apply:** Do not add `users` tables. Do not add login. Pubkey-as-identity is the contract.

### I5. Wire ciphertext is length-padded
**Rule:** Every envelope payload is padded to one of `BUCKETS = [256, 1024, 4096, 16384]` bytes BEFORE encryption. The `bucket` column is restricted to those four values.

**Where:**
- [`lib/crypto.ts`](../lib/crypto.ts) — `padToBucket()` and `unpad()`
- [`supabase/schema.sql`](../supabase/schema.sql) — `bucket in (256, 1024, 4096, 16384)`

**Why:** Without padding, a relay operator (or anyone watching the relay) can infer message length, distinguishing "yes" from a long paragraph. Bucketing collapses the distinguishable population.

**How to apply:** Never add a fifth bucket without considering the population-size cost. If you need to ship 100 KB messages, that is a separate feature (encrypted attachments — see [workflow.md Phase 7+](workflow.md)).

### I6. Each envelope uses a fresh ephemeral sender keypair
**Rule:** `sealEnvelope()` generates a brand-new X25519 keypair every call. The ephemeral pubkey goes on the wire; the ephemeral seckey is discarded after use.

**Where:** [`lib/crypto.ts`](../lib/crypto.ts) — `sealEnvelope()`.

**Why:** A fixed sender pubkey would let the relay link multiple messages from the same sender to the same recipient — exactly the social-graph metadata we are trying to deny.

**How to apply:** Do not cache ephemeral keypairs. Do not "optimize" by reusing one for a conversation; the marginal cost of generation is negligible and reuse is a metadata regression.

---

## C. Vault — Key Custody

### I7. Private keys never leave the device unencrypted
**Rule:** The X25519 secret, Ed25519 secret, and any future identity material are stored only inside the vault blob (secretbox-encrypted under the passphrase-derived key) or in memory after unlock.

**Where:**
- [`lib/vault.ts`](../lib/vault.ts) — `createVault`, `unlockVault`
- [`lib/identity.tsx`](../lib/identity.tsx) — the `unlocked` state is held in React context, not persisted

**Why:** If we let plaintext keys hit disk, an attacker with disk access (compromised device, cloud-sync of `expo-secure-store` artifacts) gets the user's identity.

**How to apply:** No new code path may write `box_sk` or `sign_sk` to a file, an export buffer, a clipboard, or a network request. Future "export to paper" features must be designed as user-initiated, plaintext-on-screen-only flows that never persist.

### I8. Vault KDF uses a unique random salt and a memory-hard cost
**Rule:** Each vault has a unique 16-byte random salt stored alongside the blob. The KDF MUST be a memory-hard password hash — specifically `libsodium.crypto_pwhash` with `ALG_ARGON2ID13` at the MODERATE profile or stronger. Parameters are persisted inside the vault blob so future parameter bumps do not lock out existing users.

**Where:**
- [`lib/crypto.ts`](../lib/crypto.ts) — `deriveVaultKey()`, `ARGON2ID_MODERATE` constant.
- [`lib/vault.ts`](../lib/vault.ts) — `createVault()` (generates the salt + selects params); `unlockVault()` (reads params from the blob).
- [`lib/__tests__/crypto.test.ts`](../lib/__tests__/crypto.test.ts) — import-time test vectors that fail loud on regression.

**Why:** A weak KDF makes the encrypted blob brute-forceable offline if an attacker captures it. PBKDF2 / hash-chain KDFs are cheap on GPUs and ASICs. Argon2id is memory-hard by construction, which imposes per-guess RAM cost the attacker cannot avoid even with custom silicon.

**How to apply:** Adding a new KDF (e.g. for hardware-token unlock in Phase 7) must extend, not replace, the Argon2id path. Lowering `opslimit` or `memlimit` below MODERATE requires an explicit Supervisor sign-off and a [threat_model.md §5](threat_model.md) residual-risk update.

**History:** v0 shipped a 200k-round BLAKE2b hash chain as a placeholder. T-001 (2026-05-21) replaced it with Argon2id via `react-native-libsodium`. The legacy KDF survives as `deriveVaultKeyV1Legacy()` purely so the `.v1 → .v2` vault migration can unlock prior blobs once per device.

### I8.1. Biometric unlock is enforced; the passphrase remains the cryptographic root
**Rule:** On native (iOS / Android), `createVault()` MUST NOT be called unless the device reports both biometric hardware AND at least one enrolled biometric (fingerprint or face). After enrolment and after every successful passphrase unlock, the derived vault key is cached into a hardware-backed `expo-secure-store` slot with `requireAuthentication: true`, so that subsequent launches can unlock via OS biometric prompt without re-deriving from the passphrase. The passphrase is the cryptographic root; biometric is a convenience-and-rate-limit gate on the cached symmetric key, not a replacement for the Argon2id derivation.

**Where:**
- [`lib/biometric.ts`](../lib/biometric.ts) — `getBiometricCapability()`, `enforceBiometric()`, `promptBiometric()`.
- [`lib/vault.ts`](../lib/vault.ts) — `BIOKEY_KEY_V1`, `BIOKEY_FLAG_V1`, `unlockVaultBiometric()`, `tryCacheVaultKeyForBiometric()`, `tryDeleteBiometricCache()`.
- [`app/(auth)/enroll.tsx`](../app/(auth)/enroll.tsx) — pre-check gate + submit-time `enforceBiometric()` re-check.
- [`app/(auth)/unlock.tsx`](../app/(auth)/unlock.tsx) — auto-prompt biometric on mount, passphrase fallback always visible.

**Why:** IMSI-catcher targets are typically also physical-coercion targets. A pure-passphrase unlock means an attacker who shoulder-surfs the passphrase once owns every future unlock. Biometric-gated cached key adds: (a) per-unlock OS authenticator gate that can't be observed remotely, (b) hardware-backed key storage that survives userland compromise, (c) Android KeyStore invalidation on biometric re-enrol — an attacker who adds their own fingerprint after stealing the device cannot unlock the cached key.

**How to apply:**
- Web has no biometric hardware, so the gate is bypassed on web ONLY. Web demos at `cz4r777.github.io/stingray` still ship with passphrase unlock and no cached key — this is explicit.
- Any new flow that stores a long-lived secret on disk must use the same `requireAuthentication: true` pattern, not a plain `expo-secure-store` write.
- `panicWipe()` MUST clear BOTH `BIOKEY_KEY_V1` AND `BIOKEY_FLAG_V1`. Leaving the flag without the key would prompt the user for biometric forever with no possible success — a stuck-UI regression.
- Lowering the gate (e.g. "skip biometric on web" extending to native) requires Supervisor sign-off and a `threat_model.md` residual-risk update.

**History:** v0.1.5 (2026-06-14) introduced enforced biometric on native after the user's explicit instruction "i want the user accounts to be remembered on the device" + "enforce biometrics and encryption". Web demo continues passphrase-only.

### I9. Contact verification is explicit, persisted, and visible
**Rule:** A contact is `unverified` until the user records a successful SAS comparison. The UI shows the verification state in every place the contact's name or messages appear.

**Where:** [`lib/types.ts`](../lib/types.ts) — `Contact.sas_state`; [`app/(tabs)/contacts.tsx`](../app/(tabs)/contacts.tsx) — SAS rendering.

**Why:** Pubkey exchange is the moment an active MITM can substitute their own key. Without an out-of-band confirmation channel, the user has no defense against that swap. SAS is a 7-digit fingerprint a human can compare over a separate channel.

**How to apply:** No contact persistence path may default to "verified". No UI element may suggest a contact is trustworthy when `sas_state !== 'verified'`.

### I10. Panic wipe deletes salt AND blob, atomically as far as the API allows
**Rule:** `panicWipe()` removes `stingray.vault.salt.v1`, `stingray.vault.salt.v2`, `stingray.vault.blob.v1`, `stingray.vault.blob.v2`, AND v0.1.5's biometric cache (`stingray.vault.biokey.v1` + `stingray.vault.bioenabled.v1`). Leaving any of these without the others creates an oracle or a stuck UI; partial wipe is worse than no wipe.

**Where:** [`lib/vault.ts`](../lib/vault.ts) — `panicWipe()`.

**Why:** Wipe is the user's last line of defense in an immediate physical-coercion scenario; partial wipe is worse than no wipe at all.

**How to apply:** Any future wipe enhancement (timed wipe, duress passphrase) must clear both, in order: salt first (so an interrupt mid-wipe leaves blob without salt — undecryptable), then blob, then the biometric cache (the auth-bound key BEFORE the plain flag).

---

## D. Local Storage And Logging

### I11. Envelopes are ack-deleted after successful decrypt
**Rule:** After a recipient successfully decrypts an envelope, the client issues a DELETE against the relay row. The 30-day server-side expiry is the fallback, not the primary cleanup.

**Where:**
- [`lib/envelope.ts`](../lib/envelope.ts) — `drainInbox()` calls `ackEnvelope()` per row
- [`supabase/schema.sql`](../supabase/schema.sql) — `expire_stale_envelopes()` for the fallback

**Why:** Less ciphertext at rest = less material for a relay-compromise adversary to subject to long-term cryptanalysis attempts, and less load on the relay.

**How to apply:** Do not introduce a "leave on server" mode. If multi-device sync ever lands, design ack-delete as "all of the user's devices have drained" — not "skip ack-delete to enable sync".

### I12. Drop-on-decrypt-failure is silent
**Rule:** A failed decrypt does NOT log the ciphertext, the ephemeral pubkey, the recipient pubkey, or any other identifying material. The function returns `null`; the caller continues to the next envelope.

**Where:**
- [`lib/crypto.ts`](../lib/crypto.ts) — `openEnvelope` returns `Uint8Array | null`
- [`lib/envelope.ts`](../lib/envelope.ts) — `drainInbox` skips on `null`
- [`app/chat/[peer].tsx`](../app/chat/[peer].tsx) — subscriber drops on `null`

**Why:** A debug log line containing a failed-decrypt ciphertext is exactly the kind of artifact a forensic analysis tool would find on a seized device. Better to be slightly harder to debug than to leak ciphertext to disk.

**How to apply:** Reviewers grep for `console.log` near `openEnvelope`. Any such reference is a block.

### I13. Aliases, notes, contact data are local-only
**Rule:** `local_alias`, `Contact.alias`, conversation labels, and any user-facing string that names a peer never leaves the device. They are stored inside the vault payload (encrypted at rest) and rendered only locally.

**Where:** [`lib/types.ts`](../lib/types.ts) — `Identity.local_alias`, `Contact.alias`; [`lib/vault.ts`](../lib/vault.ts) — alias is part of the vault payload.

**Why:** A name in a relay column would defeat the metadata-minimisation goal.

**How to apply:** Do not pass aliases as a field to `sendEnvelope()` or any relay call. The plaintext inside the envelope is the only legitimate place an alias might appear, and even there it should not be necessary (the recipient already knows their own contact list).

---

## E. Build And Boundaries

### I14. Service-role / privileged keys never ship to the client
**Rule:** Only `EXPO_PUBLIC_RELAY_ANON_KEY` is referenced in client code. The Supabase service-role key is for ops-side maintenance (running `expire_stale_envelopes()`) and lives nowhere in the repo or build artifacts.

**Where:** [`lib/relay.ts`](../lib/relay.ts) reads only `EXPO_PUBLIC_*`; `.env.example` has no service-role placeholder.

**Why:** The service role bypasses RLS — not that we have meaningful RLS to bypass on a no-account relay, but more importantly it can perform schema-level operations on the production relay. Shipping it client-side hands an attacker the ability to drop the table.

**How to apply:** Reviewers grep diffs for `service_role` / `SERVICE_ROLE`. Any client-side hit is an automatic block.

### I15. `schema.sql` stays idempotent
**Rule:** Re-running [`supabase/schema.sql`](../supabase/schema.sql) must never destroy data. Every `create table` uses `if not exists`; every policy is preceded by a matching `drop policy if exists`; data-affecting changes are written as separate migration files.

**Why:** It is the source of truth for the relay shape and is run by ops by hand. A non-idempotent file is one rerun away from dropping a table — which on this product means making every queued envelope undeliverable.

**How to apply:** If a change can't be expressed idempotently (e.g. column rename), introduce a `supabase/migrations/NNNN_description.sql` file and document the order in [pipeline.md](pipeline.md).
