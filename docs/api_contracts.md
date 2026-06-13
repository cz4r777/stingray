# API Contracts

Every relay surface the client touches. If you change one of these, update this doc in the same commit. Keep the relay's surface area small: every field added here is a potential metadata leak.

## Tables

### `public.envelopes`

The entire relay schema is this one table.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | server-side default; opaque to the client beyond ack-delete |
| `recipient_pubkey` | `text` not null | 64-char lowercase hex (32-byte X25519 pubkey). The ONLY addressing field. [INVARIANT I3](invariants.md) |
| `ciphertext` | `text` not null | base64 of (nonce ‖ box(padded_plaintext, recipient_pub, ephemeral_priv)). Server cannot decrypt. |
| `ephemeral_pubkey` | `text` not null | base64 of the fresh-per-envelope X25519 ephemeral pubkey. Required for box-open by the recipient. |
| `bucket` | `int` not null | one of `256`, `1024`, `4096`, `16384`. CHECK constraint enforced. [INVARIANT I5](invariants.md) |
| `created_at` | `timestamptz` not null default `now()` | used by the 30-day expiry job |

**Fields the server MUST NEVER hold** (each is its own invariant, see [forbidden_patterns.md §B1](forbidden_patterns.md)):

- sender public key (sender is anonymous to the relay — the ephemeral pubkey is one-time)
- conversation / thread id
- read state / delivery receipt
- plaintext bucket (clients pad before encrypt; bucket is the post-encryption frame size only)
- any per-row "owner" — the relay has no accounts

### `public.envelopes` operations

| Op | Allowed for | RLS predicate | Notes |
|---|---|---|---|
| INSERT | `anon`, `authenticated` | `with check (true)` | Anyone with the recipient's pubkey can post. There is no auth — the cryptographic addressing IS the auth. |
| SELECT | `anon`, `authenticated` | `using (true)` | Client filters by `recipient_pubkey = my_pubkey` from its end. An attacker who guesses pubkeys learns only that mail exists. |
| DELETE | `anon`, `authenticated` | `using (true)` | Recipients ack-delete after decrypt. [INVARIANT I11](invariants.md). |

This is the entire RLS posture. The privacy boundary is the **encryption**, not the database policy. Treating RLS as the boundary would be a security regression — see [forbidden_patterns.md B1.5](forbidden_patterns.md).

## Functions / RPCs

### `public.expire_stale_envelopes() → int`

Server-side maintenance only. Deletes envelopes older than 30 days, returns the count. Run by ops on a daily cadence — see [deployment.md §Relay maintenance](deployment.md).

No `authenticated` grants required; ops uses the service-role key for this job. The function is `security definer` so a misconfigured cron under the wrong role still works.

## Realtime channels

### `envelopes:<short-prefix-of-recipient-pubkey>`

- **Subscribe filter:** `postgres_changes` on `INSERT`, `schema=public`, `table=envelopes`, `filter=recipient_pubkey=eq.<full-pubkey-hex>`.
- **Auth:** none required — the relay grants read to everyone. The filter is a routing convenience, not a security boundary. An attacker can still subscribe with someone else's pubkey and observe the same opaque rows; this is fine because they cannot decrypt.

## Environment variables (client)

| Name | Required | Notes |
|---|---|---|
| `EXPO_PUBLIC_RELAY_URL` | yes | Supabase project URL of the relay |
| `EXPO_PUBLIC_RELAY_ANON_KEY` | yes | **anon** key only. Service-role NEVER ships to the client. [INVARIANT I14](invariants.md). |
| `EXPO_PUBLIC_FARADAY_MODE` | optional | `'true'` (default) enables the cellular-refusal gate. `'false'` is permitted only for QA on simulated networks. [INVARIANT I1](invariants.md) |

`EXPO_PUBLIC_*` prefix is required for Expo to expose vars to the client bundle. Anything WITHOUT that prefix stays server-side (relevant if you later add Edge Functions or a self-host bridge).

## On-device storage

These are not on the wire, but they are part of the contract because external tools (vault export, backup) depend on them.

### `expo-secure-store` keys

| Key | Format | Notes |
|---|---|---|
| `stingray.vault.salt.v1` | base64 of 16-byte random salt | legacy v0 KDF salt; read-only after T-001 migration; cleared by `panicWipe()` |
| `stingray.vault.blob.v1` | base64 of secretbox(payload, vaultkey-v1) | legacy v0 vault payload; migrated to `.v2` on first unlock after T-001 |
| `stingray.vault.salt.v2` | base64 of 16-byte random salt | Argon2id KDF salt; never reused; required to unlock `.v2` blob (T-001) |
| `stingray.vault.blob.v2` | base64 of secretbox(payload, vaultkey-v2) | current encrypted vault payload — see "Vault payload" below |
| `stingray.contacts.v1` | base64 of secretbox(JSON.stringify(Record<pubkey_hex, Contact>), vault_key) | encrypted local contacts store (T-002). Read/written via `lib/local_store.ts`; the vault key comes from `UnlockedVault.vault_key`. Cleared by `panicWipe()`. NEVER crosses the network ([INVARIANT I13](invariants.md)). Each `Contact.sas_state` is `'unverified' \| 'verified' \| 'mismatched'`; T-003 wires the explicit "I verified" confirm modal as the only path to `'verified'` and enforces "mismatched is immovable" at both the data layer (`updateSasState` / `markVerified` refuse to overwrite mismatched) and the UI. |
| `stingray.conversations.v1` | base64 of secretbox(JSON.stringify(Record<peer_pubkey_hex, Plaintext[]>), vault_key) | encrypted local conversation history (T-005). Per-peer arrays capped at `MAX_PER_PEER = 500` messages FIFO. Each message has a client-generated `id` used for dedupe on re-receive. Persisted BEFORE the relay ack-delete fires ([INVARIANT I11](invariants.md)) so a crash mid-flow leaves a redeliverable envelope, never a half-persisted message. Cleared by `panicWipe()`. NEVER crosses the network. |

### Vault payload

JSON object inside the secretbox:

| Key | Type | Notes |
|---|---|---|
| `box_sk_hex` | hex(32) | X25519 secret key |
| `box_pk_hex` | hex(32) | X25519 public key (the user's identity) |
| `sign_sk_hex` | hex(64) | Ed25519 secret key (used for SAS-binding signatures, future) |
| `sign_pk_hex` | hex(32) | Ed25519 public key |
| `local_alias` | string | the user's local-only alias (NEVER sent over the wire) |
| `created_at` | ISO 8601 string | enrollment time |

When the format changes, bump the suffix (`.v2`) and write a migration that reads `.v1` once, re-encrypts under the new layout, and deletes the old key.

## Wire envelope (client ↔ relay)

The relay row IS the wire format. Sender → relay:

```json
{
  "recipient_pubkey": "<64 hex>",
  "ciphertext": "<base64; nonce ‖ ciphertext>",
  "ephemeral_pubkey": "<base64; 32 bytes>",
  "bucket": 1024
}
```

Receiver decodes:

```
plaintext = box_open(
  ciphertext_after_nonce,
  nonce       = ciphertext[0..24],
  ephemeral_pubkey,
  my_box_secret_key,
)
inner_json = unpad(plaintext)   // strips the 4-byte length prefix and zero pad
```

Inner JSON layout (encrypted, not visible to relay):

| Key | Type | Notes |
|---|---|---|
| `id` | string | client-side random id; recipient may store for dedupe |
| `from_pubkey_hex` | hex(64) | sender — visible to recipient only |
| `to_pubkey_hex` | hex(64) | recipient — redundant but useful for chat-side dedupe |
| `body` | string | the message text |
| `sent_at` | ISO 8601 | sender wall clock |
| `received_at` | ISO 8601 | set by recipient on decrypt (not over the wire) |
| `direction` | `"in" \| "out"` | set locally |
