# Threat Model

> **Bottom line:** stingray defends against a cellular-tower MITM (the stingray / IMSI catcher), a compromised or hostile relay operator, and a moderately-sophisticated forensic attacker with brief physical access to a powered-off device. It does NOT defend against a state-level actor running custom malware on the device, and it does NOT defend against the user voluntarily sharing plaintext through a different channel.

---

## 1. The thing being defended

Two users (Alice, Bob) want to exchange text messages such that:

- **Confidentiality:** No party other than Alice and Bob can read the content.
- **Authenticity:** Bob can be confident a message claiming to be from Alice was actually sent by the holder of Alice's private key.
- **Metadata minimisation:** Adversaries observing any single point (the carrier, the relay, a passive network tap) learn as little as possible about who-talks-to-whom-and-when.
- **Forward secrecy at rest:** A future compromise of either device should not retroactively reveal old messages once they are ack-deleted and the local store is wiped.

We do NOT aim for plausible deniability, anonymous-recipient routing, or steganographic concealment of the app's existence.

---

## 2. Primary adversary: the cellular-tower MITM (a.k.a. stingray)

### Capabilities

A "stingray" / IMSI catcher / cell-site simulator presents itself as a legitimate base station to nearby phones. Phones automatically attach to the strongest tower; protocols below LTE often allow downgrade to weaker authentication. Once attached:

- The simulator sees every bit of cellular traffic (LTE/5G NSA included; data traffic carried over the cellular bearer).
- The simulator can record IMSI, IMEI, signal strength (rough geolocation), and traffic patterns.
- Some variants actively MITM application traffic, terminating TLS at the simulator using carrier-style CA chains the device has been induced to trust.
- The simulator does NOT typically execute code on the device — but it does see the device's traffic and metadata as the carrier would.

### Defense

**Stingray does not contest the cellular adversary on the radio it controls.** The single defense, and the most important rule in this product, is:

- **The Faraday gate.** ([INVARIANT I1](invariants.md).) Refuse to transmit when only the cellular radio is available.
- Wi-Fi, Ethernet, and (with explicit per-session attestation) VPN-over-Wi-Fi are the supported transports.
- The user is expected to keep the device in airplane mode and tether to Wi-Fi, or use a Wi-Fi-only device.

### Residual risk

- The user disables the Faraday gate via `EXPO_PUBLIC_FARADAY_MODE=false` — addressed by making this flag QA-only and reviewing it as a release blocker.
- The user authorises a VPN override on a session — addressed by per-session, non-persistent override flags.
- The cellular radio is on for other apps on the same device — the attacker still gets location, but not stingray's traffic.

---

## 3. Hostile relay operator

### Capabilities

We assume the relay is fully compromised. The operator can:

- read every envelope row
- correlate `recipient_pubkey` with timing and `bucket` size
- record client IP addresses (network metadata)
- inject envelopes addressed to any recipient (a "spam" capability)
- delete envelopes before they are drained (a denial-of-service capability)

### Defense

- **Cryptographic confidentiality:** envelopes are box-sealed under the recipient's public key with a fresh ephemeral keypair per envelope. The operator has no key. ([INVARIANT I6](invariants.md))
- **Metadata minimisation:** schema deliberately omits sender, subject, thread, and read state. ([INVARIANT I3](invariants.md))
- **Length padding:** every envelope is padded to a fixed bucket. ([INVARIANT I5](invariants.md))
- **Ack-delete:** recipients delete envelopes promptly after decrypt, bounding the ciphertext-at-rest population. ([INVARIANT I11](invariants.md))

### Residual risk

- The operator can still see "Bob receives many envelopes around 19:00 daily" and infer Bob's online schedule.
- The operator can still see Bob's IP address. Mitigated only by VPN-over-Wi-Fi or Tor (Phase 7).
- A spam-injection attack can flood Bob's inbox with garbage that fails to decrypt — fixed-cost-per-byte denial of service. Mitigation is rate-limiting at the relay level, which IS legitimate metadata to hold and the only place we expect to grow the schema beyond [INVARIANT I3](invariants.md).

---

## 4. Hostile network observer

### Capabilities

A passive observer on the path between client and relay sees:

- TLS-encapsulated traffic to the relay's domain
- TLS-encapsulated WebSocket traffic for Realtime
- Connection timing and packet sizes
- Source/destination IPs

### Defense

- TLS protects the application content from this observer (the observer is NOT a stingray-on-cellular and has no MITM capability assumed).
- Length padding masks per-message size, but TLS framing and packet timing remain partial leaks.
- VPN/Tor (Phase 7) further reduces the IP-correlation surface.

### Residual risk

- "User X uses stingray at 19:00 every weekday" is observable from connection patterns. This is acknowledged and not solved in v0.

---

## 5. Forensic / device-seizure attacker

### Capabilities

A short-lived physical attacker (border crossing, traffic stop):

- Powers on the device (it boots into the OS)
- May see a lock screen but not the vault unlock screen
- Attempts to image the device storage and the `expo-secure-store` artifact
- Does NOT have a kernel-level implant pre-installed

### Defense

- **Vault encryption:** the on-disk blob is encrypted under a passphrase-derived key. Without the passphrase, the blob is opaque. ([INVARIANT I7](invariants.md))
- **Memory-hard KDF:** Argon2id (Phase 1) makes offline brute-force expensive even with extracted blob. ([INVARIANT I8](invariants.md))
- **Panic wipe:** user can delete the vault salt and blob in one operation. ([INVARIANT I10](invariants.md))
- **Faraday gate:** even if the attacker plugs the device into their network, the device will refuse to talk to the relay unless the attacker's network masquerades as Wi-Fi. (And even then, they only see opaque ciphertext.)

### Residual risk

- If the device is seized POWERED ON AND UNLOCKED, the unlocked secret keys are in RAM. RAM extraction is a real-world capability for some attackers. There is no application-layer defense; this is OS-level territory.
- A weak passphrase combined with the v0 placeholder KDF is brute-forceable. v0 is not ready for high-threat use.

---

## 6. Sophisticated attacker with malware on the device

**Not defended.** If the attacker is running code as the user (or in a more-privileged context), they can read plaintext as it is typed and rendered. No messaging app, however carefully encrypted, defeats this. The user should keep stingray on a device with a minimal attack surface (a dedicated Wi-Fi-only tablet is the gold standard).

---

## 7. The user themselves

**Not defended against accidental disclosure.** If the user screenshots a conversation and shares it on social media, that is outside the system. The app does not block screenshots in v0; it is on the deferred list but is acknowledged to be ineffective against a determined user.

---

## 8. What we explicitly do NOT model

- Side-channel attacks on the crypto primitives (we trust libsodium / tweetnacl)
- Supply-chain attacks on `npm install` (real, but addressed at the engineering-pipeline level, not the application level)
- Quantum computers (X25519 is not PQ-secure; out of scope for v0–v1)
- The user being legally compelled to reveal their passphrase (anti-coercion features like a duress passphrase are on the Phase 7 backlog)

---

## 9. Hostile relay scaling considerations

Even with the threat model above, the relay must scale honestly. The lightweight schema makes this easy:

| Scale tier | What changes | Mitigation |
|---|---|---|
| 100 users | nothing; free tier holds | — |
| 10k users | envelope insertion rate visible to ops | rate-limit at the application level; consider self-host |
| 100k users | bandwidth + storage costs start to bite | self-host or sponsorship; ack-delete keeps storage near zero |

There is no photo egress and no per-user persistent data on the relay. The dominant cost is realtime WebSocket connections, which is bounded by active concurrent users, not historical retention.
