# stingray

> **End-to-end encrypted peer-to-peer messaging that refuses to transmit on the cellular radio, reducing exposure to IMSI catchers and radio-layer interception.**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
![Status: pure alpha — for feedback](https://img.shields.io/badge/status-pure_alpha_%E2%80%94_for_feedback-orange.svg)
![Platforms: iOS · Android · Web](https://img.shields.io/badge/platforms-iOS%20%C2%B7%20Android%20%C2%B7%20Web-lightgrey.svg)

> ## ⚠️ Pure alpha — released for community feedback, not production use
>
> This is published in alpha form **so the architecture and threat model can be reviewed while the design is still cheap to change**. It has not been formally audited. It has not been end-to-end verified on production hardware. **Do not bet your safety on it today.**
>
> If you can find a way to break the design, a way to widen the threat model, or a class of attack we haven't documented — that is exactly the feedback this release exists to collect. See [SECURITY.md](SECURITY.md) for the disclosure path.
>
> See also: [PRIVACY.md](PRIVACY.md) (what the relay can and cannot see), [DISCLAIMER.md](DISCLAIMER.md) (acceptable use, no warranty, export control), [CONTRIBUTING.md](CONTRIBUTING.md) (how to land a PR).

---

## Problem statement — the thesis

The mobile communications stack still carries legacy trust assumptions that are too weak for high-assurance messaging. Modern secure messengers do a strong job protecting message content at the application layer, but many still inherit risk from the underlying carrier path: radio-layer interception, tower impersonation, downgrade behavior, signaling leakage, and metadata exposure.

The defining problem is that **the radio itself can become part of the attack surface**. If the transport is untrusted, application-layer encryption alone does not fully solve the exposure.

Conventional secure messengers harden the application layer while still riding the cellular radio. That is a reasonable design choice for general-purpose messaging. stingray takes a different position for higher-assurance use cases: **if the transport cannot be trusted, remove it from the trust boundary entirely.**

stingray therefore does not attempt to harden cellular transport. It refuses to use it.

- **Wi-Fi only** — Wi-Fi, Ethernet, or attested-VPN-over-Wi-Fi are the only allowed transports. The app **refuses to send or receive** when the only available route is the cellular radio. This is enforced as the project's [INVARIANT I1](docs/invariants.md).
- **End-to-end encrypted on top** — XSalsa20-Poly1305 sealed boxes with a fresh ephemeral keypair per envelope; Argon2id KDF gates the local vault; SAS verification gates active-MITM at the pubkey-exchange moment.
- **The relay is an opaque pipe** — a single Supabase table holds `recipient_pubkey | ciphertext | ephemeral_pubkey | bucket | timestamp`. **The server has no key and cannot decrypt anything.** No accounts, no sender field, no message metadata. The privacy boundary is the encryption, not the database policy.
- **Recovery-free** — lose the passphrase, lose the account. No server-side recovery means no server-held material that could decrypt your data.

---

## Design position

stingray is a defensive communications architecture for environments where the carrier path cannot be assumed trustworthy.

The design goal is straightforward:

- remove cellular transport from the trust boundary
- minimize metadata exposure
- keep keys local
- fail closed when transport guarantees are not met

This repository is not positioned as a general-purpose messenger. It is a transport-constrained privacy system for operators who need stronger assurances than conventional carrier-routed messaging can provide.

The practical use cases are straightforward:

- field teams operating on untrusted infrastructure
- researchers and security professionals testing high-assurance messaging models
- organizations that need communications resilience in degraded or intercept-prone environments

stingray is the technical response to one specific architectural problem:
**if the radio path is the weak link, stop treating it as trusted transport.**

---

## Position

Stingray is a defensive communications architecture intended for legitimate operators working in hostile, degraded, or otherwise untrusted communications environments. The system is designed for cases where the transport model itself requires stronger guarantees than conventional carrier-routed messaging can provide.

This project is **not** intended to facilitate unlawful activity. It is a technical tool for reducing exposure to unauthorized interception in environments where such interception is a realistic operational risk.

---

## The Layered Architecture — why Stingray works differently

Stingray is built as a layered, adversarial‑aware architecture. The core idea is simple and unorthodox: **remove the radio from the attack surface, then apply strong cryptography and metadata minimization above a clean transport.**

### Layer 1 — Transport Discipline (INVARIANT I1)
**Never transmit on the cellular radio. Wi‑Fi/Ethernet only.**  
The Faraday gate enforces this invariant: if only cellular transport is available, the app refuses to send, receive, or negotiate keys. No fallback, no exceptions.

### Layer 2 — End‑to‑End Encryption
Once on a trusted transport, messages are protected with:
- **X25519** key agreement  
- **XSalsa20‑Poly1305** sealed boxes  
- **Ephemeral keypairs per envelope**  
- **SAS verification** for active‑MITM protection at key exchange

### Layer 3 — Opaque Relay
A single blind mailbox (Supabase table or self‑hosted equivalent) stores only:
- `recipient_pubkey | ciphertext | ephemeral_pubkey | bucket | timestamp`  
No accounts, no sender field, no message metadata beyond ciphertext buckets and timestamps.

### Layer 4 — Local‑Only Identity and Storage
Identity keys and message history are generated and stored locally in an Argon2id‑protected vault. There is no server‑side recovery and no server‑held material that can decrypt user data.

---

## Why this architecture is unorthodox — and why it’s correct

Most secure messengers attempt to secure application and transport layers while still using the cellular radio. In hostile environments the radio is the attacker’s domain. The correct defensive response is **not** to harden the radio; it is to **remove it from the trust boundary**. That architectural decision simplifies the threat model and eliminates the most powerful interception vector.

---

## Planned Beta Roadmap — Tor / Onion Transport and other upgrades

The beta roadmap adds optional network‑layer anonymity while preserving the transport discipline:

- **Onion Transport (Beta)**  
  - Tor‑style multi‑hop routing for traffic‑analysis resistance  
  - Relay unlinkability and optional self‑hosted onion relays  
  - Designed to operate over Wi‑Fi/Ethernet only (no cellular fallback)  
  - Adds network anonymity on top of existing application‑layer encryption and metadata minimization

- **Other planned upgrades**  
  - Hardware‑backed key storage integration (optional)  
  - Tunable Argon2id parameters after device timing verification  
  - Self‑hosted relay image and deployment runbook  
  - Formal cryptographic review and external audit  
  - Improved UX for SAS verification and out‑of‑band key exchange  
  - Optional pluggable transports (always respecting INVARIANT I1)

The onion transport is an additive privacy layer — it complements, not replaces, the core transport abstention model.

---

## Threat model (concise)

**Stingray defends against:**
- radio‑layer interception (cell‑site simulators, IMSI catchers)  
- tower impersonation and forced downgrades  
- metadata harvesting inherent to carrier‑routed messengers  
- passive network observers and opportunistic forensic access  
- a hostile or compromised relay operator (opaque relay design)

**Stingray does not defend against:**
- kernel‑level implants or custom nation‑state firmware  
- physical device compromise or hardware implants  
- legal compulsion to reveal passphrases or keys  
- user‑side leaks (screenshots, photos, shoulder surfing)

This is an honest, bounded threat model.

---

## Status — pure alpha

**Do not bet your safety on this code.** The project is research software:

| Status | Detail |
|---|---|
| ✅ Foundation | Vault, Faraday gate, opaque‑ciphertext relay, sealed‑envelope crypto, SAS verification UX |
| ⚠️ Untested on device | Argon2id timing on phones, Android KeyStore limits, end‑to‑end two‑device flows |
| ❌ Not yet shipped | Tor transport, hardware token unlock, self‑host relay image, external cryptographer review |

See `docs/framework.md §Launch Standard` for the full readiness rubric.

---

## What it is, in one diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  YOUR DEVICE                                                        │
│   ┌─ vault ─────────────────────────────────────────────────────┐   │
│   │   Argon2id KDF (passphrase → key)                            │   │
│   │   X25519 + Ed25519 keypairs (generated on-device, never sent)│   │
│   │   contacts.v1     conversations.v1   ← encrypted local store  │   │
│   └──────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│                              │ Wi-Fi / Ethernet ONLY                  │
│                              │ (Faraday gate refuses cellular)        │
└──────────────────────────────┼─────────────────────────────────────┘
                               ▼
            ┌──────────────────────────────────────┐
            │  RELAY  (Supabase, or self-hosted)    │
            │     one table, opaque ciphertext      │
            │     no accounts, no sender field      │
            │     no plaintext can be derived       │
            └──────────────────────────────────────┘
                               │
                               ▼
                          THE OTHER PERSON
                          (same defense)
```

The relay is a dumb pipe. Anyone reading its database sees only "recipient pubkey X received an opaque blob of bucket size Y at time Z." That's the entire metadata surface.
