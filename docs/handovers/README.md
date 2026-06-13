# docs/handovers/ — role bootstrap files

Each file in this directory is a **single ASCII-bordered handover block**
designed to be copy-pasted into a fresh Claude session. The block tells the
new session what role it plays, what it owns, what it must never do, and
which docs to read before any work begins.

## When to use each

| File | Paste into | When |
|---|---|---|
| [SUPERVISOR.md](SUPERVISOR.md) | a fresh Claude session that will own scope + docs + ticket sign-off | first; before any Coder or Diagnostics session exists |
| [CODER.md](CODER.md) | a fresh Claude session that will implement a ticket | after Supervisor confirms readiness; the Operator hands them T-001 first |
| [DIAGNOSTICS.md](DIAGNOSTICS.md) | a fresh Claude session that will run the Reviewer pass + verification + ticket maintenance | in parallel with the Coder, ideally before the first PR lands |

## The four roles

```
                    ┌─────────────────────────┐
                    │   Operator (human)      │
                    │   you — routes blocks   │
                    └─┬───────┬───────┬───────┘
                      │       │       │
            ┌─────────▼─┐  ┌──▼────┐  └──┬─────────────┐
            │ Supervisor│  │ Coder │     │ Diagnostics │
            │  scope    │  │ impl  │     │  review     │
            │  docs     │  │ PR    │     │  vectors    │
            │  sign-off │  │       │     │  tickets    │
            └───────────┘  └───────┘     └─────────────┘
```

Sessions never talk to each other directly. Every handoff is one ASCII
block emitted to the Operator, who pastes it to the next role.

## Update protocol

When the durable docs (`framework.md`, `invariants.md`, `threat_model.md`,
`tickets.md`) materially change, the handover files in this directory drift
out of date. **Diagnostics owns keeping them in sync.** When a Supervisor
amends an invariant or a phase shifts in workflow.md, Diagnostics re-emits
the three handover blocks so the next session bootstrap is current.

Do NOT edit a handover file mid-thread — that's a `coding → review`-style
drift. Treat it as a small ticket: scope, regenerate, save.
