# Architecture

## Current scope (v0)

- **Client:** Expo (React Native) app — single codebase targets iOS, Android, Web via React Native Web.
- **Relay backend:** Supabase free tier, used as an **opaque ciphertext mailbox only**.
  - **No auth.** There is no notion of "user" server-side. Identity = X25519 public key, generated on-device.
  - **One table.** `public.envelopes` stores opaque ciphertext addressed by recipient pubkey. See [supabase/schema.sql](../supabase/schema.sql).
  - **Realtime:** Supabase Realtime on `envelopes`. Powers inbox push.
- **No custom backend service in v0.** All app logic lives on the client. The relay is a dumb pipe.
- **Crypto:** envelope + signing primitives via `tweetnacl` (X25519, Ed25519, XSalsa20-Poly1305, BLAKE2b). Vault KDF via `react-native-libsodium` (Argon2id `crypto_pwhash` at MODERATE profile — see T-001).
- **Vault:** `expo-secure-store` on native (platform keystore / keychain), AsyncStorage on web. Encrypted blob in `.v2` format (Argon2id KDF + params persisted in-blob). Legacy `.v1` blobs migrate forward on first unlock.
- **Transport gate:** `expo-network` polled at 4-second intervals. See [INVARIANT I1](invariants.md).

---

## Topology

```
┌─────────────────────────────────────────────────────────────────┐
│ Expo client (one codebase → iOS, Android, Web)                  │
│   app/                  screens (Expo Router file-based)        │
│   lib/identity.tsx      IdentityProvider context (unlocked vault)│
│   lib/vault.ts          encrypted local keystore                │
│   lib/crypto.ts         libsodium primitives + padding          │
│   lib/transport.ts      Faraday gate (refuse on cellular)       │
│   lib/relay.ts          opaque-relay client                     │
│   lib/envelope.ts       compose + drain helpers                 │
└─────┬───────────────────────────────────────────────────────────┘
      │ HTTPS / WSS — but only when Faraday gate evaluates to "allowed"
      │ Cellular path is REFUSED, not "tried with TLS"
      ▼
┌─────────────────────────────────────────────────────────────────┐
│ Relay (Supabase Postgres + Realtime)                            │
│   public.envelopes                                              │
│     - recipient_pubkey (hex)                                    │
│     - ciphertext (base64; opaque)                               │
│     - ephemeral_pubkey (base64; per-envelope)                   │
│     - bucket (256/1024/4096/16384)                              │
│     - created_at                                                │
│   RLS: insert by anyone, read/delete by anyone (no accounts)    │
│   Expiry job: envelopes deleted after 30 days                   │
│   NO sender column, NO subject, NO thread id, NO read state     │
└─────────────────────────────────────────────────────────────────┘
```

The recipient's app:
1. Subscribes to `envelopes` filtered by `recipient_pubkey = my_pubkey`.
2. Decrypts each new row with `box_open(ciphertext, ephemeral_pubkey, my_secret)`.
3. On successful decrypt: persist plaintext locally, then DELETE the envelope from the relay (ack-delete).
4. On failed decrypt: drop silently (do not log ciphertext — [INVARIANT I12](invariants.md)).

When live P2P (Phase 3) lands, the relay carries only:

```
                       ┌─► WebRTC datachannel (Wi-Fi only)
Sender ───────────────┤
                       └─► Relay (offline fallback) — same opaque envelopes
```

---

## File layout (client)

```
stingray/
├── app/                        Expo Router screens
│   ├── _layout.tsx               root stack + auth gate + Faraday banner
│   ├── index.tsx                 redirect to /(tabs)/conversations
│   ├── (auth)/                   unauthenticated routes
│   │   ├── _layout.tsx
│   │   ├── unlock.tsx              passphrase → unlock vault
│   │   └── enroll.tsx              first-run; generate keypair
│   ├── (tabs)/                   unlocked routes
│   │   ├── _layout.tsx
│   │   ├── conversations.tsx       inbox roll-up
│   │   ├── contacts.tsx            add by pubkey + SAS verification
│   │   └── settings.tsx            transport status, lock, panic wipe
│   └── chat/[peer].tsx           encrypted 1:1 chat
├── lib/
│   ├── crypto.ts                 libsodium wrapper, padding, SAS
│   ├── vault.ts                  encrypted local keystore + panic wipe
│   ├── transport.ts              Faraday gate
│   ├── relay.ts                  Supabase client for opaque envelopes
│   ├── envelope.ts               compose + drain helpers
│   ├── identity.tsx              React context (unlocked vault + faraday)
│   └── types.ts                  TypeScript types
├── supabase/
│   ├── schema.sql                idempotent; source of truth for the relay
│   └── README.md                 relay setup
├── docs/                         THIS DIRECTORY (durable knowledge)
├── app.json                      Expo config (iOS, Android, Web)
├── package.json
├── tsconfig.json
├── babel.config.js
└── .env.example
```

---

## Data flow examples

### Enrollment
1. App detects no vault on disk → routes to `/(auth)/enroll`.
2. User enters alias + passphrase (≥12 chars; UI enforces).
3. Client calls `lib/vault.ts createVault(pass, alias)`:
   - Random 16-byte salt.
   - Vault key = `deriveVaultKey(passphrase, salt)`.
   - X25519 keypair and Ed25519 keypair generated.
   - Plaintext payload JSON-encoded.
   - `secretbox(payload, key)` → blob written to `expo-secure-store`.
   - Salt written to `expo-secure-store`.
4. Vault is immediately unlocked; user is routed to `/(tabs)/conversations`.

### Send
1. User opens a conversation. Composer disabled if Faraday gate ≠ "allowed".
2. On send: `composeAndSend({ from, to, body })`:
   - Inner JSON serialised with from/to/body/sent_at.
   - `sealEnvelope(inner, recipientPub)`: pad → fresh ephemeral keypair → `box(padded, nonce, recipientPub, ephemeralSec)`.
   - INVARIANT I1: `assertFaraday()` checked again inside `sendEnvelope`.
   - INSERT `envelopes(recipient_pubkey, ciphertext, ephemeral_pubkey, bucket)` via the anon key.
3. Realtime push fires to the recipient (if subscribed).

### Receive
1. App subscribes via `subscribeInbox(my_pubkey, handler)` on conversation screens.
2. On INSERT: `openEnvelope(ciphertext, ephemeral_pubkey, my_secret)`.
   - On success: append to local conversation store; emit ack-delete via `relay.from('envelopes').delete()`.
   - On failure: drop silently. Do NOT log ciphertext or addressing metadata. INVARIANT I12.

### Panic wipe
1. User confirms in two-step modal.
2. `panicWipe()` deletes BOTH the salt key and the blob key from `expo-secure-store`.
3. App state is reset to "no vault"; user is routed back to `/(auth)/enroll`.
4. Envelopes already sent to the user remain on the relay until 30-day expiry. They are encrypted to a key the wiped device no longer holds.

---

## What's intentionally NOT in v0

| Deferred | Why deferred | Triggering condition to build |
|---|---|---|
| Argon2id KDF (replacing the placeholder hash chain) | Needs a native libsodium binding | Phase 1 — before any external launch |
| Live P2P over WebRTC | Requires a custom Expo plugin + STUN/TURN | Phase 3 |
| Push wakeup via APNs/FCM | Threat-model trade-off; needs a payload-less integration | Phase 5 |
| Multi-device | Adds device-link UX and revocation | Phase 6+ |
| Hardware token unlock | Needs platform credential APIs | Phase 6 |
| Self-host relay image | Currently depends on Supabase URL | Phase 4 |
| Tor transport | High-threat mode; requires a native plugin | Phase 7 |
| Group chat | Adds key-management complexity | Not on the roadmap until 1:1 is finished |
| Attachments | Needs encrypted-blob storage strategy | Phase 6+ |
| Voice / video | Out of scope for v1 | Not on the roadmap |

Each row is a future PR. They are NOT bugs — they are sequenced work.
