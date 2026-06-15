# stingray

> **End-to-end encrypted peer-to-peer messaging that refuses to transmit on the cellular radio so an IMSI catcher cannot intercept anything.**

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

## Why this exists — the thesis

Modern secure messengers protect message content, but they still rely on the **cellular radio**. That reliance exposes users to radio‑layer interception (cell‑site simulators, IMSI catchers, forced downgrades, and metadata harvesting). These are structural properties of the telecom stack, not application bugs.

Stingray takes a different position: **if the transport layer is compromised, do not use it.** Instead of hardening the radio, Stingray removes it from the trust boundary and enforces a strict transport invariant.

---

## Background (optional)

A real‑world encounter motivated the project; the experience highlighted a structural weakness: **the radio itself can become the attack surface**. This repository focuses on the technical response to that class of interception. (This note is optional background and not required to evaluate the design.)

---

## Position

**Counter‑intelligence, not crime.**  
Stingray is a defensive communications architecture intended for legitimate operators working in hostile or compromised environments: field teams, humanitarian workers, researchers, and other professionals who require a transport model that avoids radio‑layer interception.

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

