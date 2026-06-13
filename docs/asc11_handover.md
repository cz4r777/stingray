# ASC11 Handovers

## Archatech

- Repo root: `C:\Users\z\Desktop\code\stingray`
- Current app shape is valid for prototype stage:
  - Expo app
  - Expo Router file-based navigation
  - Supabase repurposed as an opaque ciphertext relay (no auth, no accounts, one table)
  - libsodium primitives via tweetnacl
  - on-device vault with passphrase-derived key
  - Faraday transport gate (refuse on cellular)
  - docs-first architecture discipline (12-file substrate following prior internal projects + a `threat_model.md`)
- Current codebase is mobile/web-unified. Production direction:
  - keep Expo app for iOS + Android
  - keep Expo web as a primary surface (Wi-Fi-only laptop is the canonical safe device)
  - add a self-hostable relay image (Phase 4)
  - add live P2P (WebRTC over Wi-Fi) once the offline path is bulletproof (Phase 3)
- Promote these to first-class platform concerns:
  - Argon2id KDF (replace placeholder hash chain) — Phase 1
  - SAS verification UX (persist verified/unverified/mismatched) — Phase 2
  - WebRTC P2P (relay-bypass) — Phase 3
  - Self-host relay (decouple from Supabase URL) — Phase 4
- Launch blockers from an architecture perspective:
  - production KDF + versioned vault format
  - explicit SAS verification surface
  - outside-cryptographer review of `threat_model.md`
  - confirmation that `EXPO_PUBLIC_FARADAY_MODE=true` is locked in all release profiles
  - no third-party telemetry SDKs in the bundle
- Near-term architecture recommendation:
  - stabilize this repo as the mobile-and-web product
  - add `supabase/migrations/` once a non-idempotent schema change is needed
  - keep the relay schema as small as it currently is — every column is a metadata leak

## Coder

- Work in: `C:\Users\z\Desktop\code\stingray`
- Preserve current foundations:
  - `app/` (Expo Router screens)
  - `lib/` (crypto, vault, transport, relay, envelope, identity, types)
  - `supabase/schema.sql`
  - `docs/` durable docs
- Highest-priority fixes:
  - `lib/crypto.ts`
    - `deriveVaultKey()` is a v0 hash-chain placeholder. Replace with `crypto_pwhash` (Argon2id) via `react-native-libsodium`. INVARIANT I8.
  - `lib/vault.ts`
    - Bump the storage keys to `.v2` and add a migration path on unlock.
    - Add auto-lock-on-suspend (Phase 1).
  - `lib/transport.ts`
    - Classify `vpn` more granularly when the platform exposes the underlying interface (iOS does in some cases). VPN-over-Wi-Fi can become an allowed default; VPN-over-cellular stays refused.
  - `app/(tabs)/contacts.tsx`
    - Contact persistence is a stub (`Alert.alert('Saved (stub)')`). Persist to an encrypted local store keyed by pubkey hex. INVARIANT I13.
  - `app/(tabs)/conversations.tsx`
    - Inbox roll-up reconstructs conversations from a single drain. Persist a local conversation store (encrypted) so the list survives restart without re-fetching the relay.
  - `app/chat/[peer].tsx`
    - On receive, only the live subscription is used. Add a "load history" path that drains and decrypts envelopes received while the screen was unmounted.
- Implementation order:
  1. Replace KDF (lib/crypto.ts, lib/vault.ts) + versioned blob.
  2. Persist contacts + SAS verification state (encrypted local store).
  3. Persist conversations / messages locally (encrypted) so the app is usable across restarts.
  4. Add auto-lock-on-suspend.
  5. Prototype WebRTC P2P over Wi-Fi (Phase 3 spike).
  6. Begin Phase 4 self-host work (drop the Supabase dependency).
- Product-quality notes:
  - The composer disables on Faraday block via `faraday?.allowed`; the conversations and contacts screens do NOT yet show a block banner. Add per-screen banners (or rely on the global one in `_layout.tsx`).
  - The 7-digit SAS in `contacts.tsx` is computed but not persisted. Persistence is required before any "verified" badge has meaning.
  - Replace `tweetnacl` with `react-native-libsodium` once native crypto is acceptable from a binary-size standpoint. Until then, tweetnacl's pure-JS implementation is the right tradeoff for cross-platform consistency.
  - Typed DB generation would help once the relay schema (currently one table) grows. Hand-maintained types are fine for v0.

---

## Design references

Six open-source projects sit alongside stingray as **read-only design references**. Their source trees are present in the repo for inspection but **must not be vendored** — license posture is noted per project. Use them in the priority order below.

> **Universal rule:** none of these are templates. They are pattern libraries. Read, learn, write your own.

### 1. adamant-im (primary architectural reference)

- **Where:** [adamant-im/](../../adamant-im/)
- **License:** GPL-3.0-only — design reference, no code copy
- **Why it's first:** closest existing match to stingray's stack and crypto stance. TypeScript + Capacitor + Vite (functional twin of Expo). Same primitives we use: `tweetnacl` + `sodium-browserify-tweetnacl` + `ed2curve` + `pbkdf2`. Same identity model: passphrase-as-seed, no recovery, no phone, no email.
- **What to lift:**
  - `vite-config/` and `vite-pwa.config.ts` — pattern for the Tor build mode (`vite --mode tor`); informs **T-006**.
  - Passphrase-as-seed UX strings — almost identical to our [framework.md](framework.md) mission.
  - Multi-target build matrix (PWA / Electron / Capacitor Android / Tor) — concrete reference for our Phase 4 self-host + Phase 8 onion ticket.
  - IndexedDB persistence patterns — useful when extending [T-002](tickets/T-002-persist-contacts.md) and [T-005](tickets/T-005-persist-conversations.md).
- **What to ignore:** the entire blockchain / wallet / web3 / IPFS surface. Not relevant to stingray.

### 2. session-android (primary mission reference)

- **Where:** [session-android/](../../session-android/) (this is the deprecated `oxen-io` snapshot; active fork lives at `github.com/session-foundation/session-android`)
- **License:** GPLv3 — design reference, no code copy
- **Why it matters:** the closest existing product on Earth to stingray's "pubkey-only identity + opaque mailbox + onion-routed transport" mission. Forked from Signal-Android with the central server replaced by the Oxen Service Node network.
- **What to lift:**
  - `libsession/` — onion-routing logic + swarm membership; the reference design for **T-006** (Tor/onion transport).
  - `libsignal/protobuf/` — the canonical Double Ratchet protobuf wire format. Reference for any future forward-secrecy work after T-001.
  - Session ID UX (long-pubkey display + QR exchange + "save this string" onboarding) — direct map to our [contacts.tsx](../app/(tabs)/contacts.tsx).
- **What to ignore:** the Oxen/$OXEN economic model (staking, blockchain rewards). Not relevant.
- **Active caveat:** Session **dropped the Double Ratchet** in 2022 for a non-ratcheting offline-friendly scheme. Read the design notes but **do not blindly emulate** — we want forward secrecy.

### 3. Themis (production crypto library)

- **Where:** [themis/](../../themis/)
- **License:** **Apache 2.0** — the only repo in this list that we *can* vendor
- **Why it matters:** Cossack Labs' audited crypto library. Has a working React Native binding (`react-native-themis`) and provides Secure Cell (storage), Secure Message (E2EE), Secure Session (forward secrecy), Secure Comparator (ZKP).
- **What to lift:**
  - `docs/examples/react-native/ThemisTest/` — working RN consumer; copy the integration shape.
  - Secure Cell → drop-in replacement for our vault `secretbox` in [T-001](tickets/T-001-argon2id-kdf.md).
  - Secure Message → potential replacement for our `tweetnacl.box` envelope crypto.
- **What to ignore:** the C / Go / Rust / PHP bindings. We only need the RN one.

### 4. TFC (threat-model and endpoint-security reference)

- **Where:** [tfc/](../../tfc/)
- **License:** GPLv3 — design reference, no code copy
- **Why it matters:** the most rigorous published threat-model for E2EE messaging against state-actor-grade adversaries with endpoint-compromise capability. The wiki (`Threat-model`, `Security-design`) is the prior art our [threat_model.md](threat_model.md) is in conversation with.
- **What to lift:**
  - Argon2id parameter choices (autotuned per device) — informs T-001 acceptance criteria.
  - The Tor-only refusal pattern → same shape as our Faraday gate. Validates [INVARIANT I1](invariants.md).
  - Per-message hash-ratchet design (BLAKE2b-based) — reference for future forward-secrecy work.
- **What to ignore:** the entire hardware data-diode architecture and the Qubes-VM variant. Out of scope for a mobile product.

### 5. Threema-Android (consumer-messenger UX reference)

- **Where:** [threema-android/](../../threema-android/)
- **License:** **AGPL-3.0** (the most viral license in this list) — design reference, no code copy. **Do not even paraphrase code closely.**
- **Why it matters:** a paid, production E2EE messenger with years of UX iteration. Closest thing to "what does mature look like" for the patterns we are writing tickets about.
- **What to lift:**
  - `app/src/main/java/ch/threema/` UI patterns — contact verification UX (the three-level red/yellow/green dot informs [T-003](tickets/T-003-sas-verification-ux.md)).
  - Persistence patterns — encrypted SQLite + key handling; reference for [T-005](tickets/T-005-persist-conversations.md).
  - Backup/restore flow — reference for any future "export to paper" work.
- **What to ignore:** anything tied to the Threema license-check infrastructure (Google Play LVL, Huawei HMS, Threema Shop, Threema Work). We have no paid component.

### 6. threema-ios (iOS counterpart UX reference)

- **Where:** [threema-ios/](../../threema-ios/)
- **License:** **AGPL-3.0** — same posture as threema-android.
- **Why it matters:** pairs with threema-android. Shows how the same E2EE-messenger patterns translate to Swift/SwiftUI with a shared Rust core (`libthreema/`).
- **What to lift:**
  - `Keychain/` — iOS Keychain integration patterns; cross-check for our [lib/vault.ts](../lib/vault.ts) since `expo-secure-store` wraps Keychain underneath.
  - `ThreemaNotificationExtension/` — privacy-respecting push without leaking content; reference for **Phase 6 push-wakeup**.
  - `ThreemaProtocols/` — protobuf wire format definitions; reference for the "envelope inner format" section of [api_contracts.md](api_contracts.md).
- **What to ignore:** App Store licensing code, WebRTC group-call code, Threema Work / OnPrem schemes.

---

## Cross-cutting do-not lists

These rules apply to ALL six references:

1. **Do not vendor any source file** from a GPL or AGPL repo, even "just one helper". License contamination is one of the few decisions that cannot be unwound after release.
2. **Do not paraphrase code closely** from AGPL projects (Threema). Re-derive from first principles or from the design intent stated in the project's own design docs.
3. **Do not copy strings, error messages, or accessibility labels.** They are creative works and travel with the source license.
4. **Do attribute when documenting prior art.** A line like "Design pattern inspired by Session's swarm-membership model (see [session-android/libsession/](../../session-android/libsession/))" in a `docs/` file is fine and good citizenship.
5. **The Apache-2.0-licensed Themis is the only exception:** vendoring `react-native-themis` as a dependency is fully compatible with any stingray license choice. Vendoring the underlying C source (for binary-size reasons or whatever) requires attribution under the Apache 2.0 NOTICE convention.
