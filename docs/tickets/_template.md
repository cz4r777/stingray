---
id: T-NNN
title: <one-line description of the change>
phase: <number from workflow.md>
state: scoping        # scoping | ready | coding | review | staging | prod | done | blocked | abandoned
owner_supervisor: <handle>
owner_coder: unassigned
created: YYYY-MM-DD
updated: YYYY-MM-DD
invariants_touched: []   # e.g. [I1, I3, I7]
threat_model_section: §  # e.g. §2 (the cellular-tower MITM)
incident_ref:            # optional; set if this ticket remediates a forbidden_patterns.md §A entry
---

# T-NNN — <title>

## Why

What product / threat-model problem this solves. 2–4 sentences. Link to [framework.md](../framework.md) /
[workflow.md](../workflow.md) / [threat_model.md](../threat_model.md) sections as needed.

## Scope (what's in)

A bullet list of the concrete deliverables. Each bullet is a file or behaviour, not a vague goal.

- ...

## Out of scope (what's NOT in)

Things adjacent reviewers will want, that this ticket DOES NOT do. Prevents scope creep mid-coding.

- ...

## Files likely to change

Best guesses; the Coder may discover more. Listed here so the Reviewer can spot a missing surface.

- `lib/...`
- `app/...`
- `docs/...`

## Acceptance criteria

Testable from outside the diff. The Reviewer reads these to decide approve/reject.

- [ ] ...
- [ ] ...

## Risk / threat-model implication

One paragraph. Does the change widen or narrow the threat model? Which invariant
([invariants.md](../invariants.md)) does it lean on?

## Handover checklist

### `scoping → ready` (Supervisor)
- [ ] Title is concrete
- [ ] Phase set
- [ ] `invariants_touched` lists every invariant the change interacts with
- [ ] `threat_model_section` named
- [ ] Acceptance criteria testable from outside the diff
- [ ] Out-of-scope listed
- [ ] If schema/`envelopes` touched: explicit supervisor sign-off

### `ready → coding` (Coder)
- [ ] Ticket re-read cold
- [ ] Cross-referenced docs read
- [ ] Branch `T-NNN-<slug>` created

### `coding → review` (Coder)
- [ ] `npm run typecheck` passes
- [ ] Test vectors / simulator coverage for crypto / transport / vault
- [ ] Idempotent schema re-run verified (if applicable)
- [ ] Docs updated in the same commit
- [ ] No `console.log` near crypto / vault material
- [ ] No `service_role` references outside ops scripts
- [ ] PR description names the ticket id

### `review → staging` (Reviewer)
- [ ] `pipeline.md` §Stage 4 checklist clean
- [ ] Threat-model implication acknowledged
- [ ] No drive-by refactors
- [ ] Schema/client ordering correct

### `staging → prod` (Ops)
- [ ] Happy path smoke tested
- [ ] Faraday banner toggle smoke tested
- [ ] No new outbound destinations in network log

### `prod → done` (Supervisor)
- [ ] 24h since prod deploy with no incident

## Notes

(Optional) anything else the Coder needs.
