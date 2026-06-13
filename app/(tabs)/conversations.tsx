import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useIdentity } from '@/lib/identity';
import { useContacts, aliasFor, sasFor } from '@/lib/contacts';
import { useConversations, rollupFromHistory } from '@/lib/conversations';
import { drainInbox } from '@/lib/envelope';
import type { Contact, Conversation, Plaintext } from '@/lib/types';

export default function Conversations() {
  const { unlocked } = useIdentity();
  const { contacts } = useContacts();
  const { conversations, appendMessage } = useConversations();
  const router = useRouter();
  const [draining, setDraining] = useState(true);

  // Background drain on mount + every time the unlocked vault changes.
  // History display comes from the persisted ConversationsMap; the drain
  // is only there to pull anything that arrived while the app was
  // backgrounded. INVARIANT I11: drainInbox persists before ack-delete.
  useEffect(() => {
    if (!unlocked) { setDraining(false); return; }
    let mounted = true;
    setDraining(true);
    void (async () => {
      try {
        await drainInbox(
          unlocked.identity.pubkey_hex,
          unlocked.box_sk,
          async (pt: Plaintext) => {
            // T-005: persist BEFORE ack-delete fires. The peer key is the
            // FROM for inbound mail.
            const peer = pt.direction === 'in' ? pt.from_pubkey_hex : pt.to_pubkey_hex;
            await appendMessage(peer, pt);
          },
        );
      } finally {
        if (mounted) setDraining(false);
      }
    })();
    return () => { mounted = false; };
  }, [unlocked, appendMessage]);

  // Roll up from persisted history. Survives restart because conversations
  // is hydrated from local_store on unlock.
  const rolls = useMemo<Conversation[]>(() => {
    return rollupFromHistory(
      conversations,
      (peer) => aliasFor(contacts, peer),
    );
  }, [conversations, contacts]);

  if (draining && rolls.length === 0) {
    return <View style={s.center}><Text style={s.dim}>Draining inbox…</Text></View>;
  }
  if (rolls.length === 0) {
    return <View style={s.center}><Text style={s.dim}>No conversations yet. Share your key on the Contacts tab.</Text></View>;
  }

  return (
    <FlatList
      style={s.bg}
      data={rolls}
      keyExtractor={(c) => c.peer_pubkey_hex}
      contentContainerStyle={{ padding: 12, gap: 6 }}
      renderItem={({ item }) => {
        // T-003: trust state dot. sasFor() falls through to 'unverified' for
        // peers without a contact record — INVARIANT I9 + forbidden_patterns
        // B5.2 require no false-green badges. Unknown peers are never green.
        const state = sasFor(contacts, item.peer_pubkey_hex);
        return (
          <Pressable
            style={s.row}
            onPress={() => router.push(`/chat/${item.peer_pubkey_hex}`)}
          >
            <Text
              style={[s.trustDot, sasDotColor(state)]}
              accessibilityLabel={sasAccessibilityLabel(state)}
            >
              ●
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={s.alias}>{item.alias}</Text>
              <Text style={s.preview} numberOfLines={1}>
                {item.last_plaintext_preview ?? 'No messages yet'}
              </Text>
            </View>
            {item.unread > 0 ? <Text style={s.badge}>{item.unread}</Text> : null}
          </Pressable>
        );
      }}
    />
  );
}

// T-003: shared trust-state visuals. Kept inline here (rather than exported
// from contacts.tsx) because the StyleSheet types live in this screen.
export function sasDotColor(state: Contact['sas_state']) {
  switch (state) {
    case 'verified':   return { color: '#23c483' };
    case 'mismatched': return { color: '#e54848' };
    case 'unverified':
    default:           return { color: '#d6a73a' };
  }
}

export function sasAccessibilityLabel(state: Contact['sas_state']): string {
  switch (state) {
    case 'verified':   return 'Contact SAS verified';
    case 'mismatched': return 'Contact SAS marked mismatched — do not trust';
    case 'unverified':
    default:           return 'Contact SAS unverified — compare codes out-of-band before trusting';
  }
}

const s = StyleSheet.create({
  bg: { backgroundColor: '#0b0b0d', flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b0b0d', padding: 24 },
  dim: { color: '#888', textAlign: 'center' },
  row: { padding: 14, backgroundColor: '#16161a', borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  trustDot: { fontSize: 18, width: 16, textAlign: 'center' },
  alias: { color: 'white', fontWeight: '600' },
  preview: { color: '#888', marginTop: 2 },
  badge: { color: 'black', backgroundColor: '#23c483', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2, fontWeight: '700', overflow: 'hidden' },
});
