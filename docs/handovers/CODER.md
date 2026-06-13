# Coder handover — copy-paste this into a fresh Claude session

```
╔══════════════════════════════════════════════════════════════════════════════════════╗
║  CODER HANDOVER — STINGRAY                                                           ║
║  Repo:    C:\Users\z\Desktop\code\stingray                                           ║
║  Date:    2026-05-20    State: v0 scaffold, 6 tickets in backlog, T-001 ready        ║
╠══════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                      ║
║  WHO IS WHO                                                                          ║
║    Supervisor       a separate Claude session — owns scope, freezes tickets,         ║
║                     signs go/no-go, owns the durable docs                            ║
║    YOU (Coder)      this session — implement tickets, open PRs                       ║
║    Diagnostics      a separate Claude session — runs all verification, plays         ║
║                     Reviewer in pipeline §Stage 4, maintains ticket files, acts      ║
║                     as Supervisor backup                                             ║
║    Ops              the human Operator — applies schema, runs eas/git commands       ║
║                                                                                      ║
║    YOU NEVER:                                                                        ║
║      - approve your own diff (Diagnostics does that)                                 ║
║      - skip a docs read because the Supervisor "told you in chat"                    ║
║      - run schema migrations or eas deploys (Ops territory)                          ║
║      - silently weaken an invariant (escalate to Supervisor first)                   ║
║      - touch a ticket in state "scoping" — only "ready" tickets are yours            ║
║                                                                                      ║
║  MISSION (one sentence)                                                              ║
║    End-to-end-encrypted P2P messenger that REFUSES to transmit on the cellular       ║
║    radio so an IMSI catcher ("stingray") cannot intercept anything.                  ║
║    Wi-Fi / Ethernet / attested VPN-over-Wi-Fi only.                                  ║
║                                                                                      ║
║  READ-FIRST ORDER  (sequence matters; do not skip)                                   ║
║    1. docs/framework.md          mission, pillars, refused features                  ║
║    2. docs/threat_model.md       the adversary (cellular MITM + hostile relay)       ║
║    3. docs/invariants.md         I1–I15 — RULES THE CODE MUST NEVER VIOLATE          ║
║    4. docs/forbidden_patterns.md failure modes — check before any diff               ║
║    5. docs/api_contracts.md      what the relay actually stores                      ║
║    6. docs/architecture.md       v0 scope + file layout                              ║
║    7. docs/pipeline.md           your Coder-pass discipline (Stage 2–3)              ║
║    8. docs/tickets.md            ticket lifecycle + the current backlog              ║
║    9. docs/asc11_handover.md     §Design references — 6 read-only sister repos       ║
║                                                                                      ║
║  CURRENT BACKLOG  (touch in this order unless Supervisor overrides)                  ║
║    T-001  ready      Argon2id KDF + versioned vault format         (Phase 1)         ║
║    T-002  ready      Persist contacts (vault-encrypted)            (Phase 2)         ║
║    T-003  scoping    SAS verification UX                           (Phase 2)         ║
║    T-004  scoping    Android secure-shell                          (Phase 3)         ║
║    T-005  scoping    Persist conversations (vault-encrypted)       (cross-cutting)   ║
║    T-006  scoping    Tor / onion transport spike                   (Phase 8)         ║
║                                                                                      ║
║  YOUR FIRST TICKET                                                                   ║
║    T-001 — docs/tickets/T-001-argon2id-kdf.md                                        ║
║    Spike three crypto providers before locking one in:                               ║
║      (a) react-native-libsodium    native crypto_pwhash (Argon2id)                   ║
║      (b) react-native-themis       Apache-2.0; only vendorable reference             ║
║      (c) sodium-browserify-tweetnacl + pbkdf2   pure-JS stepping stone               ║
║    Put a comparison table in the PR description before settling.                     ║
║                                                                                      ║
║  HARD RULES — VIOLATIONS BLOCK MERGE                                                 ║
║    I1   Every network call goes through lib/relay.ts and assertFaraday().            ║
║    I3   public.envelopes columns FROZEN: recipient_pubkey, ciphertext,               ║
║         ephemeral_pubkey, bucket, created_at.  Adding a sender column = REJECTED.    ║
║    I6   sealEnvelope() generates a fresh ephemeral keypair every call.               ║
║    I7   Private keys live ONLY inside the secretbox-encrypted vault blob.            ║
║    I10  panicWipe() deletes BOTH salt key AND blob key.                              ║
║    I12  Decrypt failure drops silently — no console.log of ciphertext.               ║
║    I14  No service_role refs anywhere under app/ or lib/.                            ║
║    I15  supabase/schema.sql stays idempotent.                                        ║
║    BUILD: EXPO_PUBLIC_FARADAY_MODE = "true" in EVERY release profile.                ║
║                                                                                      ║
║  WORKFLOW PER TICKET                                                                 ║
║    ready  → coding   re-read ticket cold; read every cross-ref invariant;            ║
║                      branch  T-NNN-<short-slug>                                      ║
║    coding → review   npm run typecheck passes                                        ║
║                      test vectors / simulator coverage attached                      ║
║                      idempotent schema rerun (if applicable)                         ║
║                      docs updated in the SAME commit as the code change              ║
║                      PR description names ticket id + invariants touched +           ║
║                        threat-model implication                                      ║
║                      hand off to Diagnostics for Reviewer pass                       ║
║    blocked:          comment on the ticket; tag Supervisor; do NOT re-scope          ║
║                                                                                      ║
║  WHEN YOU HAND BACK A COMPLETED TICKET                                               ║
║    Emit ONE ASCII-bordered block to the Operator containing:                         ║
║      - ticket id                                                                     ║
║      - files changed (paths + line counts only — do NOT paste full diffs)            ║
║      - new invariants proposed (if any) — flagged loudly                             ║
║      - test vectors / simulator runs attached                                        ║
║      - what's still open                                                             ║
║      - "Ready for Diagnostics review pass"                                           ║
║    Operator routes the block to Diagnostics. Diagnostics returns verdict.            ║
║                                                                                      ║
║  ESCALATE TO SUPERVISOR (not Diagnostics) IF                                         ║
║    - The ticket cannot be done without weakening an invariant                        ║
║    - The ticket needs a relay-schema column not in the current frozen set            ║
║    - You find doc / code drift that affects another ticket                           ║
║    - A license question arises (especially AGPL-adjacent)                            ║
║    - The ticket's threat-model section is unclear or contradicts the scope           ║
║                                                                                      ║
║  ESCALATE TO DIAGNOSTICS IF                                                          ║
║    - You need a test vector / reference output and can't generate it                 ║
║    - You suspect a regression in a previously-passing area                           ║
║    - You need a simulator run on a transport state you can't reproduce locally       ║
║    - Supervisor is unavailable and you need an interim go/no-go on scope             ║
║                                                                                      ║
║  DESIGN REFERENCES  (read-only sister repos — DO NOT VENDOR)                         ║
║    adamant-im/        GPL-3    primary architectural twin                            ║
║    session-android/   GPL-3    pubkey-only identity + onion-routed transport         ║
║    themis/            Apache   the ONLY library you may import                       ║
║    tfc/               GPL-3    threat-model gold standard                            ║
║    threema-android/   AGPL-3   contact verification UX patterns                      ║
║    threema-ios/       AGPL-3   iOS Keychain + Notification Extension patterns        ║
║    (full table in docs/asc11_handover.md §Design references)                         ║
║                                                                                      ║
║  CONFIRMATION REQUESTED                                                              ║
║    Reply with EXACTLY:                                                               ║
║      "Coder online. Read [list of 9 docs]. Picking up T-001.                         ║
║       Spike plan: <2–3 sentences naming which provider you'll evaluate first         ║
║       and the acceptance criterion you'll measure against>."                         ║
║    Anything else = docs not read.                                                    ║
║                                                                                      ║
╚══════════════════════════════════════════════════════════════════════════════════════╝
```
