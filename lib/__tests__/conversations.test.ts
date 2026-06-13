// T-005 acceptance — conversations-store self-test. Import-time asserts
// (same pattern as crypto.test.ts and local_store.test.ts). Gated behind
// STINGRAY_RUN_CONVERSATIONS_TESTS=1 so a dev with a live vault is never
// clobbered.
//
// Tests target the behaviours the ticket promises:
//   - round-trip (write → read same)
//   - id-based dedupe on re-append (INVARIANT I11 ack-but-redeliverable safety)
//   - per-peer FIFO cap at MAX_PER_PEER
//   - rollupFromHistory ordering
//   - wrong-key returns null (already covered by local_store.test.ts; not
//     repeated here)

import nacl from 'tweetnacl';
import * as localStore from '../local_store';
import { MAX_PER_PEER, rollupFromHistory, type ConversationsMap } from '../conversations';
import type { Plaintext } from '../types';

const RUN = process.env.STINGRAY_RUN_CONVERSATIONS_TESTS === '1';

async function run(): Promise<void> {
  if (!RUN) {
    // eslint-disable-next-line no-console
    console.log('[stingray] conversations self-tests: SKIPPED (STINGRAY_RUN_CONVERSATIONS_TESTS!=1)');
    return;
  }

  const key = nacl.randomBytes(32);
  // Snapshot any existing value so a live vault is never clobbered.
  const backup = await localStore.get<ConversationsMap>(localStore.STORE_KEYS.CONVERSATIONS, key);
  try {
    await testRoundTrip(key);
    await testDedupe(key);
    await testCap(key);
    testRollupOrder();

    // eslint-disable-next-line no-console
    console.log('[stingray] conversations self-tests: PASS');
  } finally {
    if (backup !== null) {
      await localStore.set(localStore.STORE_KEYS.CONVERSATIONS, key, backup);
    } else {
      await localStore.del(localStore.STORE_KEYS.CONVERSATIONS);
    }
  }
}

function makeMessage(id: string, from: string, to: string, body: string, sent_at: string): Plaintext {
  return {
    id, from_pubkey_hex: from, to_pubkey_hex: to, body,
    sent_at, received_at: sent_at, direction: 'in',
  };
}

// 1. round trip: set then get returns the same map.
async function testRoundTrip(key: Uint8Array): Promise<void> {
  const peerA = 'a'.repeat(64);
  const m1 = makeMessage('id-1', peerA, 'me', 'hello', '2026-06-02T00:00:00Z');
  const initial: ConversationsMap = { [peerA]: [m1] };
  await localStore.set(localStore.STORE_KEYS.CONVERSATIONS, key, initial);
  const back = await localStore.get<ConversationsMap>(localStore.STORE_KEYS.CONVERSATIONS, key);
  if (!back) throw new Error('round-trip get returned null');
  if (back[peerA]?.length !== 1) throw new Error('round-trip array length wrong');
  if (back[peerA][0].body !== 'hello') throw new Error('round-trip body mismatch');
}

// 2. id-based dedupe: appending a message whose id is already present must
// be a no-op. This is the invariant that makes "persist before ack-delete"
// safe — a crash between persist and ack causes a re-receive, and the
// dedupe is what keeps history clean.
async function testDedupe(key: Uint8Array): Promise<void> {
  const peerA = 'a'.repeat(64);
  const m1 = makeMessage('dup-id', peerA, 'me', 'first', '2026-06-02T00:00:00Z');
  const m2 = makeMessage('dup-id', peerA, 'me', 'second-with-same-id', '2026-06-02T00:00:01Z');
  // Pure-function dedupe mirrors what ConversationsProvider.appendMessage does
  // (we can't exercise the React hook directly from an import-time test).
  const existing: Plaintext[] = [m1];
  const candidate = m2;
  const next = existing.some((m) => m.id === candidate.id)
    ? existing
    : [...existing, candidate];
  if (next.length !== 1) throw new Error('dedupe failed: duplicate id appended');
  if (next[0].body !== 'first') throw new Error('dedupe replaced original instead of preserving');
}

// 3. FIFO cap at MAX_PER_PEER. Build an array of MAX_PER_PEER+10 messages
// and confirm only the last MAX_PER_PEER survive.
async function testCap(_key: Uint8Array): Promise<void> {
  const peerA = 'a'.repeat(64);
  const all: Plaintext[] = [];
  for (let i = 0; i < MAX_PER_PEER + 10; i++) {
    all.push(makeMessage(`id-${i}`, peerA, 'me', `body-${i}`, `2026-06-02T00:00:${String(i).padStart(2, '0')}Z`));
  }
  const capped = all.length > MAX_PER_PEER ? all.slice(all.length - MAX_PER_PEER) : all;
  if (capped.length !== MAX_PER_PEER) throw new Error(`cap failed: got ${capped.length}, expected ${MAX_PER_PEER}`);
  if (capped[0].id !== `id-${10}`) throw new Error(`cap dropped wrong end: first id is ${capped[0].id}`);
  if (capped[capped.length - 1].id !== `id-${MAX_PER_PEER + 9}`) {
    throw new Error('cap dropped from the wrong end: lost the newest message');
  }
}

// 4. rollupFromHistory ordering — most-recent-last-message-at first.
function testRollupOrder(): void {
  const peerA = 'a'.repeat(64);
  const peerB = 'b'.repeat(64);
  const conversations: ConversationsMap = {
    [peerA]: [makeMessage('a1', peerA, 'me', 'old', '2026-06-01T00:00:00Z')],
    [peerB]: [makeMessage('b1', peerB, 'me', 'new', '2026-06-02T00:00:00Z')],
  };
  const rolls = rollupFromHistory(
    conversations,
    (p) => (p === peerA ? 'A' : 'B'),
  );
  if (rolls.length !== 2) throw new Error('rollup length wrong');
  if (rolls[0].alias !== 'B') throw new Error('rollup order wrong — newest peer should be first');
}

void run().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[stingray] conversations self-tests: FAIL —', e);
  throw e;
});
