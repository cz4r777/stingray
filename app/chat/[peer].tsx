import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, FlatList, Pressable, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useIdentity } from '@/lib/identity';
import { useContacts, aliasFor, sasFor, refuseMediaSend } from '@/lib/contacts';
import { useConversations } from '@/lib/conversations';
import { composeAndSend, drainInbox } from '@/lib/envelope';
import { subscribeInbox, fromB64 } from '@/lib/relay';
import { openEnvelope, utf8, sasCode, fromHex } from '@/lib/crypto';
import type { Contact, Plaintext } from '@/lib/types';

export default function Chat() {
  const { peer } = useLocalSearchParams<{ peer: string }>();
  const { unlocked, faraday } = useIdentity();
  const { contacts } = useContacts();
  const { getHistory, appendMessage } = useConversations();
  // T-005: history sourced from the persisted store. messages is what's
  // visible to the user; we re-pull from getHistory whenever the store
  // updates. New inbound messages still arrive via subscribeInbox below
  // — they go through appendMessage(), which updates the store, which
  // re-renders this hook.
  const messages: Plaintext[] = peer ? getHistory(peer) : [];
  const [text, setText] = useState('');
  const listRef = useRef<FlatList<Plaintext>>(null);

  // T-003: trust-state header. Computed every render so it follows mark-
  // verified / mark-mismatched without remount. sasFor() falls through to
  // 'unverified' for peers without a contact record. INVARIANT I9.
  const trustState = peer ? sasFor(contacts, peer) : 'unverified';
  const headerAlias = peer ? aliasFor(contacts, peer) : 'Chat';
  const headerTitle = peer
    ? `${trustDotChar(trustState)} ${headerAlias}`
    : 'Chat';

  // SAS code for THIS conversation. Shown prominently at the top of the chat
  // so the user can always re-verify out-of-band, not just at add-contact time.
  // INVARIANT I9 — verification IS the defense at pubkey-exchange.
  const peerSas =
    peer && unlocked && /^[0-9a-f]{64}$/.test(peer)
      ? sasCode(fromHex(unlocked.identity.pubkey_hex), fromHex(peer))
      : null;

  useEffect(() => {
    if (!peer || !unlocked) return;
    // T-005: background drain. Persists every inbound message through
    // ConversationsProvider; the UI then re-renders via getHistory().
    // History across restarts comes from the persisted store, not from
    // re-fetching the relay (the relay no longer has the envelopes —
    // ack-delete cleared them).
    void drainInbox(
      unlocked.identity.pubkey_hex,
      unlocked.box_sk,
      async (pt: Plaintext) => {
        const persistPeer = pt.direction === 'in' ? pt.from_pubkey_hex : pt.to_pubkey_hex;
        await appendMessage(persistPeer, pt);
      },
    );
    // Realtime subscription. Per-envelope path mirrors drainInbox but
    // without the ack — subscribeInbox is push-only; the actual ack-delete
    // happens on the next drainInbox call. The push is a wake-up, not a
    // delete-trigger.
    const unsubscribe = subscribeInbox(unlocked.identity.pubkey_hex, (env) => {
      const opened = openEnvelope(fromB64(env.ciphertext), fromB64(env.ephemeral_pubkey), unlocked.box_sk);
      if (!opened) return;            // INVARIANT I12: drop, never log
      try {
        const pt: Plaintext = JSON.parse(utf8.decode(opened));
        pt.direction = 'in';
        pt.received_at = new Date().toISOString();
        const persistPeer = pt.direction === 'in' ? pt.from_pubkey_hex : pt.to_pubkey_hex;
        // appendMessage is idempotent (id-based dedupe) — safe even if the
        // background drain races and inserts the same message first.
        void appendMessage(persistPeer, pt);
      } catch { /* drop */ }
    });
    return unsubscribe;
  }, [peer, unlocked, appendMessage]);

  async function send() {
    if (!unlocked || !peer || !text.trim()) return;
    if (!faraday?.allowed) {
      Alert.alert('Faraday block', faraday?.reason ?? 'Transport not allowed.');
      return;
    }
    const body = text.trim();
    setText('');
    const local: Plaintext = {
      id: `local-${Date.now()}`,
      from_pubkey_hex: unlocked.identity.pubkey_hex,
      to_pubkey_hex: peer,
      body,
      sent_at: new Date().toISOString(),
      received_at: '',
      direction: 'out',
    };
    // T-005: persist outgoing locally so it appears in history on next
    // mount. Peer key for outgoing is the TO field.
    void appendMessage(peer, local);
    const res = await composeAndSend({
      from_pubkey_hex: unlocked.identity.pubkey_hex,
      to_pubkey_hex: peer,
      body,
    });
    if ('error' in res) Alert.alert('Send failed', res.error);
  }

  // T-003: media-send refusal gate. Attachments don't exist in v0; this gate
  // is wired now so the future attachments work inherits it. forbidden_patterns
  // B5.2 spirit: verified-only is the default; never silently green.
  const onAttemptSendMedia = () => {
    if (!peer) return;
    const reason = refuseMediaSend(contacts, peer);
    if (reason) {
      Alert.alert('Media blocked', reason);
      return;
    }
    Alert.alert('Media', 'Attachments are not yet implemented. The gate accepted; the feature has not landed.');
  };

  return (
    <KeyboardAvoidingView style={s.bg} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          title: headerTitle,
          headerTitleStyle: trustHeaderStyle(trustState),
        }}
      />
      {trustState !== 'verified' ? (
        <View style={[s.trustBanner, trustBannerColor(trustState)]}>
          <Text style={s.trustBannerText}>
            {trustState === 'mismatched'
              ? 'SAS marked mismatched — do not send sensitive content. Remove + re-add the contact after verifying out-of-band.'
              : 'SAS unverified — compare the 7-digit code with the peer on a separate channel before trusting messages here.'}
          </Text>
        </View>
      ) : null}
      {peerSas ? (
        <View style={[s.sasStrip, trustState === 'verified' ? s.sasStripVerified : null]}>
          <Text style={s.sasStripLabel}>SAS</Text>
          <Text style={s.sasStripCode}>{peerSas}</Text>
          <Text style={s.sasStripLabel}>
            {trustState === 'verified' ? '✓ verified' : 'compare with peer'}
          </Text>
        </View>
      ) : null}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m, i) => m.id || `${i}`}
        contentContainerStyle={{ padding: 12, gap: 6 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          const mine = item.direction === 'out';
          return (
            <View style={[s.bubble, mine ? s.mine : s.theirs]}>
              <Text style={mine ? s.mineText : s.theirsText}>{item.body}</Text>
            </View>
          );
        }}
      />
      <View style={s.composer}>
        <Pressable style={s.attach} onPress={onAttemptSendMedia} hitSlop={6}>
          <Text style={s.attachText}>+</Text>
        </Pressable>
        <TextInput
          style={s.input}
          value={text}
          onChangeText={setText}
          placeholder="Encrypted message"
          placeholderTextColor="#888"
          onSubmitEditing={send}
        />
        <Pressable style={s.send} onPress={send}>
          <Text style={{ color: 'black', fontWeight: '700' }}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function trustDotChar(state: Contact['sas_state']): string {
  // The header title is plain text — we encode the trust state via a
  // dot character before the alias so screen readers and unstyled platforms
  // still surface SOMETHING. Color is applied separately via headerTitleStyle.
  return '●';
}

function trustHeaderStyle(state: Contact['sas_state']) {
  switch (state) {
    case 'verified':   return { color: '#23c483' };
    case 'mismatched': return { color: '#e54848' };
    case 'unverified':
    default:           return { color: '#d6a73a' };
  }
}

function trustBannerColor(state: Contact['sas_state']) {
  switch (state) {
    case 'mismatched': return { backgroundColor: '#3a0e0e' };
    case 'unverified':
    default:           return { backgroundColor: '#3a2e0e' };
  }
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#0b0b0d' },
  bubble: { padding: 10, borderRadius: 14, maxWidth: '78%' },
  mine: { backgroundColor: '#23c483', alignSelf: 'flex-end' },
  theirs: { backgroundColor: '#222', alignSelf: 'flex-start' },
  mineText: { color: 'black' },
  theirsText: { color: 'white' },
  composer: { flexDirection: 'row', padding: 8, gap: 8, borderTopWidth: 1, borderColor: '#222', backgroundColor: '#0b0b0d', alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: '#333', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, color: 'white' },
  send: { backgroundColor: '#23c483', paddingHorizontal: 16, borderRadius: 20, justifyContent: 'center' },
  attach: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: '#333', alignItems: 'center', justifyContent: 'center' },
  attachText: { color: '#888', fontSize: 22, lineHeight: 22 },
  trustBanner: { paddingHorizontal: 12, paddingVertical: 8 },
  trustBannerText: { color: 'white', fontSize: 12 },
  sasStrip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#000', borderBottomWidth: 1, borderColor: '#23c483',
  },
  sasStripVerified: { borderColor: '#23c483' },
  sasStripLabel: { color: '#aaa', fontSize: 11, fontWeight: '600' },
  sasStripCode: {
    color: '#23c483', fontFamily: 'monospace', fontSize: 22,
    letterSpacing: 4, fontWeight: '700',
  },
});
