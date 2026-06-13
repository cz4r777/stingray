// Encrypted local key-value store. Values are JSON-encoded then secretbox-sealed
// under an explicit vault key passed per call. Backing: expo-secure-store on
// native (platform keychain), AsyncStorage on web — same shim pattern as
// vault.ts uses for its salt/blob keys.
//
// Why an explicit vault key per call (not a module-level cache):
//   - Callers cannot use the store pre-unlock by accident (no key in hand →
//     no operation).
//   - Module-level caching would extend the lifetime of the key past lock();
//     keeping it bound to the UnlockedVault tied through React state means
//     the auto-lock + strict-mode paths in lib/identity.tsx clear it on
//     suspend.
//
// INVARIANT REFERENCES
//   - I7  : private-key material lives only inside encrypted blobs; this store
//           is the substrate that ensures the same for contacts (T-002) and
//           future conversation persistence (T-005).
//   - I13 : aliases / contact data are local-only; this store never touches
//           the network.
//   - I12 : decrypt-failure path returns null silently; no log line carries
//           ciphertext or partial plaintext.
//
// SCOPE
//   This file is the ONLY local-encrypted-store entry point. Future tickets
//   (T-005 conversation persistence) layer on top by adding entries to
//   STORE_KEYS — they do NOT introduce parallel storage paths.

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { b64, fromB64, vaultEncrypt, vaultDecrypt, utf8 } from './crypto';

// Known store keys. Add to this map (don't sprinkle string literals at call
// sites) so future audits can grep one place for "what does the local store
// hold?".
//
// Every entry added here MUST also be added to panicWipe() in lib/vault.ts —
// otherwise wipe is partial and INVARIANT I10 breaks. See the comment marker
// in panicWipe().
export const STORE_KEYS = {
  CONTACTS:      'stingray.contacts.v1',
  CONVERSATIONS: 'stingray.conversations.v1',
} as const;

export type StoreKey = (typeof STORE_KEYS)[keyof typeof STORE_KEYS];

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

// Read + decrypt under the given vault key. Returns null on any of:
//   - the key was never set
//   - wrong vault key (secretbox MAC fails)
//   - the on-disk blob was tampered with (secretbox MAC fails)
//   - the decrypted plaintext is not valid JSON
//
// All four paths are indistinguishable to the caller — INVARIANT I12 spirit.
// No log line is emitted; no partial plaintext leaks.
export async function get<T>(key: StoreKey, vaultKey: Uint8Array): Promise<T | null> {
  const raw = await readItem(key);
  if (!raw) return null;
  const plain = vaultDecrypt(fromB64(raw), vaultKey);
  if (!plain) return null;
  try {
    return JSON.parse(utf8.decode(plain)) as T;
  } catch {
    return null;
  }
}

// Encrypt + write under the given vault key. JSON-encodes the value first,
// then secretbox-seals. There is no plaintext on disk and no in-memory cache.
export async function set<T>(key: StoreKey, vaultKey: Uint8Array, value: T): Promise<void> {
  const plain = utf8.encode(JSON.stringify(value));
  const blob = vaultEncrypt(plain, vaultKey);
  await writeItem(key, b64(blob));
}

// Remove a key. No vault key required — deletion is destructive on the
// blob, not the plaintext. Safe to call when locked (panicWipe needs this).
export async function del(key: StoreKey): Promise<void> {
  await deleteItem(key);
}

// Cheap existence check. Does NOT decrypt — only checks whether the slot
// has a value at all. Useful for "is this user enrolled in the contacts
// store yet?" without paying the secretbox cost.
export async function has(key: StoreKey): Promise<boolean> {
  return (await readItem(key)) !== null;
}
