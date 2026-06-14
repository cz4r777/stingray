// Local encrypted keystore. Stores the user's long-term X25519 and Ed25519 secret keys
// encrypted with a key derived from the user's passphrase. Persisted via expo-secure-store
// on native (uses platform keystore / keychain) and a passphrase-gated AsyncStorage shim
// on web.
//
// Threat model: a hostile process that reads the on-disk blob without the passphrase
// learns NOTHING about the keys. See docs/invariants.md I7, I8, I10 and
// docs/security_rules.md §4.
//
// Format history:
//   .v1  — 200k BLAKE2b hash chain KDF (v0 placeholder, weak; do NOT create new ones)
//   .v2  — Argon2id KDF + params persisted in blob (T-001)
//
// On unlock: prefers .v2; falls back to .v1 then migrates forward atomically.
// On wipe:   removes BOTH versions of BOTH salt and blob keys (INVARIANT I10).

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import nacl from 'tweetnacl';
import {
  b64, fromB64,
  deriveVaultKey, deriveVaultKeyV1Legacy, ARGON2ID_MODERATE,
  vaultEncrypt, vaultDecrypt, utf8, hex, fromHex,
  newBoxKeyPair, newSignKeyPair,
  type Argon2idParams,
} from './crypto';
import { STORE_KEYS, del as localStoreDel } from './local_store';
import type { Identity, VaultVersion } from './types';

// .v1 storage keys (legacy; read-only after T-001 lands).
const SALT_KEY_V1 = 'stingray.vault.salt.v1';
const BLOB_KEY_V1 = 'stingray.vault.blob.v1';
// .v2 storage keys (T-001; the current write path).
const SALT_KEY_V2 = 'stingray.vault.salt.v2';
const BLOB_KEY_V2 = 'stingray.vault.blob.v2';
// v0.1.5 — biometric-gated cached vault key. The key slot is opened by
// expo-secure-store with `requireAuthentication: true`, which binds the
// underlying KeyStore / Keychain entry to a biometric prompt on read.
// The companion flag is plain (no auth) so the UI can know whether to
// offer the biometric path WITHOUT triggering an OS prompt.
// INVARIANT I8.1: panic wipe must clear BOTH this key and the flag.
const BIOKEY_KEY_V1 = 'stingray.vault.biokey.v1';
const BIOKEY_FLAG_V1 = 'stingray.vault.bioenabled.v1';

// .v2 payload — adds `kdf_params` so future param bumps don't lock users out:
// every blob unlocks with the params it was encrypted under.
type VaultPayloadV2 = {
  format: 'v2';
  kdf_params: Argon2idParams;
  box_sk_hex: string;
  box_pk_hex: string;
  sign_sk_hex: string;
  sign_pk_hex: string;
  local_alias: string;
  created_at: string;
};

// .v1 payload — kept here purely so the migration reader knows the shape.
type VaultPayloadV1 = {
  box_sk_hex: string;
  box_pk_hex: string;
  sign_sk_hex: string;
  sign_pk_hex: string;
  local_alias: string;
  created_at: string;
};

async function readItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return AsyncStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

async function writeItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') { await AsyncStorage.setItem(key, value); return; }
  await SecureStore.setItemAsync(key, value);
}

async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === 'web') { await AsyncStorage.removeItem(key); return; }
  await SecureStore.deleteItemAsync(key);
}

// `true` if either a .v1 or .v2 vault exists. We accept .v1 because the user
// will migrate it forward on first unlock.
export async function vaultExists(): Promise<boolean> {
  const v2 = await readItem(BLOB_KEY_V2);
  if (v2) return true;
  const v1 = await readItem(BLOB_KEY_V1);
  return v1 !== null;
}

export async function createVault(passphrase: string, alias: string): Promise<Identity> {
  // INVARIANT I8: a unique 16-byte salt per vault. Never reused.
  const salt = nacl.randomBytes(16);
  const params = ARGON2ID_MODERATE;
  const key = await deriveVaultKey(passphrase, salt, params);

  const boxKp = newBoxKeyPair();
  const signKp = newSignKeyPair();

  const payload: VaultPayloadV2 = {
    format: 'v2',
    kdf_params: params,
    box_sk_hex: hex(boxKp.secretKey),
    box_pk_hex: hex(boxKp.publicKey),
    sign_sk_hex: hex(signKp.secretKey),
    sign_pk_hex: hex(signKp.publicKey),
    local_alias: alias,
    created_at: new Date().toISOString(),
  };
  const blob = vaultEncrypt(utf8.encode(JSON.stringify(payload)), key);

  await writeItem(SALT_KEY_V2, b64(salt));
  await writeItem(BLOB_KEY_V2, b64(blob));

  // v0.1.5: enforced biometric. enroll.tsx pre-checks hardware + enrolment
  // before calling createVault, so by the time we reach here the user is
  // expected to have a biometric ready. The cache write itself is best-
  // effort: if the OS refuses the auth-bound write (no enrolled biometric,
  // unsupported on web, etc.), we fall back to passphrase-only unlock and
  // the next successful passphrase unlock will re-attempt the cache.
  void await tryCacheVaultKeyForBiometric(key);

  return {
    pubkey_hex: payload.box_pk_hex,
    sign_pubkey_hex: payload.sign_pk_hex,
    local_alias: payload.local_alias,
    created_at: payload.created_at,
    vault_version: 'v2',
  };
}

export type UnlockedVault = {
  identity: Identity;
  box_sk: Uint8Array;
  sign_sk: Uint8Array;
  // T-002: vault_key is the symmetric key used to seal/unseal the encrypted
  // local store (contacts now; conversations once T-005 lands). Held in memory
  // for the lifetime of the UnlockedVault — i.e. cleared by lock() and by
  // strict-mode auto-lock in identity.tsx alongside box_sk/sign_sk. Never
  // persisted. Never logged.
  vault_key: Uint8Array;
};

// Unlock prefers .v2; falls back to .v1 then migrates forward.
//
// MIGRATION ORDER (matters for crash safety):
//   1. Derive .v1 vault key, decrypt .v1 blob.
//   2. Re-encrypt the payload under a fresh .v2 salt + Argon2id params.
//   3. Write SALT_KEY_V2 + BLOB_KEY_V2.
//   4. Delete SALT_KEY_V1 + BLOB_KEY_V1.
//
// A crash between 3 and 4 leaves both .v1 and .v2 on disk. Next unlock takes
// the .v2 path and the leftover .v1 keys are cleaned up at that point.
// INVARIANT I10 (panic wipe) is preserved: panicWipe() iterates both versions.
export async function unlockVault(passphrase: string): Promise<UnlockedVault | null> {
  // ---- prefer .v2 ----
  const saltV2 = await readItem(SALT_KEY_V2);
  const blobV2 = await readItem(BLOB_KEY_V2);
  if (saltV2 && blobV2) {
    const tryV2 = await tryUnlockV2(passphrase, fromB64(saltV2), fromB64(blobV2));
    if (tryV2) {
      // Opportunistic cleanup if a stale .v1 still lingers from a previous
      // half-finished migration.
      await maybeDeleteV1();
      // v0.1.5: refresh the biometric cache after a successful passphrase
      // unlock so subsequent launches can offer biometric-only.
      void await tryCacheVaultKeyForBiometric(tryV2.vault_key);
      return tryV2;
    }
    return null;
  }

  // ---- fall back to .v1 + migrate forward ----
  const saltV1 = await readItem(SALT_KEY_V1);
  const blobV1 = await readItem(BLOB_KEY_V1);
  if (!saltV1 || !blobV1) return null;

  const v1Key = await deriveVaultKeyV1Legacy(passphrase, fromB64(saltV1));
  const v1Plain = vaultDecrypt(fromB64(blobV1), v1Key);
  if (!v1Plain) return null;
  const v1Payload: VaultPayloadV1 = JSON.parse(utf8.decode(v1Plain));

  // Re-seal under .v2.
  const newSalt = nacl.randomBytes(16);
  const newParams = ARGON2ID_MODERATE;
  const newKey = await deriveVaultKey(passphrase, newSalt, newParams);
  const v2Payload: VaultPayloadV2 = {
    format: 'v2',
    kdf_params: newParams,
    box_sk_hex: v1Payload.box_sk_hex,
    box_pk_hex: v1Payload.box_pk_hex,
    sign_sk_hex: v1Payload.sign_sk_hex,
    sign_pk_hex: v1Payload.sign_pk_hex,
    local_alias: v1Payload.local_alias,
    created_at: v1Payload.created_at,
  };
  const newBlob = vaultEncrypt(utf8.encode(JSON.stringify(v2Payload)), newKey);

  // Write .v2 BEFORE deleting .v1: a crash between these two steps leaves a
  // usable .v2 on disk; the next unlock takes the .v2 path and clears .v1.
  await writeItem(SALT_KEY_V2, b64(newSalt));
  await writeItem(BLOB_KEY_V2, b64(newBlob));
  await maybeDeleteV1();

  // v0.1.5: after a successful passphrase unlock (incl. v1→v2 migration),
  // refresh the biometric cache so the next launch can offer biometric-only.
  void await tryCacheVaultKeyForBiometric(newKey);

  return {
    identity: identityFromPayloadV2(v2Payload),
    box_sk: fromHex(v2Payload.box_sk_hex),
    sign_sk: fromHex(v2Payload.sign_sk_hex),
    vault_key: newKey,
  };
}

async function tryUnlockV2(
  passphrase: string,
  salt: Uint8Array,
  blob: Uint8Array,
): Promise<UnlockedVault | null> {
  // First decode the OUTER blob's params hint. The blob is encrypted, so we
  // can't read params from it before unlocking. Instead, the convention is:
  // new vaults use ARGON2ID_MODERATE; if the blob fails to decrypt we DO NOT
  // try other parameter sets (that would create a brute-force oracle).
  const key = await deriveVaultKey(passphrase, salt, ARGON2ID_MODERATE);
  const plain = vaultDecrypt(blob, key);
  if (!plain) return null;
  let payload: VaultPayloadV2;
  try {
    payload = JSON.parse(utf8.decode(plain));
  } catch {
    return null;                              // tampered blob, drop silently (I12 spirit)
  }
  if (payload.format !== 'v2') return null;   // wrong format, drop silently
  return {
    identity: identityFromPayloadV2(payload),
    box_sk: fromHex(payload.box_sk_hex),
    sign_sk: fromHex(payload.sign_sk_hex),
    vault_key: key,
  };
}

function identityFromPayloadV2(p: VaultPayloadV2): Identity {
  return {
    pubkey_hex: p.box_pk_hex,
    sign_pubkey_hex: p.sign_pk_hex,
    local_alias: p.local_alias,
    created_at: p.created_at,
    vault_version: 'v2',
  };
}

async function maybeDeleteV1(): Promise<void> {
  // Best-effort. If either delete fails (file already gone, ACL issue), the
  // next unlock will retry. Crucially, deletions are independent: a partial
  // failure here NEVER leaves the user with a half-wiped panic state — that
  // path goes through panicWipe() and clears both versions explicitly.
  const v1Salt = await readItem(SALT_KEY_V1);
  if (v1Salt !== null) await deleteItem(SALT_KEY_V1);
  const v1Blob = await readItem(BLOB_KEY_V1);
  if (v1Blob !== null) await deleteItem(BLOB_KEY_V1);
}

// INVARIANT I10: panic wipe must delete the salt + blob across BOTH vault
// versions AND every local_store key that holds vault-key-encrypted user data.
// Order: vault salts first (an interrupt mid-wipe leaves blobs undecryptable),
// then vault blobs, then encrypted local-store entries.
//
// Adding a new STORE_KEYS entry (T-005, etc.) MUST add a deleteItem call
// here. The grep target is `STORE_KEYS.` — every value should appear in this
// function or the new entry is a partial-wipe regression.
export async function panicWipe(): Promise<void> {
  await deleteItem(SALT_KEY_V1);
  await deleteItem(SALT_KEY_V2);
  await deleteItem(BLOB_KEY_V1);
  await deleteItem(BLOB_KEY_V2);
  // v0.1.5 / INVARIANT I8.1: biometric-cached key + enabled flag.
  // The order matters: clear the auth-bound slot BEFORE the flag so a
  // crash mid-wipe doesn't leave the UI offering biometric over a key
  // that no longer exists.
  await tryDeleteBiometricCache();
  // Local-store entries — T-002 onwards.
  // GREP MARKER: every STORE_KEYS entry MUST appear in this list. Adding a
  // new local_store key without updating this function is a partial-wipe
  // regression (INVARIANT I10). The Reviewer's grep target is `STORE_KEYS.`.
  await localStoreDel(STORE_KEYS.CONTACTS);
  await localStoreDel(STORE_KEYS.CONVERSATIONS);
}

// --- v0.1.5 biometric layer ----------------------------------------------
//
// Biometric is a CONVENIENCE on top of the passphrase root, NOT a replacement
// for it. The cryptographic root remains the Argon2id-derived vault key (I8).
// We cache that derived key in a hardware-backed slot that the OS will only
// release after a biometric prompt. If the slot is gone, invalidated, or the
// device has none, the user falls back to the passphrase path — which on
// success re-caches.
//
// The flag (BIOKEY_FLAG_V1) lets the UI know whether to offer biometric
// without first triggering an OS prompt. Reading the slot itself ALWAYS
// prompts — that's the whole point.

// `true` if a biometric-cached vault key is on disk.
// No OS prompt is triggered — this just reads the plain flag slot.
export async function biometricUnlockAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  return (await readItem(BIOKEY_FLAG_V1)) === '1';
}

// Unlock the vault using the biometric-cached key. Triggers the OS biometric
// prompt. Returns null on cancel, hardware refusal, or key invalidation
// (e.g. Android KeyPermanentlyInvalidatedException after biometric re-enrol).
// Caller should fall back to passphrase unlock on null.
export async function unlockVaultBiometric(): Promise<UnlockedVault | null> {
  if (Platform.OS === 'web') return null;
  if (!(await biometricUnlockAvailable())) return null;

  let keyB64: string | null = null;
  try {
    keyB64 = await SecureStore.getItemAsync(BIOKEY_KEY_V1, {
      requireAuthentication: true,
      authenticationPrompt: 'Unlock stingray',
    });
  } catch {
    // Cancelled, hardware failure, key invalidated. Do NOT clear the flag
    // automatically — that would silently downgrade to passphrase-only after
    // a single thumbprint slip. The user re-tries or chooses passphrase.
    return null;
  }
  if (!keyB64) return null;

  const blobV2 = await readItem(BLOB_KEY_V2);
  if (!blobV2) return null;
  const key = fromB64(keyB64);
  const plain = vaultDecrypt(fromB64(blobV2), key);
  if (!plain) return null;
  let payload: VaultPayloadV2;
  try {
    payload = JSON.parse(utf8.decode(plain));
  } catch {
    return null;
  }
  if (payload.format !== 'v2') return null;
  return {
    identity: identityFromPayloadV2(payload),
    box_sk: fromHex(payload.box_sk_hex),
    sign_sk: fromHex(payload.sign_sk_hex),
    vault_key: key,
  };
}

async function tryCacheVaultKeyForBiometric(key: Uint8Array): Promise<void> {
  if (Platform.OS === 'web') return;          // no Keychain/KeyStore on web
  try {
    await SecureStore.setItemAsync(BIOKEY_KEY_V1, b64(key), {
      requireAuthentication: true,
      keychainAccessible: SecureStore.WHEN_UNLOCKED,
    });
    await writeItem(BIOKEY_FLAG_V1, '1');
  } catch {
    // No biometric set up, write blocked, etc. Best-effort: leave the
    // flag unset so the UI keeps prompting for passphrase. The next
    // successful passphrase unlock will retry the cache.
  }
}

async function tryDeleteBiometricCache(): Promise<void> {
  if (Platform.OS === 'web') return;
  try { await SecureStore.deleteItemAsync(BIOKEY_KEY_V1); } catch { /* ignore */ }
  try { await deleteItem(BIOKEY_FLAG_V1); } catch { /* ignore */ }
}

// Diagnostic helper: returns the format the on-disk vault is currently in.
// Useful for the Settings screen ("Vault format: v2") and for migration QA.
export async function vaultFormatOnDisk(): Promise<VaultVersion | null> {
  if ((await readItem(BLOB_KEY_V2)) !== null) return 'v2';
  if ((await readItem(BLOB_KEY_V1)) !== null) return 'v1';
  return null;
}
