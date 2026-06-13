# Coder Batch Mode — Multi-Ticket Autonomy Protocol

> This file defines how a Coder may take a **bounded batch** of linked tickets and execute them with high autonomy. It exists to increase throughput without weakening review discipline, invariants, or the threat model.

Related docs:

- [roles.md](roles.md) = who may authorize and run a batch
- [tickets.md](tickets.md) = ticket lifecycle and per-ticket state
- [pipeline.md](pipeline.md) = how changes move from code to review to deploy
- [workflow.md](workflow.md) = which tickets should logically travel together
- [invariants.md](invariants.md) / [threat_model.md](threat_model.md) = the boundaries autonomy may not cross

---

## Why batch mode exists

Without batch mode, a Coder can get trapped in a low-leverage loop:

- wait for one ticket
- implement a narrow slice
- stop for new instructions
- repeat

That pattern is safe but too slow for a project the size of stingray.

Batch mode increases velocity by letting the Coder execute **2-4 tightly related tickets** in one run, with explicit stop conditions and a mandatory paper trail.

The goal is:

- more autonomy
- fewer handoffs
- less micromanagement
- no relaxation of review or invariant discipline

---

## Definition

A **batch** is:

- one Coder run
- covering **2 to 4 linked tickets**
- ordered by dependency
- bounded to **one vertical slice** of product work

A batch is **not**:

- a grab-bag of unrelated backlog items
- a license to re-scope tickets silently
- a substitute for the Reviewer pass
- permission to change invariants or the threat model

---

## Batch sizing rules

### Default size

- **2 tickets** is preferred
- **3 tickets** is acceptable when they are tightly coupled
- **4 tickets** is the hard ceiling, and only for low-risk UI / persistence work

### Never batch together

- unrelated phases
- crypto + relay-schema changes + Android platform work in one run
- any batch that mixes a high-risk primitive change with broad UI polish

### Good batch examples

- `T-002 + T-003`
  - one trust-state slice
- `T-003 + QR exchange follow-up`
  - one contact-verification slice
- `T-004 secure-screen baseline + overlay hardening`
  - one Android hardening slice

### Bad batch examples

- `T-001 + T-004 + T-006`
  - crypto + Android hardening + onion transport is too many risk classes
- `T-002 + T-005 + self-host relay`
  - local persistence and backend packaging are unrelated execution surfaces

---

## What qualifies as a valid batch

All tickets in a batch should satisfy **all** of these:

1. They belong to the same phase, or they form one clear dependency chain.
2. They produce one user-visible or system-visible slice when done.
3. The later ticket(s) build directly on the earlier ticket(s).
4. A single Reviewer can still read the resulting diff without losing the plot.

If any one of those fails, split the batch.

---

## Authority model

### Supervisor

The Supervisor authorizes the batch and sets:

- which tickets are in
- the execution order
- any explicit exclusions
- any custom stop conditions

### Coder

The Coder may:

- choose the internal implementation order inside the authorized batch
- make ordinary engineering decisions
- continue through small ambiguities without stopping
- complete one ticket and immediately begin the next linked ticket in the same batch

The Coder may **not**:

- add new tickets to the batch
- silently drop a ticket from the batch
- weaken an invariant
- re-scope a ticket without escalation

### Diagnostics

Diagnostics supports the batch by:

- verifying state mid-run
- checking acceptance criteria between tickets
- surfacing likely review blockers early

Diagnostics does **not** approve the batch.

---

## Stop conditions

The Coder should continue autonomously unless one of the following occurs.

### Hard stop — must escalate immediately

- an invariant may be weakened
- the threat-model promise may change
- a relay schema change appears necessary beyond the frozen surface
- a dependency ticket is missing, contradictory, or not actually ready
- a license issue appears
- a platform capability is uncertain enough that product copy might overclaim

### Soft stop — continue current ticket, report at checkpoint

- implementation detail is uncertain but low risk
- naming / file placement choice could go either way
- a follow-up ticket is clearly needed but current work can still finish safely
- a typecheck or test failure is caused by unrelated workspace noise and the local ticket can still be isolated and validated

The principle is:

- **hard stop** when trust or scope is at risk
- **soft stop** when only local implementation shape is uncertain

---

## Execution protocol

### 1. Batch handover

The Supervisor hands the Coder:

- the ordered ticket list
- the read-first docs
- the stop conditions
- the confirmation phrase

### 2. Cold read

The Coder re-reads each ticket cold in sequence and confirms:

- dependency order
- invariants touched
- acceptance criteria
- out-of-scope items

### 3. Slice design

Before coding, the Coder produces a short plan naming:

- what shared substrate will be built first
- which ticket closes that substrate
- what each later ticket layers on top

### 4. Ticket-by-ticket execution

Within the batch, the Coder still treats each ticket as a real ticket:

- complete ticket A scope
- verify ticket A acceptance criteria
- move to ticket B
- repeat

The batch is one run, but the ticket boundaries remain visible.

### 5. Checkpoints

At minimum, the Coder reports after:

- the first ticket is complete
- any hard stop
- the end of the batch

Optional mid-ticket checkpoints are fine, but not required unless risk increases.

### 6. Return handover

The batch ends with one return summary containing:

- finished tickets
- partially finished tickets
- blocked tickets
- known follow-ups
- ratification asks for any Supervisor-owned file changes

---

## Logging and monitoring expectations

Batch mode increases autonomy, so the paper trail must get stronger.

Each batch return should include:

- ticket ids
- files changed grouped by ticket
- acceptance criteria status per ticket
- blockers or open questions
- which checks were run
- what still needs Ops or Reviewer validation

This is how we gain speed without losing control.

---

## Review rules for batch mode

Batch mode does **not** relax the Reviewer pass.

Reviewer expectations:

- inspect each ticket boundary inside the batch
- verify no unrelated drive-by refactors leaked in
- verify docs updated alongside the code they describe
- verify the Coder did not silently collapse multiple tickets into one vague change

If the batch diff is too hard to read cold, that is itself a signal the batch was too large.

---

## Batch composition guidance for stingray

### Recommended near-term batches

1. `T-002 + T-003`
   - contacts persistence + SAS trust UX
2. `T-004 phase 3.1 + 3.2 only`
   - Android secure-screen baseline + overlay hardening
3. `T-005` alone
   - conversations persistence touches a broader encrypted-plaintext surface

### Not recommended right now

- `T-004 + T-005`
  - too many UI + persistence surfaces at once
- `T-005 + T-006`
  - local-history persistence and onion transport are unrelated risk classes

---

## Batch handover template

Use this structure when assigning a batch:

1. Batch name
2. Ordered ticket list
3. Read-first docs
4. Shared substrate to build first
5. Hard stop conditions
6. Explicit exclusions
7. Confirmation phrase

---

## Core rule

Batch mode is allowed because the Coder is trusted to keep moving.

That trust holds only while these stay true:

- ticket boundaries remain visible
- invariants stay load-bearing
- review stays cold and separate
- the Coder escalates on real risk instead of guessing through it

If batch mode ever causes silent scope drift or review-blind mega-diffs, shrink the batch size immediately.
