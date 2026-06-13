# Contributing to stingray

Thanks for taking a look. This project explicitly invites scrutiny — but the working protocol is documented and **non-negotiable for code that touches crypto, transport, vault, or relay**. Please read this file before opening a PR.

## TL;DR

1. Read [docs/roles.md](docs/roles.md) (the five-role charter) and [docs/pipeline.md](docs/pipeline.md) (the six-stage change pipeline) **before** you write code.
2. Pick an open ticket in [docs/tickets.md](docs/tickets.md) or open an issue describing what you want to do.
3. Branch as `T-NNN-short-slug` matching the ticket id.
4. Walk the per-ticket `ready → coding` and `coding → review` checklists embedded in each ticket file.
5. Open the PR with the ticket id in the title and the threat-model implication stated in the description.

## Why the rules

stingray is a privacy tool. Overclaiming protection is a security bug; silently weakening an invariant is a security bug; "drive-by refactor of unrelated screens in the same PR" is a security bug because it makes the diff unreviewable. The protocol exists to prevent those failure modes.

If a rule seems excessive for your change, it probably is — for *that change*. Follow it anyway. The cost of the discipline is much smaller than the cost of one quiet regression.

## What you cannot change in a PR

These are reserved for the Supervisor role ([docs/roles.md §1](docs/roles.md)). PRs that touch them will be sent back:

- [docs/invariants.md](docs/invariants.md) — the numbered I1–I15 rules the code must never violate.
- [docs/threat_model.md](docs/threat_model.md) — the adversary we're defending against.
- [docs/forbidden_patterns.md](docs/forbidden_patterns.md) §A — the production-incident log.
- [supabase/schema.sql](supabase/schema.sql) — the relay schema. Adding any column on `envelopes` beyond the current frozen surface needs an explicit Supervisor sign-off ([INVARIANT I3](docs/invariants.md)).

If your work requires changing one of these, open an issue describing **why** before writing code. We'll decide together whether it's right.

## What gets a PR rejected fast

These are the auto-block items from [docs/pipeline.md §Stage 4](docs/pipeline.md). Reviewer reads them in order; failing any one stops the review:

- `service_role` / `SERVICE_ROLE` references under `app/` or `lib/` — the privileged Supabase key MUST never ship to the client.
- New schema column on `envelopes` beyond `recipient_pubkey | ciphertext | ephemeral_pubkey | bucket | created_at`.
- Network call outside `lib/relay.ts`, or inside `lib/relay.ts` without first calling `assertFaraday()` — the Faraday gate ([INVARIANT I1](docs/invariants.md)) is non-negotiable.
- Cached ephemeral keypair in `sealEnvelope()` — every envelope MUST use a fresh keypair.
- Stored plaintext private-key material anywhere outside the secretbox-encrypted vault.
- `console.log` near `openEnvelope` / `sendEnvelope` / vault material — decrypt failure is silent ([INVARIANT I12](docs/invariants.md)).
- Telemetry / crash-reporting SDK that initiates an outbound network request without explicit user-initiated opt-in.
- Android secure-shell diff that overclaims protections ("blocks malware", "stops RATs", etc.).

## Crypto-touching changes

If you change `lib/crypto.ts`, `lib/vault.ts`, or anything affecting envelope or key formats, additional requirements apply ([docs/pipeline.md §Crypto-touching pipeline](docs/pipeline.md)):

- **Test vectors against libsodium reference in the PR.** A crypto diff without vectors is not reviewable.
- **Forward-migration plan** if the blob format changes — users must not be locked out by a KDF or format change.
- **Threat-model update** if the residual risk shifts.

## Reporting security issues

Do not open a public GitHub issue for security-sensitive findings. See [SECURITY.md](SECURITY.md) for the coordinated disclosure path.

## Style

- TypeScript strict mode.
- Comments only where the *why* is non-obvious. Don't comment what the code already says.
- One ticket = one branch = one PR. Stacked PRs are fine; one PR covering three unrelated tickets is not.
- No drive-by refactors of files unrelated to the ticket.

## Setup

See the [README.md](README.md) "Run it (alpha)" section. You need:

- Node 18+ and npm
- An Expo development environment (`expo` CLI works fine, or just `npm run web` for the browser preview)
- A Supabase project for the relay (free tier is plenty) — see [supabase/README.md](supabase/README.md)
- Wi-Fi (the Faraday gate refuses cellular by design)

## License

By contributing, you agree that your contributions will be licensed under the project's [Apache 2.0 license](LICENSE).
