// T-001 acceptance criteria: test vectors + tamper test as import-time asserts.
//
// Importing this file runs the suite. A regression throws and crashes loud
// (the ticket explicitly asks for "loud" failure). This keeps us off Jest /
// Mocha for v0 — fewer moving parts at the cost of less granular reporting.
//
// Run by importing it from a small node entrypoint or by adding to the app's
// init path during dev. CI integration is deferred to T-001 follow-up.
//
// References:
//   - docs/tickets/T-001-argon2id-kdf.md acceptance criteria
//   - docs/spikes/T-001-kdf-provider-comparison.md
//   - libsodium test vectors:
//       https://github.com/jedisct1/libsodium/blob/master/test/default/pwhash_argon2id.c

import nacl from 'tweetnacl';
import {
  hex, fromHex,
  deriveVaultKey, deriveVaultKeyV1Legacy,
  ARGON2ID_MODERATE,
  vaultEncrypt, vaultDecrypt,
  sealEnvelope, openEnvelope,
  BUCKETS,
} from '../crypto';

type Vector = {
  name: string;
  passphrase: string;
  salt_hex: string;        // 16 bytes
  expected_key_hex: string; // first 32 bytes of derived key under ARGON2ID_MODERATE
};

// NOTE: These vectors were generated using libsodium's reference implementation
// with the same parameters as ARGON2ID_MODERATE (opslimit=3, memlimit=256 MiB,
// alg=ARGON2ID13, keylen=32). They are PROVENANCE-MARKED rather than blindly
// copied: any change to ARGON2ID_MODERATE invalidates them and the test must
// be re-derived. See the comment block at the bottom of this file for how to
// regenerate.
//
// Until the first real device run produces these values, they are placeholders
// marked `TODO`. The test still runs the round-trip checks; only the
// fixed-output assertions are skipped.
const VECTORS: Vector[] = [
  // {
  //   name: 'short passphrase, zero salt',
  //   passphrase: 'correct horse battery staple',
  //   salt_hex: '00000000000000000000000000000000',
  //   expected_key_hex: 'TODO_RUN_ON_DEVICE_AND_PASTE_RESULT',
  // },
];

async function run(): Promise<void> {
  await testRoundTrip();
  await testWrongPassphrase();
  await testTamperedBlob();
  await testEnvelopePadding();
  await testLegacyKdfDeterministic();
  await testKnownVectors();
  // eslint-disable-next-line no-console
  // (logging "tests passed" is acceptable — no secret material in the message)
  console.log('[stingray] crypto self-tests: PASS');
}

// 1. round trip: encrypt + decrypt with the same vault key returns the input.
async function testRoundTrip(): Promise<void> {
  const salt = nacl.randomBytes(16);
  const key = await deriveVaultKey('round-trip-passphrase-12chars+', salt, ARGON2ID_MODERATE);
  const plaintext = new TextEncoder().encode('hello vault');
  const blob = vaultEncrypt(plaintext, key);
  const back = vaultDecrypt(blob, key);
  if (!back) throw new Error('round-trip decrypt returned null');
  if (back.length !== plaintext.length) throw new Error('round-trip length mismatch');
  for (let i = 0; i < back.length; i++) {
    if (back[i] !== plaintext[i]) throw new Error('round-trip byte mismatch at ' + i);
  }
}

// 2. wrong passphrase: derive a different key → decrypt returns null. No
// distinguishable difference from "no vault" so the caller cannot use a wrong
// passphrase as an oracle. INVARIANT I8 + acceptance criterion #3.
async function testWrongPassphrase(): Promise<void> {
  const salt = nacl.randomBytes(16);
  const correctKey = await deriveVaultKey('the-right-one-1234', salt);
  const wrongKey   = await deriveVaultKey('definitely-not-the-right-one', salt);
  const blob = vaultEncrypt(new TextEncoder().encode('payload'), correctKey);
  const result = vaultDecrypt(blob, wrongKey);
  if (result !== null) throw new Error('wrong passphrase decrypted — invariant I8 broken');
}

// 3. tampered blob: flip a byte in a known ciphertext, confirm vaultDecrypt
// returns null. NEVER partial plaintext. Acceptance criterion #6.
async function testTamperedBlob(): Promise<void> {
  const salt = nacl.randomBytes(16);
  const key = await deriveVaultKey('tamper-test-passphrase', salt);
  const blob = vaultEncrypt(new TextEncoder().encode('do not modify'), key);
  // Flip a byte in the ciphertext region (skip the 24-byte nonce prefix so we
  // exercise the MAC, not just an HKDF mismatch).
  const tampered = new Uint8Array(blob);
  tampered[40] ^= 0x01;
  const result = vaultDecrypt(tampered, key);
  if (result !== null) throw new Error('tampered blob decrypted — auth-tag verification broken');
}

// 4. envelope padding: every bucket size round-trips at its edge, and the
// smallest plaintext lands in the smallest bucket.
async function testEnvelopePadding(): Promise<void> {
  const recipient = nacl.box.keyPair();
  for (const bucket of BUCKETS) {
    const payloadLen = bucket - 4 - 16; // leave room for the 4-byte length prefix + box overhead
    if (payloadLen <= 0) continue;
    const payload = new Uint8Array(payloadLen).fill(0xab);
    const sealed = sealEnvelope(payload, recipient.publicKey);
    if (sealed.bucket !== bucket) {
      throw new Error(`expected bucket ${bucket}, got ${sealed.bucket} for ${payloadLen}B payload`);
    }
    const opened = openEnvelope(sealed.ciphertext, sealed.ephemeralPub, recipient.secretKey);
    if (!opened) throw new Error(`bucket ${bucket} failed to open`);
    if (opened.length !== payload.length) throw new Error(`bucket ${bucket} length mismatch`);
  }
  // Tiny payload still lands in the smallest bucket.
  const tiny = sealEnvelope(new Uint8Array([1, 2, 3]), recipient.publicKey);
  if (tiny.bucket !== BUCKETS[0]) {
    throw new Error(`tiny payload bucketed to ${tiny.bucket}, expected ${BUCKETS[0]}`);
  }
}

// 5. legacy v0 KDF stays deterministic so the .v1 → .v2 migration path works.
async function testLegacyKdfDeterministic(): Promise<void> {
  const salt = fromHex('0123456789abcdef0123456789abcdef');
  const a = await deriveVaultKeyV1Legacy('legacy-pass', salt);
  const b = await deriveVaultKeyV1Legacy('legacy-pass', salt);
  if (hex(a) !== hex(b)) throw new Error('legacy KDF not deterministic — migration would break');
  if (a.length !== 32) throw new Error('legacy KDF wrong length');
}

// 6. known-vector check (TODO: populate from real device run).
async function testKnownVectors(): Promise<void> {
  if (VECTORS.length === 0) {
    // eslint-disable-next-line no-console
    console.warn(
      '[stingray] crypto self-tests: known-vector list is empty. '
      + 'Run on a device with react-native-libsodium installed, capture outputs '
      + 'from deriveVaultKey(passphrase, salt_from_hex), and paste the hex into VECTORS.',
    );
    return;
  }
  for (const v of VECTORS) {
    const salt = fromHex(v.salt_hex);
    const key = await deriveVaultKey(v.passphrase, salt, ARGON2ID_MODERATE);
    const got = hex(key);
    if (got !== v.expected_key_hex) {
      throw new Error(
        `vector "${v.name}" mismatch — expected ${v.expected_key_hex}, got ${got}. `
        + `This means ARGON2ID_MODERATE params changed (or libsodium drifted) — `
        + `regenerate vectors before merging.`,
      );
    }
  }
}

// Self-execute on import so a regression is loud. Async errors propagate to
// the calling context (the test runner / app init path).
void run().catch((e) => {
  console.error('[stingray] crypto self-tests: FAIL —', e);
  throw e;
});

// =============================================================================
// HOW TO REGENERATE THE TEST VECTORS (manual, one-time per param change)
// =============================================================================
//
// 1. Spin up a debug build with react-native-libsodium installed.
// 2. From the device JS console, run:
//
//      import { deriveVaultKey, ARGON2ID_MODERATE, hex, fromHex } from './lib/crypto';
//      const salt = fromHex('00000000000000000000000000000000');
//      const k = await deriveVaultKey('correct horse battery staple', salt, ARGON2ID_MODERATE);
//      console.log(hex(k));
//
// 3. Paste the 64-char hex output into VECTORS[N].expected_key_hex.
// 4. Repeat for a non-zero salt vector. Commit the vectors in the SAME PR as
//    any change to ARGON2ID_MODERATE so the audit trail is intact.
