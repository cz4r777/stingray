# Roles — Who Does What

> This file is the durable charter for the five roles in stingray's working
> protocol. Every ticket, PR, handover, and incident response references these
> roles by name; this is the canonical definition. If [pipeline.md](pipeline.md)
> §Roles ever drifts from this file, **this file wins** — patch pipeline.md, not
> the other way around.

---

## Why five roles, not four

The original four-role split (Supervisor / Coder / Reviewer / Ops) is borrowed from prior internal projects that ran the same docs-first discipline. stingray adds a fifth role — **Diagnostics & Testing** — because the product's safety-critical surfaces (crypto, transport gate, vault) demand a verification voice that:

- is reachable inside the same chat session as the Coder (an AI assistant typically),
- can run checks, smoke tests, and grep audits without waiting for the human Supervisor,
- can stand in for the Supervisor on low-stakes architectural calls so the Coder is never blocked.

Diagnostics is **not a fifth set of approvals** in the change pipeline. The six-stage pipeline ([pipeline.md](pipeline.md) §Stages) is unchanged. Diagnostics is an *advisory* role attached sideways: Coders consult it; Supervisors delegate to it; Reviewers may borrow its outputs.

## Alpha-stage operating override

Until alpha is declared complete, stingray runs with a temporary throughput-first lane:

- **Supervisor → Coder → Diagnostics**
- once the Supervisor hands off a ticket or batch, the default action is to proceed directly to coding
- Diagnostics performs the default post-coding audit and acceptance-criteria walk
- a separate Reviewer pass is optional during alpha and is invoked when the Supervisor asks for it or when risk justifies it
- Ops still exists for installs, builds, device smoke, staging, and deploy concerns, but is not the day-to-day handoff lane for every ticket during alpha

This override does **not** weaken:

- invariants
- the threat model
- stop conditions for risky work
- the Supervisor's authority

After alpha, the workflow is reviewed again.

---

## The five roles

### 1. Supervisor / Architect

**Who:** the human running the project (currently the founder; transferable).

**What they do:**

- Scope tickets and sign off `scoping → ready`.
- Own every doc under `docs/`. Doc changes go through them.
- Make final go/no-go calls on schema changes ([INVARIANT I3](invariants.md)), invariant changes, and threat-model amendments.
- Close `prod → done` after the 24h monitoring window.
- Select outside cryptographer for the [threat_model.md](threat_model.md) review before any external launch.

**What they don't do:**

- Write every line of code.
- Approve their own diff (Reviewer pass is separate, even when the same human wears both hats).
- Run smoke tests in lieu of Diagnostics.

**Authority limits:**

- Cannot silently weaken an invariant. Weakenings must be flagged in the PR description.
- Cannot bypass the Reviewer step "because it's a small change". The change-control discipline is the discipline.

### 2. Coder

**Who:** a human contributor or an AI assistant (Claude, Cursor, etc.). When the Coder is an AI, the Supervisor MUST know it ([pipeline.md §How AI assistants fit in](pipeline.md)).

**What they do:**

- Implement tickets in `ready` state.
- When explicitly authorized, implement a bounded multi-ticket batch per [coder_batch_mode.md](coder_batch_mode.md).
- Branch as `T-NNN-<short-slug>`.
- Write code, tests, and doc updates in the same commit.
- Walk the `ready → coding` and `coding → review` gates from [tickets.md](tickets.md).
- Open the PR; reference the ticket id in the description.

**What they don't do:**

- Approve their own diff.
- Drive-by-refactor files unrelated to the ticket.
- Silently add new invariants. New invariants are *proposed* in [invariants.md](invariants.md) and need Supervisor sign-off.
- Skip test vectors on crypto changes or simulator coverage on transport changes — those are reviewable-blocking omissions.

**Authority limits:**

- Cannot decide which invariant applies in an ambiguous case — escalate to Supervisor (or Diagnostics if Supervisor unreachable).
- Cannot weaken an invariant. Weakenings need a separate doc-change PR.
- Cannot expand a batch beyond the Supervisor-authorized ticket list. Batch rules live in [coder_batch_mode.md](coder_batch_mode.md).

### 3. Reviewer

**Who:** a separate human pass (or a separate Claude session). The Coder and Reviewer MAY be the same person, but the passes MUST be distinct mental states.

**What they do:**

- Read the diff cold against [pipeline.md §Stage 4 checklist](pipeline.md) a–k.
- Block on auto-block items (a–h); flag on judgment items (i–k).
- Verify docs were updated in the same commit as the code that changes their meaning.
- Verify the PR description names the ticket id, lists invariants touched, and notes the threat-model implication.

**What they don't do:**

- Write code in the same pass as the review.
- Approve their own diff.
- Treat the checklist as a suggestion — every item is read in order, and failing earlier checks blocks later ones.

**Authority limits:**

- Cannot relax the checklist. Adding new items is fine; removing them needs a doc-change PR.

### 4. Ops

**Who:** the human deploying. In the solo-dev case, the same person as Supervisor — but in distinct passes.

**What they do:**

- Apply schema changes to staging, then prod, per [deployment.md](deployment.md).
- Push client builds via `eas update` (OTA) or `eas build` + store submission.
- Smoke-test the deployed change on a real Wi-Fi network, including a Faraday-gate toggle.
- Maintain the relay: daily `expire_stale_envelopes()` cron, weekly Supabase log review.
- Triage incidents; write them to [forbidden_patterns.md §A](forbidden_patterns.md) within 24h of detection.

**What they don't do:**

- Invent infra changes ad-hoc. Infra changes are tickets that go through the full pipeline.
- Modify schema directly in prod without staging first.
- Skip the staging deploy because "it's a small change".

**Authority limits:**

- Cannot ship a build with `EXPO_PUBLIC_FARADAY_MODE=false`. This is a release-blocking incident, full stop.
- Cannot ship a binary with new outbound network destinations not present in the build log baseline.

### 5. Diagnostics & Testing

**Who:** Claude (this thread or a successor session). One Claude instance is enough; do not run multiple in parallel against the same tree without coordinating, or you will get conflicting reports.

**What they do (primary — Diagnostics):**

- Verify state: read files on request and report what's there.
- Smoke-test new code against ticket acceptance criteria.
- Hunt invariant drift: grep + read audits for patterns that should not appear (`service_role` in `app/` or `lib/`, `console.log` near crypto, fetch() outside `lib/relay.ts`, etc.).
- Walk the `coding → review` gate from the Coder's perspective and report any items the Coder may have ticked prematurely.
- Run typecheck on request and surface failures with context.

**What they do (secondary — Supervisor backup):**

- Stand in for the Supervisor on low-stakes calls when the Supervisor is unreachable:
  - draft new tickets for the Supervisor to ratify
  - update docs that don't change invariants or the threat model
  - answer Coder questions about which doc applies
- Always leave a paper trail (file edit + summary) so the Supervisor can ratify on return.

**What they don't do:**

- Write feature code. That's the Coder's job. If Diagnostics writes code, it must be either (a) a test file, (b) a doc, or (c) explicitly delegated by the Supervisor and labelled as such.
- Make final go/no-go calls on invariant changes when the Supervisor is reachable.
- Approve a PR. Diagnostics provides input; the Reviewer approves.
- Modify [invariants.md](invariants.md), [threat_model.md](threat_model.md), or [forbidden_patterns.md §A](forbidden_patterns.md) without Supervisor sign-off (those are Supervisor-only files).

**Authority limits:**

- The Supervisor outranks Diagnostics on every decision when the Supervisor is reachable.
- Diagnostics CAN refuse a Coder's request that would violate an invariant — refusal is reported up to the Supervisor immediately, not silently.

---

## Chain of command (in order of precedence)

```
                        ┌──────────────────────┐
                        │  Supervisor / Arch    │   ◄── final authority
                        └──────────┬───────────┘
                                   │
                ┌──────────────────┼──────────────────┐
                ▼                  ▼                  ▼
        ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
        │     Coder    │   │   Reviewer   │   │      Ops     │
        │ implements   │   │ approves/    │   │  deploys +   │
        │ tickets      │   │ blocks       │   │ monitors     │
        └──────────────┘   └──────────────┘   └──────────────┘
                │                                    │
                └────────────────┬───────────────────┘
                                 ▼
                        ┌──────────────────────┐
                        │   Diagnostics &       │   ◄── advisory, sideways
                        │   Testing  (backup)   │      reachable in-session
                        └──────────────────────┘
```

When the Supervisor is unreachable, Diagnostics steps up one notch for the duration. A "paper trail" — file edits + summary written to the relevant doc — must be left so the Supervisor can ratify on return.

---

## When to escalate, to whom

| Situation | Escalate to |
|---|---|
| Coder needs an invariant interpreted in an ambiguous case | Supervisor first, Diagnostics if unreachable |
| Coder finds a schema change needed beyond the frozen `envelopes` columns | Supervisor — non-delegable |
| Coder hits a test failure on a crypto change | Diagnostics first (cheap check); Supervisor if Diagnostics suspects an invariant issue |
| Doc / code drift discovered mid-ticket | Diagnostics writes the doc fix; Supervisor ratifies |
| Production incident | Ops triages + rolls back if needed; Supervisor writes §A entry; Diagnostics may help draft |
| AGPL-licensing question (vendoring threema-* code) | Supervisor — non-delegable |
| Bundle-size concern from a dependency | Diagnostics measures and reports; Supervisor decides |
| Reviewer marks "FLAG" on a soft-block item (i–k) | Coder + Supervisor jointly decide |

---

## Role transitions

There are two transition shapes and both leave a paper trail in [handover_archive/](handover_archive/).

### Shape 1 — A role changes hands (new Supervisor / Coder / Ops session)

1. The departing role-holder writes a **handover block** in ASCII-bordered single-block format. Templates and canonical examples live in [handover_archive/](handover_archive/).
2. The handover block lists: read-first doc order, current sprint state, hard rules they own, outstanding decisions, the role's authority limits, and a confirmation phrase the receiving party uses as a tripwire.
3. The receiving party replies with the confirmation phrase verbatim. Anything else means the docs were not read; the previous role-holder is still on the hook.
4. The block is committed to [handover_archive/](handover_archive/) as `YYYY-MM-DD-<role>-handover.md` and added to the archive index in the same commit.

Canonical examples already in the archive:
- [handover_archive/2026-05-20-coder-handover.md](handover_archive/2026-05-20-coder-handover.md)
- [handover_archive/2026-05-20-supervisor-handover.md](handover_archive/2026-05-20-supervisor-handover.md)

### Shape 2 — Supervisor returns after a "Supervisor unreachable" period

During the absence, Diagnostics may have acted as Supervisor backup ([§5 above](#5-diagnostics--testing)). On return, the Supervisor MUST ratify every action.

1. Within 24h of returning, the Supervisor copies [handover_archive/_ratification_template.md](handover_archive/_ratification_template.md) to `handover_archive/YYYY-MM-DD-ratification-diagnostics.md`.
2. Each interim action gets a verdict: **RATIFIED**, **REVERTED**, **DEFERRED**, or **ESCALATED** (definitions in the template).
3. The Supervisor walks the Section 2 invariant audit — any silent invariant weakening becomes both a REVERT in Section 1 AND a near-miss entry in [forbidden_patterns.md §A](forbidden_patterns.md).
4. The ratification file is committed to the archive and added to the index in the same commit.

A ratification entry is required even if Diagnostics took zero actions during the absence. The Supervisor-return *event* is the trigger; the count of actions is the body.

---

## Relationship to other docs

- [framework.md](framework.md) — what we are building (Supervisor owns)
- [workflow.md](workflow.md) — what order we build it in (Supervisor owns)
- [pipeline.md](pipeline.md) — how each change moves safely (Supervisor + Reviewer own; this file's §Roles table mirrors `roles.md` and must stay in sync)
- [tickets.md](tickets.md) — lifecycle + backlog (Supervisor + Coder operate here daily)
- [coder_batch_mode.md](coder_batch_mode.md) — how the Supervisor may authorize 2-4 linked tickets as one bounded Coder run
- [threat_model.md](threat_model.md) — the adversary every change is measured against (Supervisor owns; outside cryptographer reviews)
- [invariants.md](invariants.md) — rules code must NEVER violate (Supervisor owns; numbered; never silently weakened)
- [forbidden_patterns.md](forbidden_patterns.md) §A — production incidents (Supervisor writes; Ops feeds in)
- [forbidden_patterns.md](forbidden_patterns.md) §B — anti-patterns (Supervisor + Reviewer maintain)
