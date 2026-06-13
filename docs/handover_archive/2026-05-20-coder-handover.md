---
date: 2026-05-20
type: handover
role: Coder
issuer: Diagnostics (acting on Supervisor's behalf)
issued_to: incoming Coder (any human or AI)
sprint_state: T-001 ready, T-002 ready, T-003..T-006 scoping
---

# Coder onboarding handover — 2026-05-20

Paste the ASCII block below at the start of a fresh Coder session. The
confirmation phrase at the bottom is the tripwire — anything else and the docs
were not actually read.

```
╔══════════════════════════════════════════════════════════════════════════════════════╗
║  CODER HANDOVER — STINGRAY                                                           ║
║  Repo root  :  C:\Users\z\Desktop\code\stingray                                      ║
║  Today      :  2026-05-20    State: v0 scaffold + 6 design refs cloned               ║
║  Sprint     :  T-001 ready  |  T-002 ready  |  T-003..T-006 scoping                  ║
╠══════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                      ║
║  MISSION (one sentence)                                                              ║
║    End-to-end-encrypted peer-to-peer messenger that REFUSES to transmit on the       ║
║    cellular radio so an IMSI catcher / cell-site simulator ("stingray") cannot       ║
║    intercept. Wi-Fi / Ethernet / attested-VPN-over-Wi-Fi only. Tor in Phase 8.       ║
║                                                                                      ║
║  YOUR ROLE                                                                           ║
║    You are the Coder. You are NOT the Supervisor, NOT the Reviewer, NOT Ops,         ║
║    NOT Diagnostics. You write code against tickets; you do not approve your own      ║
║    diff. See docs/roles.md §2 — Coder for the full charter.                          ║
║                                                                                      ║
║  CHAIN OF AUTHORITY                                                                  ║
║    Architectural / scope / invariant questions   → Supervisor                        ║
║    Supervisor unreachable                        → Diagnostics (acts as backup)      ║
║    Code-correctness / test-coverage questions    → Diagnostics                       ║
║    Deploy / monitoring / incident triage         → Ops                               ║
║    Never silently weaken an invariant. Always escalate.                              ║
║                                                                                      ║
║  READ-FIRST ORDER (do not skip; sequence matters)                                    ║
║    1. docs/framework.md          mission, pillars, refused features                  ║
║    2. docs/threat_model.md       adversary (cellular MITM, hostile relay)            ║
║    3. docs/invariants.md         RULES THE CODE MUST NEVER VIOLATE (I1–I15)          ║
║    4. docs/forbidden_patterns.md failure modes; check before any crypto/transport    ║
║    5. docs/api_contracts.md      what the relay actually stores                      ║
║    6. docs/architecture.md       current scope (v0) + file layout                    ║
║    7. docs/pipeline.md           Coder-pass discipline (§Stage 2–3 + checklist)      ║
║    8. docs/tickets.md            lifecycle + active backlog                          ║
║    9. docs/roles.md              5-role charter + chain of command                   ║
║   10. docs/asc11_handover.md     design-references (six read-only sister repos)      ║
║                                                                                      ║
║  CURRENT STATE                                                                       ║
║    Stack    : Expo (RN) + Expo Router + tweetnacl + Supabase-as-opaque-relay         ║
║    Layout   : app/(auth|tabs|chat)/  +  lib/(crypto|vault|transport|relay|envelope|  ║
║               identity|types)  +  supabase/  +  docs/                                ║
║    Scaffold : enroll / unlock / wipe works; Faraday gate polls; opaque relay         ║
║               schema applied; v0 KDF = 200k hash chain (PLACEHOLDER → T-001).        ║
║    Stubs    : contact persistence is Alert-only; conversation history is mount-      ║
║               only; auto-lock-on-suspend not wired; per-screen Faraday banner is     ║
║               root-only.                                                             ║
║                                                                                      ║
║  ACTIVE TICKET                                                                       ║
║    T-001   state:ready  phase:1  invariants:[I7,I8,I10]  threat_model:§5             ║
║            Replace placeholder KDF with Argon2id + versioned vault format.           ║
║            File: docs/tickets/T-001-argon2id-kdf.md  (full scope + acceptance)       ║
║                                                                                      ║
║            THREE crypto providers to spike before locking one in. Add a              ║
║            comparison table to the PR description:                                   ║
║              (a) react-native-libsodium       native crypto_pwhash (Argon2id)        ║
║              (b) react-native-themis          Apache-2.0; vendorable                 ║
║              (c) sodium-browserify-tweetnacl + pbkdf2   pure-JS stepping stone       ║
║                                                                                      ║
║  BACKLOG (do NOT start without Supervisor sign-off)                                  ║
║    T-002  persist contacts          (vault-encrypted local store; precond for T-003) ║
║    T-003  SAS verification UX       (depends on T-002)                               ║
║    T-004  Android secure-shell      (FLAG_SECURE + blind-compose; Phase 3)           ║
║    T-005  persist conversations     (depends on T-001 + T-002)                       ║
║    T-006  Tor / onion transport     (Phase 8 spike)                                  ║
║                                                                                      ║
║  HARD RULES — VIOLATIONS BLOCK MERGE                                                 ║
║    I1   Every network call goes through lib/relay.ts and through assertFaraday().    ║
║         Direct fetch() / supabase.from() outside lib/relay.ts = REJECTED.            ║
║    I3   public.envelopes columns are FROZEN at:                                      ║
║           recipient_pubkey, ciphertext, ephemeral_pubkey, bucket, created_at         ║
║         Adding a sender column = REJECTED.                                           ║
║    I6   sealEnvelope() generates a fresh ephemeral keypair every call.               ║
║         Caching for "performance" = REJECTED.                                        ║
║    I7   Private keys live ONLY inside the secretbox-encrypted vault blob.            ║
║         Plaintext writes of box_sk / sign_sk anywhere = REJECTED.                    ║
║    I10  panicWipe() deletes BOTH salt key AND blob key. Partial wipe creates a       ║
║         key-recovery oracle = REJECTED.                                              ║
║    I12  Decrypt failure drops silently. console.log of ciphertext / failed           ║
║         envelope / addressing material = REJECTED.                                   ║
║    I14  No reference to service_role / SERVICE_ROLE under app/ or lib/.              ║
║         Anon key only in the client bundle.                                          ║
║    I15  supabase/schema.sql stays idempotent. Non-idempotent change goes to          ║
║         supabase/migrations/NNNN_*.sql.                                              ║
║                                                                                      ║
║    Build rule:  EXPO_PUBLIC_FARADAY_MODE = "true" in EVERY release profile.          ║
║                 Shipping "false" = release-blocking incident.                        ║
║                                                                                      ║
║  WORKFLOW PER TICKET                                                                 ║
║    ready  → coding    re-read ticket cold; read every cross-referenced invariant;    ║
║                       branch  T-NNN-<short-slug>                                     ║
║    coding → review    npm run typecheck passes                                       ║
║                       test vectors for crypto / simulator coverage for transport     ║
║                       idempotent schema rerun (if applicable)                        ║
║                       docs updated in the SAME commit as the code change             ║
║                       PR description names the ticket id, lists invariants           ║
║                         touched, lists threat-model implication                      ║
║                       no service_role refs, no console.log of secrets                ║
║    blocked            comment on the ticket; do NOT silently re-scope                ║
║                                                                                      ║
║  DESIGN REFERENCES — READ-ONLY SISTER REPOS (do NOT vendor unless noted)             ║
║    stingray/adamant-im/        GPL-3     primary architectural twin (vite + ts)      ║
║    stingray/session-android/   GPL-3     pubkey-only ID + onion routing prior art    ║
║    stingray/themis/            Apache    THE ONLY repo you may vendor                ║
║    stingray/tfc/               GPL-3     threat-model gold standard                  ║
║    stingray/threema-android/   AGPL-3    UX patterns (Android)                       ║
║    stingray/threema-ios/       AGPL-3    UX patterns (iOS) + Keychain integration    ║
║    Full per-repo what-to-lift list: docs/asc11_handover.md §Design references        ║
║                                                                                      ║
║  ESCALATE TO SUPERVISOR (then Diagnostics if Supervisor unreachable) IF              ║
║    - The ticket cannot be done without weakening an invariant                        ║
║    - The ticket needs a relay-schema column not in the frozen set (I3)               ║
║    - You discover a doc / code drift that affects another ticket                     ║
║    - You hit a license question (anything AGPL-adjacent)                             ║
║    - You hit a Faraday-gate edge case the docs don't classify                        ║
║                                                                                      ║
║  FIRST ACTIONS                                                                       ║
║    1. Read all 10 docs in READ-FIRST ORDER above. Do not start coding yet.           ║
║    2. Open docs/tickets/T-001-argon2id-kdf.md. Tick the "ready → coding" boxes       ║
║       only AFTER you have actually done each one.                                    ║
║    3. Spike the three crypto-provider options against the acceptance criteria        ║
║       (bundle size, install path, EAS-build requirement, audit history).             ║
║    4. Branch  T-001-argon2id-kdf .  Begin implementation.                            ║
║                                                                                      ║
║  CONFIRMATION REQUESTED                                                              ║
║    Reply with exactly:                                                               ║
║      "Coder online. Read [list of 10 docs]. Picking up T-001.                        ║
║       Spike plan: <2–3 sentences naming which provider you'll evaluate first         ║
║       and the acceptance criterion you'll measure against>."                         ║
║                                                                                      ║
╚══════════════════════════════════════════════════════════════════════════════════════╝
```
