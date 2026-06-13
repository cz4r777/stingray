---
id: T-001
title: Replace placeholder KDF with Argon2id; introduce versioned vault format
phase: 1
state: ready
owner_supervisor: cz4r777
owner_coder: unassigned
created: 2026-05-17
updated: 2026-05-17
invariants_touched: [I7, I8, I10]
threat_model_section: §5 (forensic / device-seizure attacker)
---

# T-001 — Replace placeholder KDF with Argon2id; introduce versioned vault format

## Why

The v0 vault key derivation in [`lib/crypto.ts`](../../lib/crypto.ts) is a 200,000-round
BLAKE2b hash chain (`deriveVaultKey`). This is acceptable for a prototype but is not
memory-hard, which makes the encrypted vault blob brute-forceable offline at low cost
if an attacker captures it. [INVARIANT I8](../invariants.md) calls for Argon2id;
[threat_model.md §5](../threat_model.md) names the forensic attacker as in-scope.

Replacing the KDF without a versioned blob format would lock out existing users on
upgrade. This ticket does both at once.

## Scope (what's in)

- Add `react-native-libsodium` (or equivalent native binding that exposes `crypto_pwhash` Argon2id).
- Add an `Argon2idParams` constant in `lib/crypto.ts` with the recommended MODERATE parameters
  for the platform (memory, iterations, parallelism). Document the choice in a comment with
  a reference to the libsodium docs.
- Replace `deriveVaultKey()` with a function that takes `(passphrase, salt, params)` and
  uses Argon2id. Keep the same return type (`Promise<Uint8Array>`).
- Bump the secure-store keys from `stingray.vault.salt.v1` / `stingray.vault.blob.v1` to
  `.v2`. Persist the params used at vault-creation time inside the blob so a future
  parameter change does not lock users out.
- Add a migration path in `lib/vault.ts unlockVault()`:
  1. If `.v2` keys exist, unlock as today.
  2. Else if `.v1` keys exist, unlock with the old KDF, re-encrypt under Argon2id with new
     salt + params, write `.v2`, delete `.v1`. The migration runs once per device.
- Add a `VaultVersion` field to the in-memory payload + types so the UI can show "vault format vX".
- Add test vectors: known passphrase + salt + params → expected derived key bytes (32). Run on
  CI as a typescript-level assertion at import time so a regression is loud.
- Add a tamper test: flip a byte in a known ciphertext, confirm `vaultDecrypt` returns `null`
  (never partial plaintext).

## Out of scope (what's NOT in)

- Auto-lock-on-suspend (separate Phase 1 ticket; opens after this one)
- Hardware-token unlock (Phase 7)
- Recovery via paper backup (intentionally never)
- Changing the envelope crypto (`box`, `secretbox`) — those primitives stay on tweetnacl

## Files likely to change

- `lib/crypto.ts`
- `lib/vault.ts`
- `lib/types.ts` (add `VaultVersion`)
- `app/(auth)/enroll.tsx` (passphrase strength meter, optional)
- `app/(auth)/unlock.tsx` (loading state for slower KDF)
- `package.json` (`react-native-libsodium` or equivalent)
- `app.json` (plugin entry if needed)
- `docs/invariants.md` (update I8 wording to remove "placeholder")
- `docs/architecture.md` (Current scope: drop "v0 placeholder")

## Acceptance criteria

- [ ] A fresh enroll on a clean device writes only `.v2` keys to secure-store.
- [ ] An existing `.v1` vault unlocked once with the correct passphrase migrates to `.v2` and
      removes `.v1`. Re-running unlock after migration uses `.v2` only.
- [ ] A wrong passphrase always returns `null` from `unlockVault`. The UI message does NOT
      distinguish "wrong passphrase" from "no vault" (oracle protection).
- [ ] Argon2id MODERATE parameters take ≥ 100 ms and ≤ 2 s on a typical mid-2025 phone.
      The slow unlock is intentional; the UI shows a spinner.
- [ ] Test vectors from libsodium's reference implementation pass in CI.
- [ ] Bit-flipped vault blob produces `null`, never partial plaintext.
- [ ] No new outbound network destination introduced by the dependency.

## Risk / threat-model implication

This NARROWS the threat model: the forensic attacker in [threat_model.md §5](../threat_model.md)
now pays a memory-hard per-guess cost. Residual risk against a weak passphrase still exists
(documented in §5 "Residual risk"). The UI enforces ≥ 12 chars in `enroll.tsx`; we may raise
this in a follow-up ticket if real-world data shows users picking minimum-length phrases.

The migration path WIDENS the threat model briefly: during migration, both `.v1` and `.v2`
exist for ~milliseconds. The order is: write `.v2`, then delete `.v1`. A crash mid-migration
leaves `.v2` already written, so the next unlock picks `.v2` directly. [INVARIANT I10](../invariants.md)
(panic wipe deletes both salts) is unaffected — the wipe function will iterate both versions.

## Handover checklist

### `scoping → ready` (Supervisor) — DONE
- [x] Title concrete
- [x] Phase set (1)
- [x] `invariants_touched` = [I7, I8, I10]
- [x] `threat_model_section` = §5
- [x] Acceptance criteria testable from outside the diff
- [x] Out-of-scope listed
- [x] No relay schema change → no explicit schema sign-off needed

### `ready → coding` (Coder)
- [ ] Ticket re-read cold
- [ ] [INVARIANT I7](../invariants.md), [I8](../invariants.md), [I10](../invariants.md) read
- [ ] [threat_model.md §5](../threat_model.md) read
- [ ] Branch `T-001-argon2id-kdf` created

### `coding → review` (Coder)
- [ ] `npm run typecheck` passes
- [ ] Test vectors checked in
- [ ] Tamper test checked in
- [ ] Migration verified manually: enroll on a `.v1` build → upgrade JS → unlock → confirm `.v2`
- [ ] Docs updated in the same commit (invariants.md I8, architecture.md scope)
- [ ] No `console.log` of passphrase, salt, derived key, or any vault payload
- [ ] PR description names T-001

### `review → staging` (Reviewer)
- [ ] [pipeline.md §Stage 4](../pipeline.md) checklist clean
- [ ] Argon2id parameters look defensible against the libsodium reference values
- [ ] Migration is one-shot and atomic-ish (no `.v1` orphan after one successful unlock)
- [ ] No bundle-size shock from `react-native-libsodium` (check build report)

### `staging → prod` (Ops)
- [ ] Happy path on iOS + Android preview builds
- [ ] Faraday banner toggle unaffected
- [ ] `.v1` → `.v2` migration verified on a real device with a prior install

### `prod → done` (Supervisor)
- [ ] 24h with no unlock-failure spike in any user report
- [ ] [invariants.md I8](../invariants.md) line "v0 placeholder" removed in a follow-up if not done here

## Notes

`react-native-libsodium` requires a native build (`eas build`, not just `eas update`). Bump
`expo.ios.buildNumber` and `expo.android.versionCode` for the release.

### Alternative crypto providers — evaluate before locking in

The ticket's scope names `react-native-libsodium` as the default. Two other providers are
worth weighing against it during the spike phase. The Coder should add a short comparison
table to the PR description before settling.

1. **`react-native-themis`** (Apache 2.0) — Themis is the only audited library in our
   [Design references](../asc11_handover.md#design-references) with a permissive license.
   Secure Cell would replace `vaultEncrypt` / `vaultDecrypt`; the underlying Argon2id-style
   passphrase derivation is built in. Pros: cleanest license, less code on our side. Cons:
   binds us to Themis's parameter choices and bundle size.
2. **`sodium-browserify-tweetnacl` + `pbkdf2`** (per [adamant-im/](../../adamant-im/) prior
   art) — a *lower-friction* stepping stone that stays in pure JS (no native build, no EAS
   rebuild). Useful as a v0.5 hardening pass if `react-native-libsodium` integration is
   blocked. PBKDF2 is weaker than Argon2id but vastly better than our current 200k-round
   hash chain. **Do NOT ship this as the final answer** — it is the intermediate fallback,
   not the destination.

Whichever provider is chosen, the acceptance criteria above (test vectors, tamper test,
versioned blob format, migration path) do not change.
