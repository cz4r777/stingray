// Relay client. The Supabase project is used ONLY as an opaque ciphertext
// mailbox. The server schema (supabase/schema.sql) deliberately stores no
// metadata that could deanonymize sender↔recipient. Compromise of the
// relay leaks at most: who has a mailbox, what bucket sizes they receive,
// and rough delivery timing. It does NOT leak: senders, plaintext, or
// per-message routing.
//
// See docs/invariants.md I3, I6 and docs/api_contracts.md §envelopes.

import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { assertFaraday, subscribeTransport } from './transport';
import { b64, fromB64 } from './crypto';
import type { RelayEnvelope } from './types';

const url = process.env.EXPO_PUBLIC_RELAY_URL;
const anonKey = process.env.EXPO_PUBLIC_RELAY_ANON_KEY;
if (!url || !anonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_RELAY_URL or EXPO_PUBLIC_RELAY_ANON_KEY. ' +
      'Copy .env.example to .env and fill in your relay project values.',
  );
}

export const relay = createClient(url, anonKey, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: false,        // INVARIANT I4: no relay session — stateless writes
    persistSession: false,
    detectSessionInUrl: false,
  },
});

// INVARIANT I1: every send path goes through assertFaraday first.
export async function sendEnvelope(args: {
  recipient_pubkey: string;
  ciphertext: Uint8Array;
  ephemeral_pubkey: Uint8Array;
  bucket: number;
}): Promise<{ id: string } | { error: string }> {
  const v = await assertFaraday();
  if (!v.allowed) return { error: `Refused: ${v.reason}` };

  const { data, error } = await relay
    .from('envelopes')
    .insert({
      recipient_pubkey: args.recipient_pubkey,
      ciphertext: b64(args.ciphertext),
      ephemeral_pubkey: b64(args.ephemeral_pubkey),
      bucket: args.bucket,
    })
    .select('id')
    .single();
  if (error) return { error: error.message };
  return { id: data.id as string };
}

export async function fetchInbox(my_pubkey_hex: string): Promise<RelayEnvelope[]> {
  const v = await assertFaraday();
  if (!v.allowed) return [];
  const { data, error } = await relay
    .from('envelopes')
    .select('id, recipient_pubkey, ciphertext, ephemeral_pubkey, bucket, created_at')
    .eq('recipient_pubkey', my_pubkey_hex)
    .order('created_at');
  if (error) return [];
  return (data ?? []) as RelayEnvelope[];
}

// After local decrypt, the envelope is removed from the relay. This minimises
// the amount of metadata sitting at the server. See docs/invariants.md I11.
export async function ackEnvelope(id: string): Promise<void> {
  const v = await assertFaraday();
  if (!v.allowed) return;
  await relay.from('envelopes').delete().eq('id', id);
}

// Subscribe to new envelopes addressed to me. Realtime filter is server-side;
// payload is opaque ciphertext so a leak via a wrong filter still reveals nothing.
export function subscribeInbox(my_pubkey_hex: string, onInsert: (e: RelayEnvelope) => void) {
  let disposed = false;
  let teardownChannel: (() => void) | null = null;

  const ensureSubscription = (allowed: boolean) => {
    if (disposed) return;

    if (!allowed) {
      if (teardownChannel) {
        teardownChannel();
        teardownChannel = null;
      }
      return;
    }

    if (teardownChannel) return;

    const channel = relay
      .channel(`envelopes:${my_pubkey_hex.slice(0, 12)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'envelopes', filter: `recipient_pubkey=eq.${my_pubkey_hex}` },
        (payload) => onInsert(payload.new as RelayEnvelope),
      )
      .subscribe();

    teardownChannel = () => { void relay.removeChannel(channel); };
  };

  const unsubscribeTransport = subscribeTransport((v) => ensureSubscription(v.allowed));

  return () => {
    disposed = true;
    unsubscribeTransport();
    if (teardownChannel) teardownChannel();
  };
}

export { b64, fromB64 };
