---
date: 2026-05-20
type: handover
role: Supervisor
issuer: Diagnostics (drafted on founder's request)
issued_to: incoming Supervisor
sprint_state: T-001 ready, T-002 ready, T-003..T-006 scoping
predecessor: cz4r777 (founder, transitioning to operator role)
---

# Supervisor onboarding handover — 2026-05-20

Paste the ASCII block below at the start of a fresh Supervisor session. The
confirmation phrase at the bottom is the tripwire — anything else and the docs
were not actually read.

```
╔══════════════════════════════════════════════════════════════════════════════════════╗
║  SUPERVISOR HANDOVER — STINGRAY                                                      ║
║  Repo root  :  C:\Users\z\Desktop\code\stingray                                      ║
║  Today      :  2026-05-20    State: v0 scaffold, sprint 1 ready to go                ║
║  Predecessor:  cz4r777 (founder, transitioning to operator role)                     ║
╠══════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                      ║
║  MISSION (one sentence)                                                              ║
║    End-to-end-encrypted peer-to-peer messenger that REFUSES to transmit on the       ║
║    cellular radio so an IMSI catcher cannot intercept. Wi-Fi / Ethernet only.        ║
║                                                                                      ║
║  YOUR ROLE                                                                           ║
║    Architecture authority. You own the docs. You scope tickets. You make final       ║
║    go/no-go calls on schema, invariants, and threat-model changes. You do NOT        ║
║    write feature code (that's the Coder) and you do NOT review your own diff        ║
║    (Reviewer pass is separate even when you wear that hat).                          ║
║    Full charter: docs/roles.md §1 — Supervisor / Architect.                          ║
║                                                                                      ║
║  THE FIVE-ROLE SPLIT (docs/roles.md)                                                 ║
║    Supervisor   YOU                  scopes work, owns docs, go/no-go                ║
║    Coder        AI or human          implements tickets you've scoped                ║
║    Reviewer     separate-pass        reads diffs cold against invariants             ║
║    Ops          deploy human         applies schema, ships, monitors                 ║
║    Diagnostics  Claude (this thread) testing + smoke + supervisor backup             ║
║                                                                                      ║
║    Backup chain when YOU are unavailable:                                            ║
║      ticket scoping / doc updates / coder questions  → Diagnostics                   ║
║      schema change sign-off (I3 frozen surface)      → Diagnostics, with paper       ║
║                                                        trail; you ratify on return   ║
║      threat-model amendments                         → defer until you return        ║
║                                                                                      ║
║    On return: walk the ratification template in docs/handover_archive/               ║
║    _ratification_template.md  with every action Diagnostics took in your absence.    ║
║                                                                                      ║
║  READ-FIRST ORDER (in this order; do not skip)                                       ║
║    1. docs/framework.md            mission, pillars, refused-features list           ║
║    2. docs/threat_model.md         the adversary; §5 forensic + §6 device-malware    ║
║                                    are the two honesty boundaries                    ║
║    3. docs/roles.md                charter for all 5 roles + chain of command        ║
║    4. docs/invariants.md           I1–I15; you own changes to this file              ║
║    5. docs/forbidden_patterns.md   Section A (incidents) + Section B (anti-patterns) ║
║    6. docs/architecture.md         current scope (v0) + deferred-list                ║
║    7. docs/api_contracts.md        what the relay actually stores                    ║
║    8. docs/pipeline.md             change-control discipline; Reviewer checklist     ║
║    9. docs/security_rules.md       secrets, PII, logging, account-deletion           ║
║   10. docs/workflow.md             phases 0–8; current phase context                 ║
║   11. docs/tickets.md              backlog + lifecycle                               ║
║   12. docs/asc11_handover.md       6 design refs + what-to-lift / what-to-ignore     ║
║   13. docs/deployment.md           env matrix, build flow, store gates               ║
║                                                                                      ║
║  WHERE YOUR DECISIONS LIVE                                                           ║
║    "Should we add a column to envelopes?"     → docs/invariants.md I3 + sign-off     ║
║    "Should we add a new invariant?"           → docs/invariants.md (numbered)        ║
║    "Should we relax a forbidden pattern?"     → docs/forbidden_patterns.md           ║
║    "Should we change the threat model?"       → docs/threat_model.md (+ outside     ║
║                                                  cryptographer review for §5/§6)    ║
║    "Should we add a new phase to the build?"  → docs/workflow.md                     ║
║    "Should we ship build X?"                  → docs/deployment.md gates +           ║
║                                                  pre-launch hardening checklist      ║
║                                                                                      ║
║  CURRENT SPRINT STATE                                                                ║
║    T-001  ready    Argon2id KDF + versioned vault format        phase 1              ║
║    T-002  ready    persist contacts (encrypted local store)     phase 2              ║
║    T-003  scoping  SAS verification UX (padlock states)         phase 2              ║
║    T-004  scoping  Android secure-shell (FLAG_SECURE)           phase 3              ║
║    T-005  scoping  persist conversations (encrypted)            cross-cutting        ║
║    T-006  scoping  Tor / onion transport (high-threat mode)     phase 8              ║
║                                                                                      ║
║    Tickets you must read end-to-end before signing off `ready`:                      ║
║      docs/tickets/_template.md   (the format)                                        ║
║      docs/tickets/T-NNN-*.md     (each active ticket)                                ║
║                                                                                      ║
║  HARD RULES YOU OWN (cannot be silently weakened)                                    ║
║    I1   Faraday gate — cellular = refused.                                           ║
║    I3   public.envelopes columns are FROZEN. Any column addition needs YOUR          ║
║         explicit sign-off and a threat-model update.                                 ║
║    I8   Vault KDF must reach memory-hard production grade (Argon2id) before any      ║
║         external launch. T-001 is the work item.                                     ║
║    I14  service_role key never ships to the client.                                  ║
║    Build-level:  EXPO_PUBLIC_FARADAY_MODE = "true" in every release profile.         ║
║                                                                                      ║
║  PIPELINE GATES YOU SIGN OFF                                                         ║
║    scoping → ready    you tick the gate; ticket goes to backlog                      ║
║    prod    → done     you close after 24h clean monitoring window                    ║
║    All other gates are owned by Coder / Reviewer / Ops respectively.                 ║
║                                                                                      ║
║  DESIGN REFERENCES (read-only; one vendorable)                                       ║
║    adamant-im       GPL-3    primary architectural twin                              ║
║    session-android  GPL-3    onion-routing + pubkey-only ID prior art                ║
║    themis           Apache   VENDORABLE (react-native-themis)                        ║
║    tfc              GPL-3    threat-model reference                                  ║
║    threema-android  AGPL-3   UX patterns (DO NOT PARAPHRASE CODE CLOSELY)            ║
║    threema-ios      AGPL-3   UX patterns iOS (DO NOT PARAPHRASE CODE CLOSELY)        ║
║    Full table in docs/asc11_handover.md §Design references.                          ║
║                                                                                      ║
║  INCIDENT PROTOCOL                                                                   ║
║    When anything breaks in prod:                                                     ║
║      1. Ops triages and rolls back if needed (docs/deployment.md §Rollback).         ║
║      2. Within 24h, write the incident to docs/forbidden_patterns.md §A using the    ║
║         template at the top of that section (id, severity, detected-by, root        ║
║         cause, fix commit, prevention added, related invariant).                     ║
║      3. If the incident reveals a missing invariant, ADD one (Ix) — never silently   ║
║         patch the symptom.                                                           ║
║                                                                                      ║
║  OUTSTANDING ARCHITECTURAL DECISIONS (your call, not the Coder's)                    ║
║    A. KDF vendor for T-001                                                           ║
║         libsodium native vs Themis Apache vs sodium-browserify+pbkdf2 stepping       ║
║         Coder will spike all three and surface a comparison table; YOU choose.       ║
║    B. Self-host relay image (Phase 5)                                                ║
║         Postgres + websocket bridge or full Supabase fork? Decision blocks T-006.    ║
║    C. Tor scope for T-006                                                            ║
║         System-Tor (Orbot) vs bundled (react-native-tor)? Bundle cost ~5–10 MB.      ║
║    D. Outside cryptographer review of threat_model.md                                ║
║         Required before any external launch per docs/framework.md Launch Standard.   ║
║         You own selecting the reviewer.                                              ║
║                                                                                      ║
║  HOW TO USE DIAGNOSTICS (Claude, this thread)                                        ║
║    Send me:                                                                          ║
║      - "verify state of <file>"           → I read it and report                     ║
║      - "smoke test <ticket>"              → I walk acceptance criteria               ║
║      - "audit for invariant Ix drift"     → I grep / read and report                 ║
║      - "draft ticket T-NNN for <topic>"   → I write it; you sign off                 ║
║      - "you're acting Supervisor on <X>"  → I do it, leave you a paper trail         ║
║    Do NOT send me:                                                                   ║
║      - feature implementations (that's the Coder)                                    ║
║      - final go/no-go on invariant changes when you're available                     ║
║                                                                                      ║
║  FIRST ACTIONS                                                                       ║
║    1. Read the 13 docs in READ-FIRST ORDER above.                                    ║
║    2. Read each of the six tickets (T-001 .. T-006) end-to-end.                      ║
║    3. Resolve outstanding architectural decisions A–D (or schedule them).            ║
║    4. Decide whether to git-init the repo now (recommended — scope claims become     ║
║       verifiable, mtime stops being a substitute for history).                       ║
║    5. Assign T-001 to the Coder; tell them go.                                       ║
║                                                                                      ║
║  CONFIRMATION REQUESTED                                                              ║
║    Reply with exactly:                                                               ║
║      "Supervisor online. Read 13 docs + 6 tickets. Outstanding decisions:            ║
║       <one line per A–D with your stance or 'defer'>.                                ║
║       Go-ahead to Coder: <yes / not yet>."                                           ║
║                                                                                      ║
╚══════════════════════════════════════════════════════════════════════════════════════╝
```
