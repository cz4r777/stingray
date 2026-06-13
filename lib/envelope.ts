// Compose / open envelopes. Pure functions on top of crypto.ts + relay.ts.
//
// Wire format never includes:
//   - sender pubkey (sender is anonymous to the relay; ephemeral key only)
//   - subject / thread-id (the cleartext payload carries thread routing)
//   - true plaintext length (always padded to a bucket)
//
// See docs/invariants.md I5, I6, I11, I12.

import { sealEnvelope, openEnvelope, utf8, hex, fromHex, fromB64 } from './crypto';
import { sendEnvelope, fetchInbox, ackEnvelope } from './relay';
import type { Plaintext, RelayEnvelope } from './types';

type ComposeArgs = {
  from_pubkey_hex: string;
  to_pubkey_hex: string;
  body: string;
};

export async function composeAndSend(args: ComposeArgs): Promise<{ id: string } | { error: string }> {
  const plaintext: Plaintext = {
    id: cryptoRandomId(),
    from_pubkey_hex: args.from_pubkey_hex,
    to_pubkey_hex: args.to_pubkey_hex,
    body: args.body,
    sent_at: new Date().toISOString(),
    received_at: '',
    direction: 'out',
  };
  // The inner JSON carries from_pubkey — the recipient learns who sent it,
  // the relay does not.
  const inner = utf8.encode(JSON.stringify(plaintext));
  const sealed = sealEnvelope(inner, fromHex(args.to_pubkey_hex));
  return sendEnvelope({
    recipient_pubkey: args.to_pubkey_hex,
    ciphertext: sealed.ciphertext,
    ephemeral_pubkey: sealed.ephemeralPub,
    bucket: sealed.bucket,
  });
}

export type DrainedMessage = { envelope_id: string; plaintext: Plaintext };

// T-005: optional persist callback. drainInbox now follows the order:
//   1. Fetch envelopes from relay.
//   2. For each envelope:
//        decrypt → onPersist(plaintext) → ack-delete on relay → push to out
// A crash between onPersist and ack-delete is acceptable: on next fetch we
// will receive the same envelope again, decrypt it, and ConversationsProvider's
// id-based dedupe (lib/conversations.tsx appendMessage) makes the re-receive
// a no-op. A crash between ack-delete and onPersist would be DATA LOSS — that
// is why onPersist fires FIRST.
//
// INVARIANT I11: ack-delete remains the cleanup rule. INVARIANT I12: a
// decrypt failure short-circuits BEFORE onPersist, so failed envelopes never
// reach the persistence layer.
export async function drainInbox(
  my_pubkey_hex: string,
  my_box_sk: Uint8Array,
  onPersist?: (plaintext: Plaintext) => Promise<void> | void,
): Promise<DrainedMessage[]> {
  const envelopes = await fetchInbox(my_pubkey_hex);
  const out: DrainedMessage[] = [];
  for (const e of envelopes) {
    const opened = openEnvelope(fromB64(e.ciphertext), fromB64(e.ephemeral_pubkey), my_box_sk);
    if (!opened) continue;                 // INVARIANT I12: drop on decrypt fail; never log ciphertext
    let pt: Plaintext;
    try { pt = JSON.parse(utf8.decode(opened)); } catch { continue; }
    pt.direction = 'in';
    pt.received_at = new Date().toISOString();

    // T-005: persist BEFORE ack. If onPersist throws, we still drop the
    // envelope from `out` (don't surface a half-persisted message to the
    // UI), but we DO NOT ack-delete — the next drain re-fetches and the
    // caller can retry.
    if (onPersist) {
      try {
        await onPersist(pt);
      } catch {
        // Persistence failed (storage full, ACL race, etc.). Skip ack so
        // the message remains redeliverable from the relay on the next
        // drain. INVARIANT I12: no log; no partial-state surface to UI.
        continue;
      }
    }

    out.push({ envelope_id: e.id, plaintext: pt });
    await ackEnvelope(e.id);
  }
  return out;
}

function cryptoRandomId(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return hex(a);
}
