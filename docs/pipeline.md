# Pipeline — Engineering And Architecture Change Pipeline

> This file is the **dev/change-control pipeline**.
> It defines how schema, code, review, deploy, and monitoring work.
> It is not the product framework and it is not the product build workflow.

Related docs:

- `framework.md` = what we are building
- `workflow.md` = what order we build it in
- `pipeline.md` = how each change moves safely from idea to production
- `coder_batch_mode.md` = how multiple linked tickets may be executed in one bounded Coder run
- `threat_model.md` = the adversary every change is measured against

## Alpha-stage override

Until alpha is complete, the active execution lane is:

- **Supervisor → Coder → Diagnostics**

Operationally, that means:

- once the Supervisor assigns a ticket or authorized batch, the default is to proceed directly to coding
- Diagnostics performs the default post-coding audit and acceptance-criteria walk
- a separate Reviewer pass is used when the Supervisor explicitly asks for it or when the change is risky enough to justify an extra cold read
- Ops still handles installs, builds, device smoke, staging, and deploy tasks when they are actually needed

This override changes the **tempo**, not the safety boundaries:

- invariants still bind
- threat-model implications still matter
- hard-stop conditions in [coder_batch_mode.md](coder_batch_mode.md) still apply
- Diagnostics may still report blockers, but the emphasis is to keep work moving through coding unless a real risk appears

---

## Roles

> Canonical charter lives in [roles.md](roles.md). The table below is a summary — when the two drift, `roles.md` wins.

| Role | Who | What they do | What they DON'T do |
|---|---|---|---|
| **Supervisor / Architect** | the human running the project | scopes work, owns the docs, makes final go/no-go calls | does not write every line of code |
| **Coder** (human or AI assistant) | implements specific tickets | writes code + tests + doc updates | does not approve their own changes |
| **Reviewer** | second pair of eyes | reads the diff against invariants, forbidden patterns, and the threat model | does not write code in the same pass |
| **Ops** | the human deploying | runs migrations, monitors relay, triages issues | does not invent infra changes; follows runbooks |
| **Diagnostics & Testing** (advisory; AI by default) | smoke-tests, grep audits, invariant-drift checks; Supervisor backup when unreachable | verifies state; runs acceptance-criteria checks; drafts low-stakes doc/ticket updates | does not write feature code; does not approve PRs; does not change invariants/threat_model without Supervisor sign-off |

For solo dev: same person plays all four primary roles, but **in distinct passes**. Coder pass writes the diff; Reviewer pass reads it cold against [invariants.md](invariants.md), [forbidden_patterns.md](forbidden_patterns.md), and [threat_model.md](threat_model.md). Don't merge in the same mental state you wrote.

Diagnostics is reachable inside the Coder's working session (typically a Claude thread) and is consulted continuously — it is NOT a fifth approval gate in the six-stage pipeline below.

---

## Stages

```
┌────────────────────────────────────────────────────────────────────┐
│ 0. Scope (Supervisor)                                              │
│    - Pick a ticket. Confirm it aligns with current scope           │
│      (architecture.md "Current scope (v0)").                       │
│    - If the ticket changes scope, update architecture.md FIRST.    │
│    - Run the threat-model check: does the change weaken any        │
│      defense in threat_model.md? If yes, supervisor sign-off       │
│      required before coding starts.                                │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│ 1. Schema first (if applicable)                                    │
│    - Edit supabase/schema.sql idempotently (INVARIANT I15).        │
│    - For non-idempotent changes, add supabase/migrations/NNNN.sql. │
│    - Re-run schema.sql locally against a throwaway relay project;  │
│      verify no data loss on rerun.                                 │
│    - Update docs/api_contracts.md in the SAME commit as the schema │
│      change.                                                       │
│    - If the change adds ANY new column on `envelopes`, escalate:   │
│      this likely violates INVARIANT I3 and needs supervisor        │
│      sign-off.                                                     │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│ 2. Code (Coder)                                                    │
│    - Implement against the contracts in api_contracts.md.          │
│    - Touch only files needed for the ticket. No drive-by refactors.│
│    - If a new invariant emerges, propose it in invariants.md;      │
│      do NOT add silent guards.                                     │
│    - For crypto changes: include vectors in the same PR. A change  │
│      to lib/crypto.ts with no test vectors is not reviewable.      │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│ 3. Local verification (Coder)                                      │
│    - `npm run typecheck` — must pass.                              │
│    - `npm run web` — exercise the changed screen.                  │
│    - For transport changes: simulate Wi-Fi + cellular + offline    │
│      via the Expo simulator and confirm the gate behaves.          │
│    - For Android secure-shell changes: verify on real Android 12+  │
│      hardware that screenshots / standard recording / recents      │
│      previews do not reveal protected content.                     │
│    - For schema changes: rerun schema.sql, confirm no error.       │
│    - For vault changes: enroll → lock → unlock → wipe →            │
│      enroll-again on the same device. All steps must succeed.      │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│ 4. Review (Reviewer)                                               │
│    Checklist (read in this order — failing earlier checks blocks): │
│    a. Diff size sane? (>500 lines = ask why).                      │
│    b. Any reference to `service_role` in app/, lib/, components/?  │
│       If yes → BLOCK (INVARIANT I14).                              │
│    c. New schema column on `envelopes` beyond addressing?          │
│       BLOCK (INVARIANT I3).                                        │
│    d. Network call outside lib/relay.ts (or inside without         │
│       `assertFaraday()`)? BLOCK (INVARIANT I1).                    │
│    e. Cached ephemeral keypair? Stored plaintext private key?      │
│       BLOCK (INVARIANT I6 / I7).                                   │
│    f. console.log near openEnvelope or sendEnvelope?               │
│       BLOCK (INVARIANT I12 + security_rules.md §6).                │
│    g. Telemetry / crash SDK / analytics SDK initiating network?    │
│       BLOCK (forbidden_patterns.md B6.2).                          │
│    h. Android secure-shell diff overclaims its protections         │
│       ("blocks malware", "stops RATs", etc.)? BLOCK.              │
│    i. Threat-model implication noted in PR description?            │
│    j. Docs updated to match the diff?                              │
│    k. Test coverage proportional to risk?                          │
│    Approve only after a–k pass.                                    │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│ 5. Deploy (Ops)                                                    │
│    a. Apply schema changes via Supabase SQL editor (staging first).│
│    b. Verify the new schema appears as expected (Table editor).    │
│    c. Push client: `eas update` for OTA (instant) or               │
│       `eas build` + store submission (release).                    │
│    d. Smoke-test the deployed change on a real Wi-Fi network.      │
│    e. Verify the Faraday gate banner appears when toggling to      │
│       airplane mode (no Wi-Fi).                                    │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│ 6. Monitor (Ops)                                                   │
│    - Daily: relay row count (expect near-zero with ack-delete).    │
│    - Daily: expired-envelope job ran (count returned).             │
│    - Weekly: check Supabase logs for unexpected RLS denials        │
│      (should be ~zero — RLS is permissive by design).              │
│    - On incident: write up in forbidden_patterns.md Section A.     │
└────────────────────────────────────────────────────────────────────┘
```

---

## Special pipelines

### Crypto-touching pipeline
Any change under `lib/crypto.ts`, `lib/vault.ts`, or affecting envelope/key formats MUST follow this order:

| # | Gate | Why it exists |
|---|---|---|
| 1 | Test vectors against libsodium reference in the PR | Subtle bugs in framing/padding/nonce are invisible without vectors |
| 2 | Forward-migration plan if blob format changes (`.v2`) | Users must not be locked out by a KDF change |
| 3 | Outside-cryptographer review for nontrivial primitives | Phase 9 launch gate; small changes can go in earlier |
| 4 | Threat-model update if the residual risk shifts | The doc is the durable record of what we promise |

### Pre-launch hardening pipeline
Before any public release (TestFlight beyond the author, store submission):

| # | Gate | Doc reference |
|---|---|---|
| 1 | Argon2id KDF replaces v0 placeholder | [INVARIANT I8](invariants.md) |
| 2 | SAS verification persists and gates sensitive features | [INVARIANT I9](invariants.md) |
| 3 | Faraday gate visually surfaced on every screen | [INVARIANT I1](invariants.md) |
| 4 | If secure-shell mode is advertised, Android protected screens are verified on real Android 12+ hardware | [android_secure_shell_mode.md](android_secure_shell_mode.md) |
| 5 | `EXPO_PUBLIC_FARADAY_MODE` defaults to `true` in all release profiles | [forbidden_patterns.md B6.4](forbidden_patterns.md) |
| 6 | No third-party telemetry SDK in the bundle | [forbidden_patterns.md B6.2](forbidden_patterns.md) |
| 7 | Self-host instructions verified against a clean Postgres | [workflow.md Phase 5](workflow.md) |
| 8 | Privacy disclosures match actual behaviour | [forbidden_patterns.md C5](forbidden_patterns.md) |
| 9 | Outside-cryptographer review of the threat model | [framework.md launch standard](framework.md) |

### Transport-touching pipeline
Any change under `lib/transport.ts` or any gate behaviour:

| # | Gate | Why it exists |
|---|---|---|
| 1 | Simulator coverage: WIFI / CELLULAR / VPN / NONE / UNKNOWN | The gate's behaviour is defined per-state |
| 2 | Default-deny: any new transport state must be classified into "allowed" or "refuse"; "I don't know" → refuse | INVARIANT I1 |
| 3 | UX surface: the banner must reflect the new state with a human-readable reason | [forbidden_patterns.md B5.1](forbidden_patterns.md) |

### Android secure-shell pipeline
Any change affecting screenshot / recording blocking, privacy curtains, blind compose, overlays, or fullscreen secure-shell behaviour:

| # | Gate | Why it exists |
|---|---|---|
| 1 | Verify on real Android 12+ hardware, not emulator-only | Capture and overlay behaviour is device- and OS-specific |
| 2 | Test screenshot, standard recording, app-switcher preview, and background/foreground re-shield | These are the concrete protections the feature claims |
| 3 | If blind compose is changed, confirm the ordinary soft keyboard path is not invoked in secure-shell mode | The feature is IME avoidance, not merely masked text in a standard input |
| 4 | Product copy must say "best-effort" / "supported Android devices" and must not claim defense against malware or RATs | Overclaiming is a security bug and a trust bug |

### Batch-execution pipeline
Any Coder run that covers 2-4 linked tickets under [coder_batch_mode.md](coder_batch_mode.md):

| # | Gate | Why it exists |
|---|---|---|
| 1 | Batch contains only tightly related tickets with a clear dependency chain or one vertical slice | Prevents autonomy from turning into scope soup |
| 2 | The Coder reports progress per ticket, not just per batch | Keeps state and review readable |
| 3 | Hard stop conditions are written in the handover before coding starts | The Coder should not guess through invariant, scope, or threat-model risk |
| 4 | Reviewer can still read the resulting diff cold without losing ticket boundaries | If the diff is too big to review, the batch was too big to run |

---

## How AI assistants fit in

An AI coding assistant (Claude Code, Cursor, etc.) is a **Coder** by default. It is NOT a Reviewer, Architect, or Ops. Specifically:

- **OK to delegate to AI:** writing screens, helpers, tests, doc drafts, refactors of a single file.
- **NOT OK to delegate to AI (without human review):** decisions about which invariant applies, irreversible operations (DROP, force-push), changes to this pipeline doc, changes to invariants.md, changes to threat_model.md.
- **Reviewer step (#4 above) is human** even when Coder is an AI. The AI does not approve its own diff.

A two-Claude architecture — code authority separate from diagnostic/review authority — is the recommended pattern here.

---

## Anti-checklist (don't do these)

- Don't merge a schema change in the same commit as a multi-file refactor of unrelated screens.
- Don't add a "TODO: harden later" comment and merge. Either build it or open a ticket — comments rot.
- Don't disable the Faraday gate to "test something" in a shared environment. Use a local dev build.
- Don't skip the Reviewer step because "it's a small change". Small changes that touch crypto, transport, or vault are exactly the high-stakes ones.
- Don't change `invariants.md`, `pipeline.md`, or `threat_model.md` in the same PR as feature code — those are framework changes, propose them in a standalone PR.
- Don't call something "end-to-end encrypted" if the server can decrypt it. That is transport encryption, not E2EE.
