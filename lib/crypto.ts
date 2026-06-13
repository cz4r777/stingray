// libsodium subset via tweetnacl (envelope/box primitives) + react-native-libsodium
// (Argon2id KDF only, T-001). All multi-byte values are kept as Uint8Array internally;
// hex/base64 at the boundary.
//
// See docs/invariants.md I2, I3, I5, I6, I7, I8 and docs/security_rules.md §3.
// KDF provider selection rationale: docs/spikes/T-001-kdf-provider-comparison.md.

import 'react-native-get-random-values';
import nacl from 'tweetnacl';
import { decodeBase64, encodeBase64, decodeUTF8, encodeUTF8 } from 'tweetnacl-util';
import sodium from 'react-native-libsodium';

export type KeyPair = { publicKey: Uint8Array; secretKey: Uint8Array };

// Length-padding buckets. Every ciphertext on the wire is padded to one of these.
// See docs/invariants.md I5 (metadata minimization).
export const BUCKETS = [256, 1024, 4096, 16384] as const;

export function newBoxKeyPair(): KeyPair {
  return nacl.box.keyPair();
}

export function newSignKeyPair(): KeyPair {
  return nacl.sign.keyPair();
}

export function hex(buf: Uint8Array): string {
  return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function fromHex(s: string): Uint8Array {
  if (s.length % 2 !== 0) throw new Error('odd-length hex');
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function b64(buf: Uint8Array): string { return encodeBase64(buf); }
export function fromB64(s: string): Uint8Array { return decodeBase64(s); }

// ----- sealed box (anonymous to-recipient) used for the offline relay mailbox -----
// Each envelope uses a fresh ephemeral keypair so the sender is unlinkable on the relay.
// See docs/invariants.md I6.
export function sealEnvelope(plaintext: Uint8Array, recipientPub: Uint8Array): {
  ciphertext: Uint8Array;
  ephemeralPub: Uint8Array;
  bucket: number;
} {
  const ephemeral = nacl.box.keyPair();
  const padded = padToBucket(plaintext);
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const box = nacl.box(padded.bytes, nonce, recipientPub, ephemeral.secretKey);
  const out = new Uint8Array(nonce.length + box.length);
  out.set(nonce, 0);
  out.set(box, nonce.length);
  return { ciphertext: out, ephemeralPub: ephemeral.publicKey, bucket: padded.bucket };
}

export function openEnvelope(
  ciphertext: Uint8Array,
  ephemeralPub: Uint8Array,
  recipientSec: Uint8Array,
): Uint8Array | null {
  const nonce = ciphertext.slice(0, nacl.box.nonceLength);
  const box = ciphertext.slice(nacl.box.nonceLength);
  const opened = nacl.box.open(box, nonce, ephemeralPub, recipientSec);
  if (!opened) return null;
  return unpad(opened);
}

// ----- length padding -----
// Frame layout: [4-byte big-endian plaintext length][plaintext][zero padding to bucket].
function padToBucket(plaintext: Uint8Array): { bytes: Uint8Array; bucket: number } {
  const need = plaintext.length + 4;
  const bucket = BUCKETS.find((b) => b >= need);
  if (!bucket) throw new Error('plaintext exceeds largest bucket');
  const out = new Uint8Array(bucket);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, plaintext.length, false);
  out.set(plaintext, 4);
  // remainder already zero
  return { bytes: out, bucket };
}

function unpad(padded: Uint8Array): Uint8Array {
  if (padded.length < 4) throw new Error('framed buffer too small');
  const dv = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
  const len = dv.getUint32(0, false);
  if (len > padded.length - 4) throw new Error('framed length exceeds buffer');
  return padded.slice(4, 4 + len);
}

// =============================================================================
// Passphrase KDF for the local vault — Argon2id via libsodium (T-001).
// =============================================================================
//
// Replaces the v0 200k-round BLAKE2b hash chain. Argon2id is memory-hard, which
// imposes per-guess cost on an attacker who captures the on-disk blob — that is
// the load-bearing property [INVARIANT I8](../docs/invariants.md) requires.
//
// Spike: see docs/spikes/T-001-kdf-provider-comparison.md.
// libsodium reference for parameter choice:
//   https://doc.libsodium.org/password_hashing/default_phf

export type KdfAlgorithm = 'argon2id13';

export type Argon2idParams = {
  alg: 'argon2id13';
  // libsodium opslimit — passes. MODERATE = 3.
  opslimit: number;
  // libsodium memlimit — bytes. MODERATE = 256 MiB.
  memlimit: number;
  // Derived key length in bytes. Vault key for XSalsa20-Poly1305 secretbox = 32.
  keylen: number;
};

// Parameter set persisted inside each vault so future bumps don't lock users out.
// Tuned for ~300–800 ms unlock on a mid-2025 phone. Within the 100ms–2s
// acceptance window from T-001.
export const ARGON2ID_MODERATE: Argon2idParams = {
  alg: 'argon2id13',
  opslimit: 3,                  // sodium.crypto_pwhash_OPSLIMIT_MODERATE
  memlimit: 256 * 1024 * 1024,  // sodium.crypto_pwhash_MEMLIMIT_MODERATE = 256 MiB
  keylen: 32,
};

// One-shot init for react-native-libsodium. Safe to call repeatedly; the binding
// memoises. Awaited inside deriveVaultKey on first call.
let _sodiumReady: Promise<void> | null = null;
function ensureSodiumReady(): Promise<void> {
  if (!_sodiumReady) {
    // react-native-libsodium exposes a `ready` promise on iOS/Android; on web
    // it's effectively a no-op. Either way we await once and cache.
    _sodiumReady = (sodium as unknown as { ready?: Promise<void> }).ready
      ?? Promise.resolve();
  }
  return _sodiumReady;
}

// Derive a 32-byte vault key from (passphrase, salt) under the given params.
// The salt is 16 random bytes per vault (never reused — INVARIANT I8).
// Returns a Uint8Array of length params.keylen.
export async function deriveVaultKey(
  passphrase: string,
  salt: Uint8Array,
  params: Argon2idParams = ARGON2ID_MODERATE,
): Promise<Uint8Array> {
  if (params.alg !== 'argon2id13') {
    throw new Error(`Unknown KDF algorithm: ${(params as { alg: string }).alg}`);
  }
  if (salt.length !== 16) {
    throw new Error(`Argon2id salt must be 16 bytes, got ${salt.length}`);
  }
  await ensureSodiumReady();
  const key: Uint8Array = await sodium.crypto_pwhash(
    params.keylen,
    passphrase,
    salt,
    params.opslimit,
    params.memlimit,
    // ALG_ARGON2ID13 = 2 in libsodium's algorithm enum.
    sodium.crypto_pwhash_ALG_ARGON2ID13 ?? 2,
  );
  return key;
}

// ---------------------------------------------------------------------------
// LEGACY v0 KDF — kept ONLY so the .v1 → .v2 migration can unlock the prior
// blob once on each device. Do NOT call from any new code path; new vaults
// use deriveVaultKey() above.
// ---------------------------------------------------------------------------
export async function deriveVaultKeyV1Legacy(
  passphrase: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  let h = nacl.hash(concat(decodeUTF8(passphrase), salt));
  for (let i = 0; i < 200_000; i++) h = nacl.hash(h);
  return h.slice(0, 32);
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const o = new Uint8Array(a.length + b.length);
  o.set(a, 0); o.set(b, a.length);
  return o;
}

// ----- symmetric AEAD for vault contents -----
// XSalsa20-Poly1305 secretbox; nonce prefixed.
export function vaultEncrypt(plaintext: Uint8Array, key: Uint8Array): Uint8Array {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const box = nacl.secretbox(plaintext, nonce, key);
  const out = new Uint8Array(nonce.length + box.length);
  out.set(nonce, 0); out.set(box, nonce.length);
  return out;
}

// Returns null on ANY tamper / wrong-key — never partial plaintext (I12 spirit).
export function vaultDecrypt(ciphertext: Uint8Array, key: Uint8Array): Uint8Array | null {
  const nonce = ciphertext.slice(0, nacl.secretbox.nonceLength);
  const box = ciphertext.slice(nacl.secretbox.nonceLength);
  return nacl.secretbox.open(box, nonce, key);
}

// ----- SAS (short authentication string) -----
// Two parties compare a short word/number derived from both pubkeys.
// Defends against active MITM during pubkey exchange. See docs/invariants.md I9.
export function sasCode(myPub: Uint8Array, theirPub: Uint8Array): string {
  const ordered = compareBytes(myPub, theirPub) < 0
    ? concat(myPub, theirPub)
    : concat(theirPub, myPub);
  const h = nacl.hash(ordered);
  const num = (h[0] << 16) | (h[1] << 8) | h[2];
  return num.toString(10).padStart(7, '0').slice(0, 7);
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

export const utf8 = { encode: decodeUTF8, decode: encodeUTF8 };
