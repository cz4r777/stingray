# Handover Archive

> Durable record of every role handover and Supervisor-return ratification.
> Referenced from [../roles.md §Role transitions](../roles.md). Append-only.

---

## What lives here

Two kinds of artefacts, both timestamped, both copy-paste-ready ASCII blocks:

| Filename pattern | What it is | Who writes it | Who reads it |
|---|---|---|---|
| `YYYY-MM-DD-<role>-handover.md` | A handover block produced when a role changes hands | departing or current Supervisor (or Diagnostics on Supervisor's behalf) | incoming role-holder, as their first action in the session |
| `YYYY-MM-DD-ratification-<delegate>.md` | The inverse handover — Supervisor returning from "unreachable" reviews actions Diagnostics took as backup | returning Supervisor | future-Supervisor / Diagnostics, as forensic record |

The format for each is defined in [`_template-handover.md`](_template-handover.md) and [`_ratification_template.md`](_ratification_template.md) respectively.

---

## Why this exists

Chat history evaporates. The ASCII handover blocks produced in a Claude session are useful only if they outlive the session that produced them. This directory is where they go to survive.

A second purpose: when Diagnostics steps up as Supervisor backup ([roles.md §5](../roles.md)), the Supervisor MUST be able to ratify each delegated action on return. Ratification entries are the paper trail that closes that loop. Without them, "Supervisor unreachable" silently rots into "Diagnostics quietly became Supervisor", which is exactly the role-creep this protocol is designed to prevent.

---

## Adding a new entry

1. Copy the relevant template (`_template-handover.md` or `_ratification_template.md`) to a dated filename.
2. Fill it in. ASCII blocks stay as single fenced blocks for one-click copy-paste.
3. Update the index table below in the SAME commit.

Do NOT edit existing archive entries. Once written, they are forensic; corrections go in a new entry that supersedes the old one and names which entry it supersedes.

---

## Index

| Date | File | Type | Notes |
|---|---|---|---|
| 2026-05-20 | [2026-05-20-coder-handover.md](2026-05-20-coder-handover.md) | Coder onboarding | Initial Coder handover, T-001 ready |
| 2026-05-20 | [2026-05-20-supervisor-handover.md](2026-05-20-supervisor-handover.md) | Supervisor transfer | Founder → incoming Supervisor; Diagnostics established |
