---
type: template
purpose: Supervisor ratification of Diagnostics's interim actions during "Supervisor unreachable" period
template_version: 1
---

# Ratification template — Supervisor return from unavailability

> Copy this template to `docs/handover_archive/YYYY-MM-DD-ratification-diagnostics.md` (or
> `-<delegate>.md` if a different role acted as backup). Fill it in within 24h of the
> Supervisor returning. This is the paper trail that closes a "Supervisor unreachable"
> period and converts Diagnostics's interim authority back into mere advisory status.

---

## Header (front-matter)

```yaml
---
date_supervisor_returned: YYYY-MM-DD
supervisor_handle: <e.g. cz4r777>
acting_role: Diagnostics       # or whoever stepped up
acting_from:    YYYY-MM-DD HH:MM  # ISO-ish; when Diagnostics started acting up
acting_until:   YYYY-MM-DD HH:MM  # when Supervisor returned
session_refs:                  # links to handover archive entries or chat refs that
  - <e.g. 2026-05-20-coder-handover.md>
---
```

---

## Section 1 — Actions taken in your absence

One row per discrete action. Each gets a verdict from the returning Supervisor.

```
| # | Action (what)                            | Artefact (where)                   | Verdict        | Notes                                                |
|---|------------------------------------------|------------------------------------|----------------|------------------------------------------------------|
| 1 | Drafted ticket T-NNN for <topic>         | docs/tickets/T-NNN-<slug>.md       | RATIFIED       | Scope matches what I would have written              |
| 2 | Updated docs/api_contracts.md env table  | docs/api_contracts.md L120-128     | RATIFIED       | Mechanical change reflecting T-001 outcome           |
| 3 | Answered Coder question on I3 ambiguity  | (chat-only; no file)               | RATIFIED       | The "envelopes.bucket already counted" reading is mine|
| 4 | Created docs/foo.md                      | docs/foo.md                        | REVERTED       | Out of scope; rolled back to <commit>                |
| 5 | Closed T-NNN as `done`                   | docs/tickets/T-NNN.md L5            | DEFERRED       | Need to verify 24h monitoring window myself first    |
```

**Verdicts:**
- **RATIFIED** — I would have done the same. Action stands as-is.
- **REVERTED** — Action rolled back; the revert commit / file edit is named in the Notes column.
- **DEFERRED** — Action stands for now but requires further verification before I formally accept it. Reason given in Notes.
- **ESCALATED** — Action exposed a question that needs a doc-change PR through the normal pipeline before I can rule. New ticket id in Notes.

---

## Section 2 — Invariant audit

Diagnostics is forbidden from silently weakening an invariant ([roles.md §5](../roles.md)).
On return, the Supervisor MUST confirm this:

- [ ] Diff-walked every file touched between `acting_from` and `acting_until`
- [ ] No edit weakens an existing invariant ([invariants.md](../invariants.md))
- [ ] No edit removes a forbidden-patterns entry ([forbidden_patterns.md](../forbidden_patterns.md))
- [ ] No edit narrows the threat model ([threat_model.md](../threat_model.md)) without a corresponding compensating control
- [ ] No new outbound network destination was added without Supervisor sign-off

If any of these check fails, the Section 1 verdict for the responsible action becomes
**REVERTED**, and an entry goes to [forbidden_patterns.md §A](../forbidden_patterns.md) as a
near-miss incident even if no production impact occurred.

---

## Section 3 — Open questions returned to Diagnostics

Questions Diagnostics held during the absence that need the Supervisor's call now:

```
- <Question 1> — Supervisor decision: <decision> — assigned to: <Coder / ticket / deferred>
- <Question 2> — ...
```

---

## Section 4 — Process lessons (optional)

If anything about the "Supervisor unreachable" episode revealed a gap in the protocol
(too long a delegation, missing escalation path, ambiguous authority limit), capture it
here so the next absence is smoother. Process changes go through a doc-change PR; this
section is the input to that PR, not the change itself.

```
- <Observation>
- <Proposed protocol change> — ticket: T-NNN
```

---

## Section 5 — Supervisor sign-off

- [ ] All Section 1 rows have a verdict
- [ ] Section 2 invariant audit clean (or near-misses logged to §A)
- [ ] Section 3 open questions either decided or assigned
- [ ] This file committed to `docs/handover_archive/` and added to the index in `README.md`

**Signed:** `<Supervisor handle>` on `YYYY-MM-DD`

---

## Notes on the format

- This file is **append-only** once committed. Corrections go in a new ratification entry that names the one it supersedes.
- "RATIFIED" does NOT mean "I agree with every detail" — it means "I would have done substantively the same thing if I'd been available". Substantive disagreements that don't rise to a revert are noted in the Notes column.
- A ratification entry is required even if Diagnostics took zero actions (file an entry saying so). The Supervisor-return event is the trigger; the count of actions is the body.
