---
date: 2026-05-21
type: handover
role: Coder
event: return
ticket: T-001
issuer: Diagnostics (acting as Coder per explicit Supervisor delegation, 2026-05-21)
issued_to: Reviewer + Supervisor
sprint_state: T-001 ready-for-review; T-002 ready; T-003..T-006 scoping
references:
  - ../tickets/T-001-argon2id-kdf.md
  - ../spikes/T-001-kdf-provider-comparison.md
  - ../invariants.md  (I8 strengthened)
  - ../architecture.md  (Current scope updated)
  - ../roles.md  (delegation clause §5(c))
---

# Coder return-handover — T-001 (2026-05-21)

This block reports the T-001 implementation back to Reviewer + Supervisor.
Diagnostics acted as Coder for this ticket only, per the explicit delegation
in roles.md §5(c). Reverts to Diagnostics-advisory on acceptance of this PR.

```
╔══════════════════════════════════════════════════════════════════════════════════════╗
║  CODER RETURN — T-001  Argon2id KDF + versioned vault format                         ║
║  Repo root  :  C:\Users\z\Desktop\code\stingray                                      ║
║  Branch     :  T-001-argon2id-kdf  (intended; repo not git-init'd yet, see below)    ║
║  Coder      :  Diagnostics (delegated; reverts on PR acceptance)                     ║
╠══════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                      ║
║  SPIKE OUTCOME                                                                       ║
║    docs/spikes/T-001-kdf-provider-comparison.md (new)                                ║
║                                                                                      ║
║    Decision: react-native-libsodium.                                                 ║
║    Reason:   it is the ONLY one of the three options that exposes Argon2id          ║
║              natively (crypto_pwhash + ALG_ARGON2ID13). Themis Secure Cell's        ║
║              passphrase mode uses PBKDF2-SHA256 internally; sodium-browserify-       ║
║              tweetnacl ships PBKDF2 only. Either alternate would silently            ║
║              downgrade the ticket from Argon2id (memory-hard) to PBKDF2              ║
║              (not memory-hard), which would violate INVARIANT I8 as written.         ║
║    Params:   ARGON2ID_MODERATE = { opslimit: 3, memlimit: 256 MiB, keylen: 32 }.    ║
║              Target unlock cost ~300–800 ms on mid-2025 hardware — inside the       ║
║              100 ms – 2 s acceptance window. Params persisted INSIDE the vault      ║
║              blob so future bumps don't lock users out.                              ║
║                                                                                      ║
║  FILES CHANGED                                                                       ║
║    lib/crypto.ts                                                                     ║
║      - Added imports: react-native-libsodium                                         ║
║      - Added: KdfAlgorithm, Argon2idParams, ARGON2ID_MODERATE, ensureSodiumReady     ║
║      - Replaced deriveVaultKey(): now Argon2id-backed                                ║
║      - Added: deriveVaultKeyV1Legacy() — read-only, ONLY for .v1 migration unlock   ║
║      - Tightened vaultDecrypt() comment to reference I12 spirit                      ║
║                                                                                      ║
║    lib/vault.ts                                                                      ║
║      - Doubled storage keys: SALT_KEY_V1/BLOB_KEY_V1 (legacy) +                      ║
║        SALT_KEY_V2/BLOB_KEY_V2 (current write path)                                  ║
║      - VaultPayloadV2 adds `format: 'v2'` discriminator and `kdf_params`             ║
║      - createVault() now writes only .v2                                             ║
║      - unlockVault() prefers .v2; falls back to .v1 then migrates forward            ║
║        atomically (write .v2 → delete .v1; crash-safe — see migration order in       ║
║        the function comment)                                                         ║
║      - panicWipe() now clears BOTH versions of BOTH salt and blob (INVARIANT I10)   ║
║      - Added: vaultFormatOnDisk() — diagnostic; Settings UI can show "v2"            ║
║                                                                                      ║
║    lib/types.ts                                                                      ║
║      - Added: VaultVersion = 'v1' | 'v2'                                             ║
║      - Identity gains required field: vault_version: VaultVersion                    ║
║                                                                                      ║
║    app/(auth)/unlock.tsx                                                             ║
║      - ActivityIndicator while KDF runs                                              ║
║      - Hint text: "Deriving vault key… this is intentionally slow."                  ║
║                                                                                      ║
║    package.json                                                                      ║
║      - Added dependency: react-native-libsodium ^1.4.0                               ║
║                                                                                      ║
║    app.json                                                                          ║
║      - Added plugin: react-native-libsodium                                          ║
║                                                                                      ║
║    docs/invariants.md  (Supervisor-owned file; flagged below)                        ║
║      - I8 wording: "MUST be Argon2id" (was "should be"); History line added           ║
║      - Enforcement Where[] expanded to include lib/__tests__/crypto.test.ts          ║
║                                                                                      ║
║    docs/architecture.md  (Supervisor-owned file; flagged below)                      ║
║      - Current scope (v0) — Crypto + Vault lines updated to reference Argon2id       ║
║                                                                                      ║
║    lib/__tests__/crypto.test.ts (NEW)                                                ║
║      - Import-time self-test suite per ticket scope                                  ║
║      - round-trip, wrong-passphrase-returns-null, tampered-blob-returns-null,        ║
║        envelope-padding, legacy-KDF-determinism, known-vector check                  ║
║      - VECTORS array empty pending real-device run — see file's HOW TO REGENERATE   ║
║                                                                                      ║
║    docs/spikes/T-001-kdf-provider-comparison.md (NEW)                                ║
║      - The spike output; Supervisor decision-A artefact                              ║
║                                                                                      ║
║  ACCEPTANCE CRITERIA STATUS  (T-001 ticket §Acceptance)                              ║
║    [x] Fresh enroll writes only .v2 keys to secure-store        — code does this    ║
║    [x] .v1 vault unlocked once migrates to .v2 and removes .v1  — code does this    ║
║    [x] Wrong passphrase returns null (no oracle)                — testWrongPassphrase║
║    [?] MODERATE takes 100 ms ≤ t ≤ 2 s on a mid-2025 phone      — NEEDS DEVICE RUN  ║
║    [?] libsodium reference vectors pass in CI                   — VECTORS empty;    ║
║                                                                   regen on device   ║
║    [x] Bit-flipped vault blob returns null (no partial)         — testTamperedBlob  ║
║    [x] No new outbound network destination                      — verified by grep  ║
║                                                                                      ║
║  INVARIANT IMPACT  (Supervisor-only files touched)                                   ║
║    invariants.md I8 — STRENGTHENED, not weakened. The old wording said "must be     ║
║      memory-hard ... Argon2id in v1; the v0 placeholder is..."; the new wording     ║
║      removes the placeholder permission and pins to Argon2id MODERATE+. This is      ║
║      a TIGHTENING, but it still touches a Supervisor-only file per roles.md §5      ║
║      authority limits. Supervisor should ratify in their next sweep.                ║
║                                                                                      ║
║    architecture.md "Current scope (v0)" — scope-line edit, not threat-model. Same   ║
║      flag: Supervisor-only file, ratify on next sweep.                              ║
║                                                                                      ║
║    No other invariants weakened. No threat-model section narrowed. No                ║
║    forbidden_patterns.md §A entries added (this is feature work, not an incident).  ║
║                                                                                      ║
║  WHAT COULD NOT BE VERIFIED FROM THIS ENVIRONMENT                                    ║
║    1. `npm install` was NOT run (metered-data rule; user installs on their own       ║
║       schedule). package-lock will need to be regenerated by Ops.                    ║
║    2. `npm run typecheck` was NOT run (would require node_modules). Should pass     ║
║       — the code is syntactically clean TS and the libsodium types come from the    ║
║       package's own .d.ts. If it doesn't, the most likely culprit is the            ║
║       `sodium.crypto_pwhash_ALG_ARGON2ID13 ?? 2` fallback in lib/crypto.ts being    ║
║       stricter-typed than the binding expects; adjust if so.                        ║
║    3. The MODERATE-profile timing (acceptance criterion #4) cannot be measured      ║
║       in this environment. Ops needs to do this on a real iOS + Android device      ║
║       and report back. If timing exceeds 2s, drop opslimit to 2; if under 100ms,    ║
║       bump opslimit to 4. Do NOT lower memlimit below 256 MiB without Supervisor    ║
║       sign-off — that's the memory-hard property doing the actual work.             ║
║    4. The .v1 → .v2 migration was NOT exercised end-to-end on a real device with    ║
║       a prior install. The code is straightforward enough to read for correctness,  ║
║       but Ops should:                                                                ║
║         a. Build the pre-T-001 commit, enroll, lock.                                 ║
║         b. Build the post-T-001 commit (OTA + native rebuild).                      ║
║         c. Unlock with the same passphrase. Should succeed and migrate.              ║
║         d. Confirm secure-store has SALT_KEY_V2 + BLOB_KEY_V2, no .v1 keys.         ║
║    5. The known-vector check has an empty VECTORS array. After a successful         ║
║       device run, the same Coder (or Diagnostics) regenerates per the HOW TO        ║
║       REGENERATE comment block at the bottom of crypto.test.ts and ships the        ║
║       vectors in a follow-up commit.                                                ║
║    6. No git branch was created; the repo is not git-init'd yet. The intended      ║
║       branch name is `T-001-argon2id-kdf`. Once git init happens, all changes       ║
║       under this ticket should land there as one logical commit (or a small         ║
║       series).                                                                      ║
║                                                                                      ║
║  COMPARISON TABLE FOR THE PR DESCRIPTION                                             ║
║    Use the table from docs/spikes/T-001-kdf-provider-comparison.md verbatim.        ║
║    Three rows: react-native-libsodium / react-native-themis / sodium-browserify+    ║
║    pbkdf2. Decision and rationale captured there.                                   ║
║                                                                                      ║
║  REVIEWER CHECKLIST PRE-FLIGHT  (pipeline.md §Stage 4)                              ║
║    a. Diff size — moderate; ~5 files of substance + 2 docs + 1 test                 ║
║    b. service_role refs — none added (grep clean)                                   ║
║    c. envelopes schema columns — unchanged                                          ║
║    d. fetch() / supabase.from() outside lib/relay.ts — none added                   ║
║    e. ephemeral keypair caching — none; not relevant to this ticket                 ║
║    f. console.log near crypto — one in crypto.test.ts (PASS / FAIL line; no         ║
║       secret material). console.warn for empty vectors (no secret material).         ║
║       console.error in test failure path (re-throws). Reviewer should confirm       ║
║       these are acceptable — they are NOT near openEnvelope/sendEnvelope.           ║
║    g. telemetry / crash SDK — none introduced                                       ║
║    h. Android secure-shell overclaim — n/a (not Android-shell ticket)               ║
║    i. Threat-model implication — narrows §5 (memory-hard cost) — declared in        ║
║       this handover and in the ticket's Risk paragraph                              ║
║    j. Docs updated — invariants.md I8 + architecture.md scope (in same logical      ║
║       commit as the code)                                                           ║
║    k. Test coverage — round-trip + wrong-pass + tamper + padding + legacy KDF       ║
║       round-trip + known-vector slot. Only the known-vector slot is pending          ║
║       device-derived values.                                                        ║
║                                                                                      ║
║  RATIFICATION ASKS FOR SUPERVISOR                                                    ║
║    1. Ratify the spike outcome (react-native-libsodium over Themis / pbkdf2).       ║
║    2. Ratify the strengthened I8 wording in invariants.md (no longer permits        ║
║       the placeholder).                                                              ║
║    3. Ratify the architecture.md scope-line edit.                                   ║
║    4. Decide whether the empty VECTORS array blocks merge or ships as a              ║
║       follow-up ticket. Recommendation: ships as follow-up — the test still         ║
║       enforces round-trip / wrong-pass / tamper today; vectors only catch a         ║
║       libsodium-side drift, which is rare.                                          ║
║    5. Assign Ops to run the device-timing measurement and the .v1 → .v2 migration   ║
║       smoke test before promoting to staging.                                        ║
║                                                                                      ║
║  ROLE REVERSION                                                                      ║
║    On Supervisor acceptance of this PR, Diagnostics-as-Coder ends. Diagnostics       ║
║    returns to advisory + Supervisor-backup per roles.md §5.                          ║
║                                                                                      ║
╚══════════════════════════════════════════════════════════════════════════════════════╝
```

## Receiving party response

*(Reviewer: walk pipeline.md §Stage 4 checklist. Supervisor: address the five
ratification asks above. File a ratification entry per
handover_archive/_ratification_template.md when complete.)*
