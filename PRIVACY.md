# Privacy

stingray is designed so that the operators of this software — including the maintainers and any relay operator you do not control yourself — can see as little as possible. This document describes what we **can** and **cannot** see, by design.

This is not a "we may share your data with..." policy. It is a technical statement of what the architecture allows and what it forbids.

---

## What the relay sees

The relay (a Supabase project, or a self-hosted equivalent) stores opaque ciphertext envelopes indexed by recipient public key. For every message, the relay holds:

- `recipient_pubkey` — 64-char hex (the recipient's X25519 public key)
- `ciphertext` — base64; the encrypted payload (we cannot decrypt this)
- `ephemeral_pubkey` — base64; a fresh per-message X25519 public key used by the sender
- `bucket` — one of 256 / 1024 / 4096 / 16384 (the post-padding ciphertext size)
- `created_at` — server timestamp

## What the relay does NOT see

By deliberate architectural choice, the relay does NOT see:

- **sender public key** — every envelope uses a fresh ephemeral keypair; the relay cannot link two envelopes to a common sender
- **message content** — sealed under the recipient's public key, no key on the server can decrypt it
- **conversation or thread identifier** — there isn't one on the wire; threading is reconstructed by the recipient's device
- **read state / delivery receipt** — these are deliberately omitted; they would leak when you are online
- **contact names or aliases** — these never leave your device
- **your private keys** — generated on-device, encrypted under your passphrase, never transmitted
- **your passphrase** — the relay has no concept of an account, let alone a passphrase

The relay's network layer can see your **IP address** when you connect to it. That is normal IP-level metadata. Mitigation is in your hands: Wi-Fi choice, VPN, or Tor (planned). See [docs/threat_model.md §4](docs/threat_model.md) for the full residual-risk list.

---

## What your device holds

Your device stores, all encrypted under your passphrase via Argon2id:

- X25519 and Ed25519 keypairs (your cryptographic identity)
- contact list — aliases, peer public keys, SAS verification state
- conversation history — last 500 messages per peer, FIFO eviction

The on-disk vault blob is sealed with XSalsa20-Poly1305 under a key derived from your passphrase via Argon2id (memory-hard). Without your passphrase, the blob is opaque.

A panic-wipe clears the vault salt, the vault blob, the contacts blob, and the conversations blob in one operation. The result is indistinguishable from a fresh install.

---

## What the maintainers can see

**Nothing.** There is no telemetry, no analytics, no crash reporting that ships any data off your device. The code is open source — read [`lib/relay.ts`](lib/relay.ts), [`lib/envelope.ts`](lib/envelope.ts), and [`supabase/schema.sql`](supabase/schema.sql) and verify.

If you discover any data path that leaks beyond what this document describes, that is a security bug — please follow the disclosure process in [SECURITY.md](SECURITY.md).

---

## What you should do

- **Pick a strong passphrase.** Argon2id makes brute-force expensive, but a 4-character passphrase is still recoverable in a forensic context. The UI enforces ≥ 12 characters; longer is better.
- **Stay on Wi-Fi.** The Faraday gate enforces this, but airplane mode + Wi-Fi is the gold standard. Cellular is the radio the attacker controls.
- **Compare SAS codes out-of-band** when adding a contact. The 7-digit code is your only defence against an active MITM at pubkey-exchange time.
- **Consider self-hosting the relay** if you do not want any third-party operator to see even the recipient-pubkey-to-IP correlation.
- **Lock your vault** when you are not using the app. Panic-wipe if you believe the device is compromised.

---

## Data subject rights

Because stingray does not collect personal data centrally, there is no central data controller for you to issue a deletion request against. The only data held "for you" is the opaque envelope queue on the relay, which:

- auto-expires after 30 days
- is deleted on first successful decrypt by your device
- contains no plaintext, no name, no IP retention

If you **self-host the relay**, you are the data controller for that deployment. Configure your logging and retention accordingly. Default deployment per the documented runbook holds nothing beyond the row contents listed above.

---

## A note on jurisdiction

This software was developed under the position that **un-warranted, extra-judicial, area-effect surveillance of citizens is a privacy violation regardless of which government does it**. See [README.md "Position: counter-intelligence, not crime"](README.md) for the full statement.

Different jurisdictions handle the legal balance between law enforcement powers and citizen privacy differently. This software does not attempt to navigate those distinctions on your behalf. It does what the architecture says it does — refuse cellular, encrypt end-to-end, store nothing the maintainers can read — and the legal consequences of using it in your jurisdiction are yours to evaluate.

See also: [DISCLAIMER.md](DISCLAIMER.md).
