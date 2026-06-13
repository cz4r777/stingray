// Stingray client types. The relay sees ONLY opaque ciphertext envelopes;
// these types live on the device.

// Vault blob format version. Bumped each time the on-disk layout or the KDF
// algorithm changes. The vault layer keeps a migration path for every prior
// version it has ever shipped so users are never locked out by an upgrade.
//   - v1 : 200k-round BLAKE2b hash chain KDF + secretbox payload (v0 placeholder)
//   - v2 : Argon2id (libsodium crypto_pwhash) + secretbox payload (T-001)
export type VaultVersion = 'v1' | 'v2';

export type Identity = {
  // 32-byte X25519 public key (curve25519), hex-encoded. Doubles as account id.
  pubkey_hex: string;
  // 32-byte Ed25519 public key for SAS (short-authentication-string) verification.
  sign_pubkey_hex: string;
  // Display name shown locally. NEVER sent to the relay.
  local_alias: string;
  created_at: string;
  // Which vault format unlocked this identity. UI may surface this in Settings.
  vault_version: VaultVersion;
};

export type Contact = {
  // Other party's X25519 pubkey hex.
  pubkey_hex: string;
  sign_pubkey_hex: string;
  // Local alias the user assigned. NEVER sent to the relay.
  alias: string;
  // SAS verification state. Until 'verified', UI shows a yellow padlock.
  sas_state: 'unverified' | 'verified' | 'mismatched';
  added_at: string;
};

export type Conversation = {
  peer_pubkey_hex: string;
  alias: string;
  last_plaintext_preview: string | null;
  last_at: string | null;
  unread: number;
};

// Plaintext message before envelope wrapping. Stays on device.
export type Plaintext = {
  id: string;
  from_pubkey_hex: string;
  to_pubkey_hex: string;
  body: string;
  sent_at: string;          // ISO; sender wall clock at compose time
  received_at: string;      // ISO; receiver wall clock at decrypt time
  direction: 'in' | 'out';
};

// What gets stored in the relay. INVARIANT I3: relay sees only these fields.
export type RelayEnvelope = {
  id: string;
  recipient_pubkey: string;   // hex; addressing only
  ciphertext: string;         // base64 of (nonce || box(plaintext, recipient_pub, ephemeral_priv))
  ephemeral_pubkey: string;   // base64; one-time per envelope
  bucket: number;             // padded ciphertext bucket (256, 1024, 4096, 16384)
  created_at: string;
  // No sender field. No subject. No length-on-the-wire. No timestamps beyond created_at.
};

export type TransportState =
  | { kind: 'wifi'; ssid: string | null }
  | { kind: 'ethernet' }
  | { kind: 'vpn'; underlying: 'wifi' | 'cellular' | 'unknown' }
  | { kind: 'cellular'; generation: '2G' | '3G' | '4G' | '5G' | 'unknown' }
  | { kind: 'offline' }
  | { kind: 'unknown' };

// INVARIANT I1: client refuses to transmit when this evaluates to false.
export type FaradayVerdict =
  | { allowed: true; transport: TransportState }
  | { allowed: false; transport: TransportState; reason: string };
