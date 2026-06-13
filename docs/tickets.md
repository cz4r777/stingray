# Tickets — Handover Flow Between Supervisor And Coder

> This file defines **the ticket lifecycle** and indexes the active backlog.
> Each ticket is a markdown file in [`docs/tickets/`](tickets/) following [`_template.md`](tickets/_template.md).
> The format is intentionally close to a real bug tracker so the project can graduate to GitHub Issues / Linear without rework — but the source of truth stays in the repo.

Related docs:

- [framework.md](framework.md) = what we are building
- [workflow.md](workflow.md) = which phase each ticket belongs to
- [pipeline.md](pipeline.md) = the per-change Coder → Reviewer → Ops discipline a ticket is executed under
- [coder_batch_mode.md](coder_batch_mode.md) = how multiple linked tickets may be executed in one bounded Coder run
- [invariants.md](invariants.md) / [threat_model.md](threat_model.md) = constraints every ticket must respect

## Alpha-stage operating rule

Until alpha is complete, tickets should not sit idle once the Supervisor has handed them off.

Default lane:

- **Supervisor → Coder → Diagnostics**

Practical effect:

- once a ticket is `ready` and assigned, the expectation is immediate movement into `coding`
- Diagnostics performs the default post-coding check and writes findings back into the ticket / handover trail
- a separate `review` pass is optional during alpha unless the Supervisor explicitly requests it or the change class is high-risk

Ticket states remain the same so history stays readable, but the working bias is to keep execution flowing.

---

## States

A ticket moves through a fixed set of states. Skipping a state is never allowed; an attempt to do so is a ticket bug and gets sent back.

| State | Owner | Meaning |
|---|---|---|
| `scoping` | Supervisor | Drafted but not yet ready to hand to a Coder. May change shape. |
| `ready` | Supervisor | Scope is frozen. Acceptance criteria, invariants, and threat-model implication are written. Awaiting a Coder. |
| `coding` | Coder | Implementation in progress on a feature branch. |
| `review` | Reviewer | PR open. The Coder may NOT be the Reviewer (even when the same human plays both roles, the passes are separate — see [pipeline.md §Roles](pipeline.md)). |
| `staging` | Ops | Merged. Deployed to the staging relay and the EAS preview channel. Smoke test in progress. |
| `prod` | Ops | Promoted to prod relay + prod EAS channel. Monitoring window open. |
| `done` | Supervisor | Closed. Monitoring window expired without incident. |
| `blocked` | (whoever last touched it) | Cannot proceed. Reason MUST name what unblocks it. |
| `abandoned` | Supervisor | Closed without shipping. Reason MUST explain why. |

---

## Flow

```
            ┌─────────────────────────────────────────────────────┐
            │                                                     │
            ▼                                                     │
    ┌──────────────┐                                              │
    │   scoping    │ ◄─── Supervisor drafts; threat-model entry   │
    └──────┬───────┘      noted; invariants listed.               │
           │                                                      │
           │ Supervisor: "Scope frozen. Hand to Coder."           │
           ▼                                                      │
    ┌──────────────┐                                              │
    │    ready     │                                              │
    └──────┬───────┘                                              │
           │ Coder picks up ticket, branches, starts work.        │
           ▼                                                      │
    ┌──────────────┐    ┌────────────┐                            │
    │    coding    │───►│  blocked   │── (unblocked) ─────────────┤
    └──────┬───────┘    └────────────┘                            │
           │ Coder opens PR, references ticket id in description. │
           ▼                                                      │
    ┌──────────────┐                                              │
    │    review    │ ◄─── Reviewer reads against pipeline.md      │
    └──────┬───────┘      §Stage 4 checklist. Sends back to       │
           │              `coding` on a block; never approves     │
           │              their own diff.                         │
           │                                                      │
           ▼                                                      │
    ┌──────────────┐                                              │
    │   staging    │ ◄─── Ops applies schema + ships preview      │
    └──────┬───────┘      build. Smoke test, including Faraday    │
           │              banner behaviour and at least one       │
           │              non-happy path.                         │
           ▼                                                      │
    ┌──────────────┐                                              │
    │     prod     │ ◄─── Ops applies schema + ships production   │
    └──────┬───────┘      build. 24h monitoring window opens.     │
           │                                                      │
           ▼                                                      │
    ┌──────────────┐                                              │
    │     done     │      Supervisor closes after 24h clean       │
    └──────────────┘      monitor.                                │
                                                                  │
   ── abandoned ◄─── (from any state, supervisor-only) ───────────┘
```

---

## Handover gates

A state transition is allowed only when the prior state's gate passes. Each gate is a checklist; the ticket file embeds it. Skipping an item is a ticket bug.

### `scoping → ready` (Supervisor signs off)

- [ ] Title describes the change in 1 line
- [ ] Phase number from [workflow.md](workflow.md) is set
- [ ] `invariants_touched` lists every invariant the change interacts with — adding, weakening, or relying on
- [ ] `threat_model_section` names the [threat_model.md](threat_model.md) section this change affects
- [ ] Acceptance criteria are testable from outside the diff
- [ ] Out-of-scope items are listed (prevents scope creep mid-coding)
- [ ] If the change touches the relay schema or `envelopes` columns: explicit supervisor sign-off (this is the most metadata-sensitive surface)

### `ready → coding` (Coder picks up)

- [ ] Coder has re-read the ticket cold (not from supervisor's verbal summary)
- [ ] Coder has read every doc cross-referenced in `invariants_touched`
- [ ] Branch name follows `T-NNN-short-slug` (matches the ticket id)
- [ ] If this is an AI Coder, the supervisor knows it (per [pipeline.md §How AI assistants fit in](pipeline.md))

### `coding → review` (Coder opens PR)

- [ ] `npm run typecheck` passes
- [ ] For crypto/transport/vault changes: test vectors or simulator coverage attached to the PR
- [ ] For schema changes: idempotent re-run verified locally ([INVARIANT I15](invariants.md))
- [ ] Docs updated in the SAME commit as the code that changes their meaning
- [ ] The PR description names the ticket id and links it
- [ ] No `console.log` near `openEnvelope`, `sendEnvelope`, or vault material ([INVARIANT I12](invariants.md))
- [ ] No reference to `service_role` outside `supabase/` ops scripts ([INVARIANT I14](invariants.md))

### `review → staging` (Reviewer approves, Ops takes over)

- [ ] Every item in [pipeline.md §Stage 4 checklist](pipeline.md) marked
- [ ] Threat-model implication acknowledged in the PR description
- [ ] No drive-by refactors of unrelated screens
- [ ] If the ticket touched the relay schema, the migration is staged BEFORE the client change goes out (or vice versa — see [forbidden_patterns.md C3](forbidden_patterns.md))

### `staging → prod` (Ops promotes)

- [ ] Smoke test on TestFlight / Play Internal Track — happy path
- [ ] Smoke test on TestFlight / Play Internal Track — at least one Faraday-block toggle, confirming the banner appears
- [ ] No regression on enroll → lock → unlock → wipe → enroll-again
- [ ] No new outbound network destinations beyond the relay URL (asserted via build log) — protects [forbidden_patterns.md B6.2](forbidden_patterns.md)

### `prod → done` (Supervisor closes)

- [ ] 24h since prod deploy without an incident written to [forbidden_patterns.md §A](forbidden_patterns.md)
- [ ] Relay row-count daily check is normal (close to zero with ack-delete working)
- [ ] No user-reported regression

---

## How to use this doc

**As Supervisor:**
1. Copy [`tickets/_template.md`](tickets/_template.md) to `tickets/T-NNN-short-slug.md`.
2. Allocate the next sequential id; never reuse retired ids.
3. Fill the front-matter and the body. Leave `state: scoping`.
4. Walk the `scoping → ready` gate. When all boxes tick, set `state: ready` and add the ticket to the **Active backlog** table below.
5. Hand to a Coder by setting `owner_coder` to their handle.

**As Coder:**
1. Pull the ticket. Re-read it cold.
2. Walk the `ready → coding` gate. Flip `state: coding`.
3. Branch as `T-NNN-short-slug`. Write the code per the ticket's `Scope (what's in)`.
4. When ready, walk the `coding → review` gate. Open the PR. Flip `state: review`.

**As Supervisor assigning a batch:**
1. Pick 2-4 tightly related tickets that satisfy [coder_batch_mode.md](coder_batch_mode.md).
2. Preserve ticket order by dependency.
3. Hand the Coder one bounded batch with explicit stop conditions.
4. Require the Coder to report progress per ticket even though the run is shared.

**As Reviewer:**
1. Read the PR against [pipeline.md §Stage 4 checklist](pipeline.md) WITHOUT the author present.
2. If anything blocks, return with comments + flip `state: coding`.
3. If everything passes, approve and flip `state: staging`.

**As Ops:**
1. Walk the `review → staging` gate, then deploy to staging.
2. Walk `staging → prod` gate, then promote.
3. Open the 24h monitoring window. Flip `state: prod`.

**As Supervisor (closing):**
1. After 24h of clean monitoring, walk `prod → done`. Flip `state: done`.
2. If an incident occurred, write it to [forbidden_patterns.md §A](forbidden_patterns.md) and decide whether the ticket gets reopened or a new ticket is filed.

---

## Active backlog

Sorted by phase from [workflow.md](workflow.md), then by id.

| Id | Phase | State | Title | Coder |
|---|---|---|---|---|
| [T-001](tickets/T-001-argon2id-kdf.md) | 1 | `ready` | Replace placeholder KDF with Argon2id (versioned vault format) | unassigned |
| [T-002](tickets/T-002-persist-contacts.md) | 2 | `coding` | Persist contacts (encrypted, vault-keyed) with SAS state | Claude (Coder) |
| [T-003](tickets/T-003-sas-verification-ux.md) | 2 | `scoping` | SAS verification UX: padlock states + media refusal until verified | — |
| [T-004](tickets/T-004-android-secure-shell.md) | 3 | `scoping` | Android secure-shell: screenshot block, app-switcher shielding, blind-compose | — |
| [T-005](tickets/T-005-persist-conversations.md) | (cross-cutting) | `scoping` | Persist conversations + messages in vault-encrypted local store | — |
| [T-006](tickets/T-006-tor-onion-transport.md) | 8 | `scoping` | Optional Tor / onion-routed transport (high-threat mode) | — |

## Archived

Empty in v0. As tickets reach `done` or `abandoned`, move them out of the Active table and into:

| Id | Phase | Closed | Title | Outcome |
|---|---|---|---|---|

---

## Conventions

- **Ids are monotonic.** `T-001`, `T-002`, ... — never reused, never renumbered. A retired ticket's file may be deleted, but the id is dead.
- **One ticket = one branch.** Stacked PRs are fine; one PR cherry-picking from three tickets is not.
- **One batch = 2-4 linked tickets max.** Batch rules live in [coder_batch_mode.md](coder_batch_mode.md). A batch is one Coder run, not one vague mega-ticket.
- **No verbal scope.** If it isn't in the ticket file, it isn't in scope. Scope changes go through `scoping` again.
- **A failed gate is a state regression.** A ticket at `review` whose Reviewer says "no" flips back to `coding`, not to `ready`. The ticket stays "alive" through the rework.
- **Incident-driven tickets** (post-mortem of a [forbidden_patterns.md §A](forbidden_patterns.md) entry) carry a `incident_ref` field in the front-matter naming the §A id they remediate.
