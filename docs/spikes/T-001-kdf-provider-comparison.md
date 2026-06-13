---
ticket: T-001
type: spike
date: 2026-05-21
author: Diagnostics (acting as Coder per delegation)
decision_required: Supervisor (decision A in 2026-05-20-supervisor-handover.md)
---

# T-001 spike — Argon2id KDF provider comparison

The ticket scope names `react-native-libsodium` as the default and asks the
Coder to evaluate two alternates before locking in. This file is the spike
output. **One option meets the ticket's Argon2id requirement; the other two
require either a scope reduction or a stacked polyfill.**

## TL;DR — recommendation

**Use `react-native-libsodium`.** It is the only one of the three that
exposes Argon2id (`crypto_pwhash` with `ALG_ARGON2ID13`) natively. The two
alternates ship a *different* memory-hard or non-memory-hard primitive and
would silently downgrade the ticket's promise.

## Comparison

| Axis | (a) react-native-libsodium | (b) react-native-themis | (c) sodium-browserify-tweetnacl + pbkdf2 |
|---|---|---|---|
| **License** | ISC (libsodium core) | Apache 2.0 | MIT (both libs) |
| **Primitive offered** | Argon2id (`crypto_pwhash`) | Themis Secure Cell passphrase mode = **PBKDF2-SHA256** under the hood | **PBKDF2** only (no Argon2/scrypt in this lib) |
| **Meets T-001 ticket scope?** | ✅ yes — exact match | ❌ no — different primitive | ❌ no — different primitive |
| **Native build required?** | yes — `eas build`, not `eas update` | yes | no — pure JS |
| **Bundle-size impact (approx)** | +400–600 KB native; ~30 KB JS shim | +800 KB native (full Themis lib) | +80 KB pure JS |
| **API surface** | `sodium.crypto_pwhash(...)` — direct | `SecureCellSeal.withPassphrase(...)` — abstracted (no param control) | `pbkdf2.pbkdf2(...)` — direct |
| **Param control** | full (opslimit, memlimit, parallelism) | none — Themis picks for us | full (iterations, keylen, digest) |
| **Audit history** | libsodium has multiple audits; this binding < 2 years old | Themis core audited 2020-2022 by NCC Group | tweetnacl audited; pbkdf2 is a node primitive |
| **Maintenance status** | active (serenity-kit fork) | active (Cossack Labs) | tweetnacl stable; pbkdf2 stable; both low-velocity |
| **Migration story (.v1 → .v2)** | clean — wrap in `deriveVaultKey` adapter | clean if we accept PBKDF2 | clean if we accept PBKDF2 |
| **Threat-model effect** | NARROWS §5 to memory-hard cost per guess | NARROWS §5 less (PBKDF2-SHA256 is GPU-friendly) | NARROWS §5 less (same as Themis) |

## Why option (a) wins

The ticket's risk paragraph names "memory-hard per-guess cost" as the
defensive property. PBKDF2 is not memory-hard. Even at very high iteration
counts (1M+) PBKDF2 stays cheap to parallelise on GPUs and ASICs —
exactly the attack profile Argon2id was designed to defeat.

Switching to PBKDF2 would technically improve over the 200k BLAKE2b hash
chain we ship today (which is also non-memory-hard), but it would NOT
satisfy [INVARIANT I8](../invariants.md)'s "memory-hard" clause as written.
Changing I8 to permit PBKDF2 is a Supervisor-only decision and would
constitute weakening an invariant.

## When the alternates would matter

- **react-native-themis (b)** is the right answer IF we later decide to
  consolidate all our crypto under Themis (Secure Message replacing
  `tweetnacl.box` for envelopes too). At that point Themis's Secure Cell
  passphrase mode is "good enough" and the consolidation is worth a single
  invariant amendment. Out of scope for T-001.
- **sodium-browserify-tweetnacl + pbkdf2 (c)** is the right answer IF the
  team has a hard requirement to ship without a native build (e.g. webview-
  only PWA distribution). That changes the deployment model in ways that
  affect Phase 5 self-host and Phase 8 Tor work — out of scope here.

## Open question for the Supervisor

If the Supervisor disagrees with the recommendation (e.g. wants to
prioritise bundle size or audit lineage over Argon2id specifically), this
spike's output becomes "stop work; amend I8 and re-scope T-001". Default
action assumed: **proceed with react-native-libsodium**.

## Implementation notes (for downstream)

- The wrapper lives in `lib/crypto.ts` as `deriveVaultKey()`.
- Argon2id parameters chosen: **MODERATE** profile from libsodium docs
  (`OPSLIMIT_MODERATE = 3`, `MEMLIMIT_MODERATE = 256 MiB`). These produce
  a ~300–800 ms unlock on a typical mid-2025 phone (within the 100 ms – 2 s
  acceptance window).
- Params are persisted inside the vault blob so future parameter bumps do
  not lock out existing users (each vault unlocks with the params it was
  encrypted under).
- The `.v1` → `.v2` migration runs once per device on first successful
  unlock. Order of operations: write `.v2` first, then delete `.v1`. A
  crash mid-migration leaves a usable `.v2` and an orphan `.v1` (cleared
  on next unlock).
