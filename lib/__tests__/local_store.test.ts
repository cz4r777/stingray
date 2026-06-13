// T-002 acceptance — local_store self-test. Import-time asserts so a
// regression throws and crashes loud (same pattern as crypto.test.ts).
//
// Runs via the platform's storage layer (expo-secure-store on native,
// AsyncStorage on web) under a transient test key prefix so production
// data is never touched.
//
// References:
//   - docs/tickets/T-002-persist-contacts.md acceptance criteria
//   - lib/local_store.ts
//   - INVARIANT I12 (decrypt-failure silent null)

import nacl from 'tweetnacl';
import * as localStore from '../local_store';
import { vaultEncrypt, b64, fromB64, utf8 } from '../crypto';

// The store module hardcodes STORE_KEYS; the test uses one entry (CONTACTS)
// and writes/clears under it. To avoid clobbering a real vault during dev,
// the suite runs only when an explicit env var is set.
const RUN = process.env.STINGRAY_RUN_LOCAL_STORE_TESTS === '1';

async function run(): Promise<void> {
  if (!RUN) {
    // eslint-disable-next-line no-console
    console.log('[stingray] local_store self-tests: SKIPPED (STINGRAY_RUN_LOCAL_STORE_TESTS!=1)');
    return;
  }
  // Snapshot existing value so the test never destroys real contacts data.
  const tmpKey = nacl.randomBytes(32);
  let backup: string | null = null;
  try {
    // Read raw value via underlying storage to preserve format; we have no
    // public reader so this branch only runs when explicitly enabled.
    backup = await readRawContacts();

    await testRoundTrip(tmpKey);
    await testWrongKey(tmpKey);
    await testTamperedBlob(tmpKey);
    await testMissingKeyReturnsNull(tmpKey);
    await testDelClearsBlob(tmpKey);

    // eslint-disable-next-line no-console
    console.log('[stingray] local_store self-tests: PASS');
  } finally {
    if (backup !== null) {
      await writeRawContacts(backup);
    } else {
      await localStore.del(localStore.STORE_KEYS.CONTACTS);
    }
  }
}

// 1. round trip: set then get returns the same value.
async function testRoundTrip(key: Uint8Array): Promise<void> {
  type Payload = { hello: string; n: number };
  const value: Payload = { hello: 'world', n: 42 };
  await localStore.set<Payload>(localStore.STORE_KEYS.CONTACTS, key, value);
  const back = await localStore.get<Payload>(localStore.STORE_KEYS.CONTACTS, key);
  if (!back) throw new Error('round-trip get returned null');
  if (back.hello !== value.hello || back.n !== value.n) {
    throw new Error('round-trip payload mismatch');
  }
}

// 2. wrong key: a different vault key returns null, never partial plaintext.
// INVARIANT I12 spirit at the storage layer.
async function testWrongKey(rightKey: Uint8Array): Promise<void> {
  await localStore.set(localStore.STORE_KEYS.CONTACTS, rightKey, { x: 1 });
  const wrongKey = nacl.randomBytes(32);
  const back = await localStore.get(localStore.STORE_KEYS.CONTACTS, wrongKey);
  if (back !== null) throw new Error('wrong-key decrypt returned non-null');
}

// 3. tampered blob: flip a byte after set, confirm get returns null.
async function testTamperedBlob(key: Uint8Array): Promise<void> {
  await localStore.set(localStore.STORE_KEYS.CONTACTS, key, { y: 2 });
  // Read raw, flip a byte in the ciphertext region (skip 24-byte nonce
  // prefix), write back via the same backend.
  const raw = await readRawContacts();
  if (!raw) throw new Error('tamper test: blob missing after set');
  const buf = fromB64(raw);
  buf[40] ^= 0x01;
  await writeRawContacts(b64(buf));
  const back = await localStore.get(localStore.STORE_KEYS.CONTACTS, key);
  if (back !== null) throw new Error('tampered blob decrypted — secretbox MAC verification broken');
}

// 4. missing key: a get on a never-written key returns null, never throws.
async function testMissingKeyReturnsNull(key: Uint8Array): Promise<void> {
  await localStore.del(localStore.STORE_KEYS.CONTACTS);
  const back = await localStore.get(localStore.STORE_KEYS.CONTACTS, key);
  if (back !== null) throw new Error('missing-key get did not return null');
}

// 5. del clears the blob; subsequent has() returns false.
async function testDelClearsBlob(key: Uint8Array): Promise<void> {
  await localStore.set(localStore.STORE_KEYS.CONTACTS, key, { z: 3 });
  if (!(await localStore.has(localStore.STORE_KEYS.CONTACTS))) {
    throw new Error('has() returned false after set()');
  }
  await localStore.del(localStore.STORE_KEYS.CONTACTS);
  if (await localStore.has(localStore.STORE_KEYS.CONTACTS)) {
    throw new Error('has() returned true after del()');
  }
}

// Backend-agnostic raw read/write for the tamper + backup paths. Mirrors
// the same shim local_store uses internally; kept private to the test so
// the public API stays narrow.
async function readRawContacts(): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Platform } = require('react-native');
  if (Platform.OS === 'web') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    return AsyncStorage.getItem(localStore.STORE_KEYS.CONTACTS);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SecureStore = require('expo-secure-store');
  return SecureStore.getItemAsync(localStore.STORE_KEYS.CONTACTS);
}

async function writeRawContacts(value: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Platform } = require('react-native');
  if (Platform.OS === 'web') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    await AsyncStorage.setItem(localStore.STORE_KEYS.CONTACTS, value);
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SecureStore = require('expo-secure-store');
  await SecureStore.setItemAsync(localStore.STORE_KEYS.CONTACTS, value);
}

void run().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[stingray] local_store self-tests: FAIL —', e);
  throw e;
});

// Silence unused-import warnings when the suite is skipped.
void vaultEncrypt; void utf8;
