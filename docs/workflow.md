# Workflow — Step-By-Step Build Order

> This file is the product work sequence.
> It describes how to build the app over time.
> It is not the dev/change-control pipeline.

---

## Purpose

Translate the framework and threat model into a practical work order so progress stays structured.

This is the build path the supervisor should use to decide:

- what to work on next
- what not to work on yet
- what counts as done for each phase

---

## Workflow Rules

1. Defense-in-depth foundations land before any product polish.
2. Do not ship a "convenience" feature before its threat-model entry exists.
3. Do not enable live P2P (WebRTC) before the offline-relay path is correct and verified.
4. Do not ship multi-device before single-device key custody is hardened.
5. Build vertical slices, not disconnected scaffolding.
6. Do not market Android "secure shell" claims until screenshot/recording blocking and app-switcher shielding are verified on real Android 12+ hardware.

---

## Phase 0 — Foundation

Goal:

Create a stable scaffold with clear docs, basic relay schema, and a running app.

Deliverables:

- Expo app runs on web and mobile
- Supabase relay project configured
- envelope schema applied
- vault create/unlock/wipe works
- docs exist and are current

Exit criteria:

- enroll → unlock → unlock-again works across app restart
- Faraday banner reflects current network state
- relay receives an envelope and the recipient can drain + decrypt it

Current status:

- scaffolded; vault KDF is the v0 placeholder (replace in Phase 1)

---

## Phase 1 — Crypto Hardening

Goal:

Make the cryptographic foundation production-grade.

Work:

1. Replace the v0 hash-chain KDF in `lib/crypto.ts` with `libsodium.crypto_pwhash` (Argon2id) via `react-native-libsodium`.
2. Add a versioned vault format (`stingray.vault.blob.v2`) so future KDF changes can migrate forward without locking users out.
3. Add fuzz tests for the padding/unpadding round-trip on random inputs at every bucket boundary.
4. Add a tamper test: flip a byte in the ciphertext, confirm decrypt returns `null` (never partial plaintext).

Deliverables:

- Argon2id-backed vault
- versioned blob format with migration path
- test vectors against the libsodium reference

Exit criteria:

- a wrong passphrase always fails decryption; a right passphrase always succeeds
- bit-flipped ciphertext never produces partial plaintext

---

## Phase 2 — SAS Verification UX

Goal:

Make active-MITM detection real, not advisory.

Work:

1. Persist contact verification state in a local `contacts.json` (encrypted with the vault key).
2. Surface the 7-digit SAS on the contact-add screen with an explicit "I verified this in person / on a separate channel" confirm step.
3. Show a yellow padlock for unverified contacts and a green one once verified. Red and immovable if mismatched.
4. Refuse to render or send media in unverified chats.

Deliverables:

- persistent verified/unverified/mismatched state
- UX that makes verification cost less than skipping it

Exit criteria:

- two users can complete SAS verification end-to-end and the state survives restart

---

## Phase 3 — Android Secure Shell Hardening

Goal:

Reduce visual leakage on supported Android devices and provide a high-friction secure-shell mode for sensitive use.

Work:

1. Add secure-screen protection for sensitive routes so ordinary screenshots, standard screen recording, and app-switcher previews are blocked on supported Android devices.
2. Add overlay and obscured-touch hardening for unlock, reveal, send, and panic-wipe paths.
3. Add immersive fullscreen secure-shell presentation for chats and compose.
4. Add blind-compose mode: custom in-app compose surface, masked outgoing draft, hold-to-reveal.
5. Gate secure-shell promises to Android 12+ and document older Android behavior honestly.

Deliverables:

- secure-screen baseline on Android
- privacy curtain / shield mode
- immersive terminal-like shell
- blind-compose pad for sensitive sends
- explicit Android 12+ support policy for hardened mode

Exit criteria:

- protected Android screens are not visible in ordinary screenshots or standard recording paths
- recents / app-switcher previews do not reveal chat content
- a user can compose and send through blind-compose mode without invoking the ordinary soft keyboard path
- product copy never claims defense against a compromised device

---

## Phase 4 — Live P2P (WebRTC over Wi-Fi)

Goal:

Bypass the relay when both peers are online on a Wi-Fi network.

Work:

1. Add `react-native-webrtc` and matching Expo plugin.
2. Use the relay only for SDP offer/answer exchange (small, opaque, infrequent).
3. Negotiate a datachannel; encrypt application payload using the same envelope scheme so a malicious STUN/TURN cannot snoop.
4. Fallback to the relay if connection establishment fails or if either side leaves Wi-Fi.

Deliverables:

- live data channel between two peers behind common NAT setups
- transparent fallback to relay mailbox
- no measurable cellular fallback path

Exit criteria:

- two peers on the same Wi-Fi can chat with zero relay involvement post-handshake
- airplane-mode + Wi-Fi-tethered second device works the same way

---

## Phase 5 — Relay Self-Host

Goal:

Remove the dependency on a third-party cloud for users who want to fully control the relay.

Work:

1. Package the relay schema in a single-container Docker image (Postgres + a tiny WebSocket bridge for realtime).
2. Document the self-host runbook in [deployment.md](deployment.md).
3. Add a "relay URL" field to settings so users can swap providers without rebuilding the app.

Deliverables:

- runnable self-host image
- per-user relay-URL override
- migration path: drain one relay, point at another, resume

Exit criteria:

- a fresh laptop can stand up a relay in under 15 minutes
- a user can switch their relay URL without losing messages already-in-flight

---

## Phase 6 — Push Wakeup (No-Payload)

Goal:

Receive messages without leaving the relay long-polled.

Work:

1. APNs/FCM register a wakeup token. The token does NOT include the recipient pubkey or anything addressable.
2. The relay sends a content-less wakeup to the token.
3. App wakes, polls the relay over Wi-Fi, drains envelopes.
4. If only cellular is available, the app does NOT wake (Faraday gate trumps responsiveness).

Deliverables:

- wakeup-only push integration
- explicit threat-model entry for what the platform provider learns from the token

Exit criteria:

- a backgrounded app receives messages within 30 seconds when Wi-Fi is on
- a backgrounded app on cellular only stays silent (correct)

---

## Phase 7 — Hardware Token Unlock

Goal:

Make the unlock factor stronger than memory.

Work:

1. Support passkey / FIDO2 / YubiKey unlock as an alternative to passphrase.
2. Combine factors: token + short PIN.
3. Vault key derivation incorporates the hardware-attested response.

Exit criteria:

- a user can enroll a hardware token and unlock without typing a long passphrase
- losing the token without the recovery share renders the vault unrecoverable (correct)

---

## Phase 8 — High-Threat Mode

Goal:

Onion-route to the relay for users facing nation-state surveillance.

Work:

1. Optional Tor transport (`react-native-tor`).
2. Optional per-message decoys: send N decoy envelopes to non-existent recipients alongside the real one.
3. Optional padding bucket randomization to defeat fingerprinting.

This phase is intentionally last. It only makes sense once everything below is correct.

---

## Phase 9 — Launch Hardening

Goal:

Prepare for external users and store submission.

Work:

1. Crash reporting WITHOUT off-device telemetry (local-only crash log; user manually submits).
2. App store metadata + privacy disclosures that match actual behavior.
3. Signed release pipeline.
4. Public security policy (responsible disclosure address).
5. Threat-model review by an outside cryptographer.

Exit criteria:

- TestFlight / Internal track stable on both platforms
- crash log can be exported by the user; no automatic upload
- privacy disclosures pass legal review

---

## Current Recommended Next Steps

From today’s state, the next correct work order is:

1. Replace the placeholder KDF (Phase 1.1)
2. Persist contact records + SAS state (Phase 2.1, 2.2)
3. Add a verified-vs-unverified visual everywhere a peer's name appears (Phase 2.3)
4. Ship the Android secure-screen baseline and privacy curtain on real Android 12+ hardware (Phase 3.1, 3.2)
5. Prototype blind compose in an immersive shell route before touching WebRTC (Phase 3.3, 3.4)

---

## Relationship To Other Docs

- `framework.md`
  - defines the target
- `workflow.md`
  - defines the order of work
- `pipeline.md`
  - defines how each change is executed safely
- `threat_model.md`
  - any new phase must pass a threat-model check before it ships
