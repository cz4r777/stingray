# Security policy

stingray is a privacy tool. We take security issues seriously and we want to hear about them.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security-sensitive findings.**

Instead, open a [GitHub Security Advisory](https://github.com/cz4r777/stingray/security/advisories/new) on this repository. That keeps the report private until we have a fix.

We will:

- Acknowledge receipt within **72 hours**.
- Triage and confirm severity within **7 days**.
- Provide a fix or mitigation plan within **30 days** for confirmed vulnerabilities.
- Credit you publicly at disclosure time (unless you ask us not to).

## What we consider in-scope

Anything that lets an attacker:

- Read message content without the intended recipient's private key.
- Substitute a contact's public key without the SAS comparison catching it.
- Bypass the Faraday cellular-refusal gate.
- Persist plaintext message bodies, contact aliases, or private-key material outside the encrypted vault.
- Read the on-disk vault blob without the user's passphrase.
- Cause a partial decrypt that surfaces *any* plaintext when the MAC fails.
- Surface a "verified" badge on a contact whose SAS code was not confirmed.

See [docs/threat_model.md](docs/threat_model.md) for the full adversary model.

## What we consider out-of-scope

Per the published threat model, the following are acknowledged residual risks and are **not** treated as vulnerabilities:

- Compromised devices with kernel-level malware already installed (§6 of the threat model).
- RAM extraction from a powered-on, unlocked device (§5 residual risk).
- IP-address correlation at the relay by an observer of the relay's network path (§4 residual risk). Mitigation is Tor / VPN-over-Wi-Fi, both planned in later phases.
- Connection-timing correlation ("User X uses stingray at 19:00 every weekday").
- Quantum-computer breaks of X25519 (out of scope until post-quantum primitives ship).
- The user voluntarily screenshotting or photographing the screen.
- Legal compulsion to reveal the passphrase.

If you find a clever way to widen the in-scope list, that itself is a finding we want to hear about.

## What we will not do

- Pay a cash bounty (we may set one up in the future; today there is no bounty program).
- Engage with reports that include working exploits against third-party services you don't own.
- Engage with reports that boil down to "the threat model excludes this" without showing how to widen it.

## Coordinated disclosure

We follow responsible disclosure. Once a fix is shipped, we publish:

- A [forbidden_patterns.md §A](docs/forbidden_patterns.md) incident entry describing the root cause and the rule that now prevents recurrence.
- A GitHub Security Advisory with severity, affected versions, and mitigation steps.
- Public credit to the reporter (unless they ask for anonymity).

## A note on the alpha status

stingray is currently in **alpha**. The architecture is sound, the threat model is honest, but the code has not been formally audited. Issues you find now are extremely valuable — they shape the design while we can still change it.

Thank you for looking.
