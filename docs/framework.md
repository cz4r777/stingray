# Framework — Product Design And Build Intent

> This file defines what the app is, why it exists, what systems it needs, and what design principles govern decisions.
> It is not the engineering pipeline and it is not the step-by-step build order.

---

## Mission

**Return private communication to the user against a cellular-tower adversary.**

stingray is a peer-to-peer end-to-end encrypted messenger designed to thwart [IMSI catcher / cell-site simulator](threat_model.md) surveillance — the class of attack colloquially called a "stingray", from which this project takes its name.

The author built this after experiencing remote interception of his phone — what felt like first-person-view monitoring of communications — by a hostile actor using a cellular-tower simulator. Conventional mobile messaging is intercepted at the radio layer regardless of the application's transport security, because the carrier and any actor capable of masquerading as the carrier sits in the path of every byte.

stingray's defense is simple and absolute: **never route over the cellular radio**. The app refuses to transmit when the only available transport is cellular. Wi-Fi, Ethernet, and (with caveats) VPN-over-Wi-Fi are the supported paths. All content is end-to-end encrypted on top of that, so even if the supporting relay is hostile or compromised it learns nothing of substance.

---

## What This Product Is

This is not a general-purpose social messenger. It is **a privacy tool first, a messenger second.**

It is:

- a private 1:1 messaging app between people who already know each other and can exchange a public key out-of-band
- end-to-end encrypted with no plaintext ever stored or transmitted server-side
- transport-restricted: cellular is refused
- metadata-minimised: the relay sees only "recipient public key X has a piece of ciphertext of bucket size Y"
- local-vault-first: identity is a keypair generated on-device and protected by a user passphrase
- display-hardened on supported Android devices: sensitive screens can be shielded from ordinary screenshots, standard screen recording, and casual visual disclosure
- recovery-free: lose the passphrase → lose the account. Stronger than "we can reset it"

It is NOT:

- a discovery / social-graph product (no contact search by phone, no public directory)
- a group chat product (1:1 only in v0–v1; group adds attack surface)
- a calls / media product (deferred until text path is rock-solid)
- a malware-removal or anti-RAT product — a compromised device remains a compromised device
- a replacement for a regular phone — the user keeps a normal phone for everything else; stingray runs on a Wi-Fi-only device or with airplane mode + Wi-Fi enabled

The experience should feel:

- terse, deliberate, slightly paranoid
- failure-visible: every refusal explains itself ("Faraday block — cellular detected")
- recovery-honest: there is no "forgot password"; we say so up-front
- minimal: fewer features = fewer holes

---

## Product Pillars

### 1. Transport refusal beats transport hardening

A great deal of cryptographic engineering exists to make cellular traffic harder to intercept. Stingray sidesteps the entire problem: **do not transmit on cellular**. The cell radio is the adversary's home turf. Walking away from it is more reliable than competing on it.

Non-negotiables:

- The Faraday gate ([INVARIANT I1](invariants.md)) refuses every outbound and inbound network operation when only cellular is available.
- A persistent banner shows the current transport classification so the user is never in doubt.
- VPN over an unknown underlying interface is refused by default — a VPN encrypts content but does not change which radio is transmitting. The carrier still sees endpoint metadata.

### 2. End-to-end means end-to-end

The relay is an opaque pipe. Anyone (including us) reading the relay's database learns only that addressed mail exists and roughly when. The server does not have a key, does not have a session, and does not have a notion of "user account".

- All keys live on the device.
- Plaintext exists only in the sender's outgoing buffer and the recipient's local store.
- Server-side logging is restricted to addressing metadata; ciphertext is never decrypted server-side because no key exists server-side that could decrypt it. See [INVARIANT I3](invariants.md).

### 3. Metadata minimisation

Encryption hides content. Metadata leaks who-talks-to-whom, when, and how much. We minimise it by:

- Padding every ciphertext to one of four fixed buckets (256 / 1024 / 4096 / 16384 bytes).
- Using a fresh ephemeral sender keypair per envelope — the relay does not see who sent each message, only who it is addressed to.
- Refusing read receipts, typing indicators, presence, and any other "informative" side channel.

### 4. Local vault first

Identity is a private key. The key lives in an encrypted vault unlocked by the user's passphrase. There is no recovery path. This is a deliberate tradeoff: the alternative (server-side recovery) re-introduces a trusted intermediary, which is exactly what we are removing.

### 5. Visible refusal

When something is unsafe, the app stops and explains. It does not silently "try its best". A user looking at the screen always knows whether they are operating on a safe transport. See [forbidden_patterns.md B5.1](forbidden_patterns.md).

### 6. Display hardening is real, but not magic

For supported Android devices, stingray should harden the display surface:

- block ordinary screenshots and standard screen recording on sensitive routes
- blank app-switcher previews when sensitive content is visible
- resist overlay-based clickjacking where the platform allows it
- offer a blind-compose / secure-shell mode for users who want less visual leakage during message entry

But:

- immersive fullscreen is a UX mode, not a trust boundary
- a custom in-app compose pad is IME avoidance, not "keylogger proof"
- privileged malware, accessibility spyware, rooted devices, and true remote-access trojans are outside the app's ability to neutralise

---

## Core User Journeys

### Journey A: Enrollment

1. User opens the app on a Wi-Fi-only device (or with airplane mode + Wi-Fi).
2. App generates an X25519 keypair and an Ed25519 keypair.
3. User chooses a passphrase ≥ 12 characters. KDF derives the vault key.
4. Keypair is encrypted under the vault key, stored in `expo-secure-store`.
5. User now sees their public key and can share it out-of-band.

### Journey B: Adding a contact

1. User receives a peer's public key over an independent channel (in-person, paper, QR on an air-gapped device, signed email).
2. User pastes the key into the Contacts screen.
3. App computes a 7-digit SAS code from both public keys ([INVARIANT I9](invariants.md)).
4. Both parties compare the SAS code out-of-band.
5. If matched, the user marks the contact verified. The UI shows a green padlock; until then, yellow.

### Journey C: Sending a message

1. User opens a conversation.
2. App checks the Faraday gate. If blocked, the send button is disabled with the reason.
3. User types text. In secure-shell mode on supported Android devices, the outgoing draft may be masked or composed through an in-app pad to reduce visual leakage.
4. On send: pad → seal with the recipient's public key + a fresh ephemeral key → push the envelope to the relay.
5. The relay broadcasts INSERT to anyone subscribed to that recipient pubkey. The recipient's app fetches, decrypts locally, and ack-deletes the envelope on the relay.

### Journey D: Panic wipe

1. User taps Panic Wipe (under Settings or on the unlock screen).
2. App deletes the salt and the encrypted vault blob.
3. The on-disk state is now indistinguishable from a fresh install.

---

## Product Surface Areas

### 1. Vault and identity

- on-device keypair generation
- passphrase-derived vault key (scrypt-equivalent)
- panic wipe
- (deferred) export keys to a paper backup; import on a new device

### 2. Contacts

- add by public key (paste / QR — QR deferred)
- SAS verification
- local alias and notes
- (deferred) revocation: mark a contact's prior keys as superseded

### 3. Messaging

- 1:1 text chat
- send / receive via opaque relay
- length-padded envelopes
- decrypt-then-delete on read
- (deferred) live P2P over Wi-Fi (WebRTC data channel)
- (deferred) attachments

### 4. Transport gate

- continuous network-state polling
- classification: wifi / ethernet / vpn / cellular / offline
- block banner + send disable
- per-session VPN-on-Wi-Fi override (manual attestation)

### 5. Settings

- transport status
- vault lock
- panic wipe
- secure-shell / shield-mode status

### 6. Secure shell (Android-focused hardening)

- secure-screen mode for sensitive routes
- immersive fullscreen terminal presentation
- privacy curtain / shield mode
- blind compose / masked outgoing draft
- overlay resistance on supported Android versions
- dedicated-device / kiosk deployment as a separate high-friction mode

---

## Refused Features (v0 → v1)

Each of these adds surface area we intentionally do not want:

| Feature | Why refused |
|---|---|
| Phone-number-based discovery | Re-introduces a carrier-knowable identifier; defeats the point. |
| Contact-book sync | Same: leaks the social graph to a cloud provider. |
| SMS fallback | The literal worst case — SMS rides the cellular radio under the adversary's control. |
| Server-side "account recovery" | Requires server-held material that can decrypt user data — contradicts E2EE. |
| Read receipts / typing / presence | Side-channel metadata leak. See [forbidden_patterns.md B4.3](forbidden_patterns.md). |
| Push notifications via APNs/FCM with payload | APNs/FCM payloads are visible to the platform provider. (Wakeup-only push with no payload is fine and is on the deferred list.) |
| Group chat | Adds key-management complexity and metadata fan-out. Reconsider only after 1:1 path is mature. |
| Cloud backup | Same argument as server-side recovery. |

---

## Design Direction

### Product tone

- terse
- dark UI (low-glow OLED preserves battery and reduces shoulder-surfing)
- monospace where keys appear so transposition errors are visible
- failure messages that name the underlying reason, not a euphemism

Avoid:

- cute privacy theatre ("military-grade encryption!")
- chat-app skeuomorphism (typing dots, reaction emojis, GIF pickers)
- overclaiming platform hardening ("invisible to malware", "blocks every remote viewer")
- nudging the user to enable convenience features that weaken the threat model

### UI principles

- one accent color (cyber-green) used only for trusted state — never for marketing
- destructive actions always require a second confirm
- public keys are always rendered monospace; aliases never substitute for the key in security-relevant UI
- the Faraday banner is sticky and unmissable when triggered
- secure-shell mode should feel like a dedicated terminal, not like a generic chat app with a dark theme

### UX rules

- no feature is allowed to hide the Faraday state
- every "convenience" feature must pass the threat-model review ([threat_model.md](threat_model.md))
- consent is implicit only for outbound communication the user manually triggered; everything else requires an explicit toggle

---

## System Shape

### Current implementation direction

- Expo app for iOS + Android + Web (web build is most useful on Wi-Fi-only laptops)
- Supabase repurposed as an opaque ciphertext relay
- libsodium primitives via tweetnacl
- Android secure-shell hardening is a planned product track; Android 12+ is the recommended floor for any hardened release promise

### Intended mature direction

- self-hostable relay (drop the dependency on Supabase entirely; ship a minimal Postgres + WebSocket image)
- live P2P over WebRTC when both peers are online on the same LAN or a hole-punchable network
- optional Tor relay for high-threat users
- hardware-token unlock (YubiKey / passkey) as an alternative to passphrase

---

## Data Design Principles

- schema changes must reduce server-side metadata or be neutral; they may not add it
- the relay never gains a notion of "user" or "session"
- ciphertext on the wire and at rest is always padded to a bucket
- no client-side log line may include a plaintext body or a contact alias
- panic wipe must be local and synchronous — no "schedule deletion" round trip

---

## Launch Standard

stingray is not "1.0" until all of the following are true:

- Faraday gate is enforced on every send and receive code path and shown to the user
- Vault encryption uses a proper password-hashing function (libsodium pwhash or Argon2id), not the v0 placeholder
- SAS verification is exposed in the contact-add flow and recorded persistently
- Panic wipe is reachable from the unlock screen (you can wipe before unlocking)
- If secure-shell mode is advertised, sensitive Android screens block ordinary screenshots / standard recording and blank app-switcher previews on supported devices
- If secure-shell mode is advertised, the promise is scoped to Android 12+ and explicitly excludes compromised-device defenses
- Self-host instructions for the relay exist and have been validated against a clean Postgres
- Threat model document is reviewed by at least one cryptographer outside the author
- No analytics, no telemetry, no crash reporting that ships device metadata off the device

---

## Relationship To Other Docs

- `framework.md`
  - what we are building and why
- `workflow.md`
  - what order we build it in
- `pipeline.md`
  - how code and schema changes move safely through implementation and deploy
- `threat_model.md`
  - the adversary we are defending against; updated whenever the threat picture changes

If these docs conflict:

1. `threat_model.md` decides what is in/out of scope as a defense
2. `framework.md` decides product intent
3. `workflow.md` decides build sequence
4. `pipeline.md` decides execution discipline
