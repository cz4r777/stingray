# stingray Docs — Externalized Product And Engineering Memory

These files exist so critical knowledge does NOT live in conversational memory or model state. They are the durable substrate for stingray's product design, threat model, engineering rules, and build process.

Pattern follows a docs-first discipline used on prior internal projects, retargeted here to a security product.

## Current operating mode

Until the alpha stage is complete, stingray is running in a temporary high-throughput mode:

- **Supervisor → Coder → Diagnostics** is the default lane
- once the Supervisor assigns work, the default bias is to proceed directly to coding
- Diagnostics performs the default post-coding audit / acceptance walk
- the fuller multi-role workflow will be re-evaluated after alpha

## What's in here

| File | Purpose | When to read |
|---|---|---|
| [framework.md](framework.md) | Product framework: what the app is, design pillars, encryption posture, refused features | Before scope or feature decisions |
| [workflow.md](workflow.md) | Product work order: what to build next and in what sequence | Before planning or prioritizing work |
| [architecture.md](architecture.md) | System shape: client, vault, relay, transport gate, deployment topology | Onboarding; before any structural change |
| [api_contracts.md](api_contracts.md) | Every table, RPC, channel, envelope field on the relay surface | Before refactoring or adding callers |
| [invariants.md](invariants.md) | Rules the code must NEVER violate (no cellular, no plaintext server-side, no metadata leakage, key-handling) | Before review; whenever a guard is touched |
| [security_rules.md](security_rules.md) | Secrets, `.env`, key handling, vault rules, what must never leak | Before a deploy; before adding logging |
| [forbidden_patterns.md](forbidden_patterns.md) | Known surveillance and crypto-app failure modes + architectural anti-patterns | Before writing crypto, transport, vault, or relay code |
| [threat_model.md](threat_model.md) | Adversary model: stingray/IMSI catcher, hostile relay, hostile device, observers | Before adding any network or storage feature |
| [pipeline.md](pipeline.md) | Engineering pipeline: schema/code → test → review → deploy | Before any change to schema, vault, transport, or relay |
| [deployment.md](deployment.md) | End-to-end deploy runbook (environments, secrets, build, submission, rollback) | Before any deploy; first-time setup for each environment |
| [tickets.md](tickets.md) | Ticket lifecycle (Supervisor → Coder → Reviewer → Ops) and the active backlog under [tickets/](tickets/) | Before picking up work; before opening a PR; whenever the state of a ticket changes |
| [roles.md](roles.md) | Canonical charter for the five roles (Supervisor / Coder / Reviewer / Ops / Diagnostics) including authority limits and escalation paths | Before assuming or transferring a role; whenever a handover block is written |
| [coder_batch_mode.md](coder_batch_mode.md) | Multi-ticket autonomy protocol for bounded Coder batches (2-4 linked tickets, stop conditions, checkpoints) | Before assigning or accepting a multi-ticket implementation run |

## Additional proposals

These are design proposals, not current-scope guarantees.

| File | Purpose |
|---|---|
| [android_secure_shell_mode.md](android_secure_shell_mode.md) | Proposal for Android full-screen secure shell, screen-capture hardening, overlay resistance, and dedicated-device mode |

## Authoring rules

1. **Code is not the source of truth — these docs are.** When the code drifts, fix the code (or update the doc if the threat model has genuinely changed). Don't let the doc rot silently.
2. **Each rule names the file (and ideally line) where it lives.** A rule with no enforcement reference is a wish, not an invariant.
3. **Production incidents go in `forbidden_patterns.md`** with symptom + cause + fix. Durable forensic memory.
4. **Update on every architectural change** — new transport, new relay surface, new key type, new vault format.
5. **Keep the four layers separate.**
   - `framework.md` = design intent
   - `workflow.md` = build order
   - `pipeline.md` = engineering execution discipline
   - `threat_model.md` = what we are defending against
6. **Invariants are numbered (I1, I2, …) and referenced by number in schema comments and code.** This is how docs and code stay tethered.

## Canonical scope

`v0` — Expo + opaque-relay (Supabase) + offline-store-and-forward over Wi-Fi/Ethernet only. No live P2P (WebRTC) yet, no multi-device, no group chat, no media attachments.

When any of these change, update [architecture.md](architecture.md) `## Current scope` first, then propagate.
