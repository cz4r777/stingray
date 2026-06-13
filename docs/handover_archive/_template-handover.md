---
type: template
purpose: Onboarding / transfer handover between role-holders
template_version: 1
---

# Handover template — Role onboarding or transfer

> Copy this template to `docs/handover_archive/YYYY-MM-DD-<role>-handover.md` when issuing
> a new handover. The ASCII block stays as ONE fenced block so the receiving party can
> copy-paste it into a fresh session in one click. Anything outside the fenced block is
> archive metadata — it does NOT travel with the handover when it's actually used.

---

## Front-matter (required)

```yaml
---
date: YYYY-MM-DD
type: handover
role: <Coder | Supervisor | Reviewer | Ops | Diagnostics>
issuer: <handle of departing role-holder, or "Diagnostics (acting on Supervisor's behalf)">
issued_to: <handle / description of incoming role-holder, e.g. "any human or AI">
sprint_state: <one-line summary of what's in flight — e.g. "T-001 ready, T-002..T-005 scoping">
predecessor: <handle of outgoing person if a transfer; omit for initial onboardings>
---
```

---

## Body — wrapper text (outside the ASCII block)

A two-to-three-line pointer that tells future readers what they're looking at:

```
# <Role> onboarding handover — YYYY-MM-DD

Paste the ASCII block below at the start of a fresh <Role> session. The confirmation
phrase at the bottom is the tripwire — anything else and the docs were not actually
read.
```

---

## The ASCII block itself (the artifact)

Single fenced block. Uses box-drawing characters. 88-char inner width to fit standard
terminals. Mandatory sections:

```
╔══════════════════════════════════════════════════════════════════════════════════════╗
║  <ROLE> HANDOVER — STINGRAY                                                          ║
║  Repo root  :  C:\Users\z\Desktop\code\stingray                                      ║
║  Today      :  YYYY-MM-DD    State: <one-line state summary>                         ║
║  <Sprint or Predecessor line>                                                        ║
╠══════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                      ║
║  MISSION (one sentence)                                                              ║
║    <stingray's mission, restated in one sentence so the handover stands alone>       ║
║                                                                                      ║
║  YOUR ROLE                                                                           ║
║    <One paragraph: what this role is and is not. Reference docs/roles.md.>           ║
║                                                                                      ║
║  CHAIN OF AUTHORITY                                                                  ║
║    <Who they escalate to. Mention Supervisor / Diagnostics / Ops as appropriate.>    ║
║                                                                                      ║
║  READ-FIRST ORDER (do not skip; sequence matters)                                    ║
║    1. <doc path>     <why-read-this in one phrase>                                   ║
║    2. <doc path>     <why-read-this>                                                 ║
║    ...                                                                               ║
║                                                                                      ║
║  CURRENT STATE                                                                       ║
║    <Stack / Layout / Scaffold / Stubs — the facts on the ground.>                    ║
║                                                                                      ║
║  ACTIVE TICKET / ACTIVE WORK                                                         ║
║    <What this role-holder picks up first.>                                           ║
║                                                                                      ║
║  BACKLOG / OUTSTANDING DECISIONS                                                     ║
║    <Numbered list of items deferred for this role to handle.>                        ║
║                                                                                      ║
║  HARD RULES / VIOLATIONS BLOCK MERGE  (role-relevant subset of invariants.md)        ║
║    I<N>  <rule name>  <one-line statement>                                           ║
║    ...                                                                               ║
║                                                                                      ║
║  WORKFLOW PER UNIT OF WORK                                                           ║
║    <Per-ticket or per-task discipline; the gates this role is responsible for.>      ║
║                                                                                      ║
║  DESIGN REFERENCES / TOOLS                                                           ║
║    <Anything sitting alongside the repo that this role needs to know about.>         ║
║                                                                                      ║
║  ESCALATE IF                                                                         ║
║    <Bulleted list of situations that exceed this role's authority.>                  ║
║                                                                                      ║
║  FIRST ACTIONS                                                                       ║
║    <Numbered list of the first 3–5 things to do.>                                    ║
║                                                                                      ║
║  CONFIRMATION REQUESTED                                                              ║
║    Reply with exactly:                                                               ║
║      "<role> online. Read [list of N docs]. <one-line plan>."                        ║
║                                                                                      ║
╚══════════════════════════════════════════════════════════════════════════════════════╝
```

---

## Body — receiving-party response section (outside the ASCII block)

Two empty headers placed below the ASCII block in the archived file. The receiving
party edits the file in place to fill them in:

```
## Receiving party response

*(To be filled in when the role is actually accepted. If the response does not begin
with the confirmation phrase verbatim, the docs were not read and the role is not
yet active.)*

## Deviations / follow-ups

*(Receiving party adds anything they disagree with, plan to do differently, or want
the issuer to acknowledge before they consider themselves bound by the handover.)*
```

---

## Authoring rules

1. **One ASCII block per handover.** Multiple blocks in one file means multiple
   handovers in one file means a future reader has to figure out which one applies.
   Split them into separate files in the archive.
2. **The confirmation phrase is non-negotiable.** It is a tripwire. If the receiving
   party paraphrases instead of quoting verbatim, treat it as "docs not read" and
   ask them to read again. This is not a politeness check; it is a load-bearing
   protocol element.
3. **READ-FIRST ORDER is curated.** Do not list every doc in `docs/` — list the
   subset that matters for this role, in the order that builds understanding fastest.
4. **HARD RULES is a subset, not the full list.** Only invariants the receiving role
   is most likely to violate, plus any role-specific build rules (e.g. `EXPO_PUBLIC_FARADAY_MODE` for Ops).
5. **FIRST ACTIONS must include reading the docs.** No exceptions. The trap to avoid
   is a Coder who skips reading and starts coding from the handover summary alone.
6. **Width discipline.** Inner content stays within 84 characters so the bordered
   block fits an 88-column terminal. Box characters add 4.
7. **No live links inside the ASCII block** — relative paths are fine, but markdown
   `[text](url)` syntax does not render inside a code fence; spell out the file path
   instead.

---

## Worked examples in this archive

- [2026-05-20-coder-handover.md](2026-05-20-coder-handover.md) — initial Coder onboarding
- [2026-05-20-supervisor-handover.md](2026-05-20-supervisor-handover.md) — initial Supervisor transfer

Both follow this template. Diff them against this file when in doubt.
