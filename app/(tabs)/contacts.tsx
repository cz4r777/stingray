import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView, FlatList, Modal,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useIdentity } from '@/lib/identity';
import { useContacts, sasFor } from '@/lib/contacts';
import { sasCode, fromHex } from '@/lib/crypto';
import type { Contact } from '@/lib/types';

// INVARIANT I9 (and T-003 implementation): a contact is NEVER considered
// verified until the user has independently confirmed the 7-digit SAS code
// with the peer over a separate channel AND tapped the explicit "I verified"
// button in the modal below. There is no other code path to 'verified' state.
//
// INVARIANT I13: aliases stay local-only. Nothing on this screen leaves
// the device.
//
// MISMATCHED IS IMMOVABLE: once a user taps "Mark mismatched" on a contact,
// the data layer refuses to transition back. The only recovery is
// removeContact + re-add. This is intentionally non-reversible — a
// recoverable mismatch is a social-engineering vector
// ("oh I made a mistake, undo it").

type PendingAdd = {
  pubkey_hex: string;
  alias: string;
  sas: string;
};

export default function Contacts() {
  const { identity } = useIdentity();
  const { contacts, loading, addContact, markVerified, markMismatched, removeContact } = useContacts();
  const [peerPub, setPeerPub] = useState('');
  const [alias, setAlias] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingAdd | null>(null);

  if (!identity) return <View style={s.center}><Text style={s.dim}>Unlocking…</Text></View>;

  const myPub = identity.pubkey_hex;
  const peerPubLower = peerPub.trim().toLowerCase();
  const isValidPub = peerPubLower.length === 64 && /^[0-9a-f]{64}$/.test(peerPubLower);
  const livePreviewSas = isValidPub ? sasCode(fromHex(myPub), fromHex(peerPubLower)) : null;

  const onSavePersist = async () => {
    if (!isValidPub) {
      Alert.alert('Public key', 'Expected 64 lowercase hex chars.');
      return;
    }
    if (peerPubLower === myPub.toLowerCase()) {
      Alert.alert('Public key', 'That is your own public key.');
      return;
    }
    const a = alias.trim();
    if (a.length < 1 || a.length > 30) {
      Alert.alert('Alias', 'Pick a local alias between 1 and 30 chars.');
      return;
    }
    setBusy(true);
    try {
      await addContact({
        pubkey_hex: peerPubLower,
        sign_pubkey_hex: peerPubLower,   // exchange separately in a future ticket
        alias: a,
      });
      // Open the SAS confirm modal — this is the ONLY path to 'verified'.
      // Closing the modal without confirming leaves the contact at the
      // default 'unverified' state. INVARIANT I9.
      setPending({
        pubkey_hex: peerPubLower,
        alias: a,
        sas: sasCode(fromHex(myPub), fromHex(peerPubLower)),
      });
      setPeerPub('');
      setAlias('');
    } catch (e: unknown) {
      Alert.alert('Save failed', e instanceof Error ? e.message : 'unknown error');
    } finally {
      setBusy(false);
    }
  };

  const onConfirmVerified = async () => {
    if (!pending) return;
    await markVerified(pending.pubkey_hex);
    setPending(null);
  };

  const onConfirmMismatched = async () => {
    if (!pending) return;
    Alert.alert(
      'Mark mismatched',
      `Marking ${pending.alias} mismatched means an active MITM may have substituted their key. This state is PERMANENT — the only way out is to remove and re-add the contact after exchanging keys again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark mismatched',
          style: 'destructive',
          onPress: async () => {
            await markMismatched(pending.pubkey_hex);
            setPending(null);
          },
        },
      ],
    );
  };

  const onLeaveUnverified = () => {
    // Honest default: leave at unverified. No badge promotion. The user can
    // come back later and verify (Settings panel feature is deferred to a
    // follow-up; for now they re-add the same key — addContact preserves
    // sas_state on re-add per T-002 implementation).
    setPending(null);
  };

  const onMarkExistingMismatched = (c: Contact) => {
    Alert.alert(
      'Mark mismatched',
      `Marking ${c.alias} mismatched means an active MITM may have substituted their key. This state is PERMANENT — the only way out is to remove and re-add the contact after exchanging keys again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark mismatched',
          style: 'destructive',
          onPress: () => { void markMismatched(c.pubkey_hex); },
        },
      ],
    );
  };

  const onRemove = (c: Contact) => {
    Alert.alert(
      'Remove contact',
      `Remove ${c.alias} (${c.pubkey_hex.slice(0, 12)}…)?\n\nIf this contact was marked mismatched, removing is also the only way to recover and re-verify.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => { void removeContact(c.pubkey_hex); },
        },
      ],
    );
  };

  const contactList = Object.values(contacts).sort((a, b) =>
    a.alias.localeCompare(b.alias),
  );

  return (
    <ScrollView style={s.bg} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <View style={s.card}>
        <Text style={s.label}>Your public key</Text>
        <Text selectable style={s.mono}>{myPub}</Text>
        <Pressable style={s.btn} onPress={() => { void Clipboard.setStringAsync(myPub); Alert.alert('Copied'); }}>
          <Text style={s.btnText}>Copy</Text>
        </Pressable>
        <Text style={s.help}>
          Share this on a channel the stingray cannot intercept (in person, signed paper, QR
          on an air-gapped device). Anyone with your key can send you encrypted messages.
        </Text>
      </View>

      <View style={s.card}>
        <Text style={s.label}>Add contact</Text>
        <TextInput
          style={s.input}
          placeholder="Peer public key (64 hex chars)"
          placeholderTextColor="#888"
          autoCapitalize="none"
          value={peerPub}
          onChangeText={setPeerPub}
        />
        <TextInput
          style={s.input}
          placeholder="Local alias (only you see this)"
          placeholderTextColor="#888"
          value={alias}
          onChangeText={setAlias}
          maxLength={30}
        />
        {livePreviewSas ? (
          <View style={s.sasBox}>
            <Text style={s.sasLabel}>SAS verification code</Text>
            <Text style={s.sas}>{livePreviewSas}</Text>
            <Text style={s.help}>
              Both of you must see the SAME 7 digits. After saving, you&apos;ll be asked
              to confirm — only confirm when you have compared this with the peer on
              a SEPARATE channel.
            </Text>
          </View>
        ) : null}
        <Pressable
          style={[s.btn, { backgroundColor: '#23c483' }, busy && s.btnDisabled]}
          disabled={busy}
          onPress={() => { void onSavePersist(); }}
        >
          <Text style={[s.btnText, { color: 'black' }]}>{busy ? 'Saving…' : 'Save'}</Text>
        </Pressable>
      </View>

      <View style={s.card}>
        <Text style={s.label}>Saved contacts {contactList.length > 0 ? `(${contactList.length})` : ''}</Text>
        {loading ? (
          <Text style={s.dim}>Loading contacts…</Text>
        ) : contactList.length === 0 ? (
          <Text style={s.dim}>No contacts yet. Paste a peer&apos;s public key above to add one.</Text>
        ) : (
          <FlatList
            scrollEnabled={false}
            data={contactList}
            keyExtractor={(c) => c.pubkey_hex}
            ItemSeparatorComponent={() => <View style={s.sep} />}
            renderItem={({ item }) => (
              <View style={s.contactRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.contactAlias}>{item.alias}</Text>
                  <Text style={s.contactPub} numberOfLines={1}>{item.pubkey_hex}</Text>
                  <View style={s.statusRow}>
                    <Text style={[s.contactStatus, statusColor(item.sas_state)]}>
                      {statusLabel(item.sas_state)}
                    </Text>
                  </View>
                  {item.sas_state !== 'mismatched' ? (
                    <Pressable hitSlop={8} onPress={() => onMarkExistingMismatched(item)}>
                      <Text style={s.markMismatched}>Mark mismatched →</Text>
                    </Pressable>
                  ) : null}
                </View>
                <Pressable onPress={() => onRemove(item)} hitSlop={8}>
                  <Text style={s.removeBtn}>Remove</Text>
                </Pressable>
              </View>
            )}
          />
        )}
      </View>

      {/* T-003 confirm modal — the ONLY path to sas_state='verified' from
          UI. INVARIANT I9 + forbidden_patterns B5.2 implementation. */}
      <Modal
        visible={!!pending}
        transparent
        animationType="fade"
        onRequestClose={onLeaveUnverified}
      >
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Confirm SAS</Text>
            <Text style={s.modalBody}>
              Compare these 7 digits with {pending?.alias ?? 'the peer'} on a SEPARATE channel
              (in person, paper, voice on a different device). Both sides must see the same
              code.
            </Text>
            <View style={s.modalSasBox}>
              <Text style={s.modalSas}>{pending?.sas}</Text>
            </View>
            <Pressable style={[s.modalBtn, s.modalBtnPrimary]} onPress={() => { void onConfirmVerified(); }}>
              <Text style={s.modalBtnPrimaryText}>I verified the same 7 digits</Text>
            </Pressable>
            <Pressable style={s.modalBtn} onPress={onLeaveUnverified}>
              <Text style={s.modalBtnText}>Leave unverified for now</Text>
            </Pressable>
            <Pressable style={[s.modalBtn, s.modalBtnDestructive]} onPress={() => { void onConfirmMismatched(); }}>
              <Text style={s.modalBtnDestructiveText}>The codes don&apos;t match — mark mismatched</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function statusLabel(s: Contact['sas_state']): string {
  switch (s) {
    case 'verified':   return '● Verified (SAS confirmed)';
    case 'mismatched': return '● Mismatched — re-add to reset';
    case 'unverified':
    default:           return '● Unverified — SAS not yet confirmed';
  }
}

function statusColor(state: Contact['sas_state']) {
  switch (state) {
    case 'verified':   return { color: '#23c483' };
    case 'mismatched': return { color: '#e54848' };
    case 'unverified':
    default:           return { color: '#d6a73a' };
  }
}

// Exported so the conversations screen, chat header, and any future
// per-contact surface can render the same dot consistently. Pure presentation.
// Renamed in T-003 — was inline in T-002 contacts.tsx, now centralised.
void sasFor;

const s = StyleSheet.create({
  bg: { backgroundColor: '#0b0b0d', flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b0b0d' },
  dim: { color: '#888' },
  card: { backgroundColor: '#16161a', borderRadius: 10, padding: 14, gap: 10 },
  label: { color: 'white', fontWeight: '600' },
  mono: { color: '#23c483', fontFamily: 'monospace', fontSize: 12 },
  input: { borderWidth: 1, borderColor: '#333', borderRadius: 8, padding: 12, color: 'white' },
  btn: { padding: 10, borderRadius: 8, backgroundColor: '#333', alignItems: 'center' },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: 'white', fontWeight: '600' },
  help: { color: '#888', fontSize: 12 },
  sasBox: { borderWidth: 1, borderColor: '#23c483', borderRadius: 8, padding: 10, gap: 4 },
  sasLabel: { color: '#aaa', fontSize: 12 },
  sas: { color: '#23c483', fontFamily: 'monospace', fontSize: 28, letterSpacing: 4 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  contactAlias: { color: 'white', fontWeight: '600' },
  contactPub: { color: '#666', fontFamily: 'monospace', fontSize: 11, marginTop: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  contactStatus: { fontSize: 12 },
  markMismatched: { color: '#e54848', fontSize: 11, marginTop: 4 },
  sep: { height: 1, backgroundColor: '#222' },
  removeBtn: { color: '#e54848', fontWeight: '600' },
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', padding: 16,
  },
  modalCard: { backgroundColor: '#16161a', borderRadius: 12, padding: 18, gap: 12 },
  modalTitle: { color: 'white', fontSize: 20, fontWeight: '700' },
  modalBody: { color: '#bbb', fontSize: 14, lineHeight: 20 },
  modalSasBox: {
    borderWidth: 1, borderColor: '#23c483', borderRadius: 8,
    padding: 12, alignItems: 'center', backgroundColor: '#0b0b0d',
  },
  modalSas: { color: '#23c483', fontFamily: 'monospace', fontSize: 32, letterSpacing: 6 },
  modalBtn: { padding: 12, borderRadius: 8, alignItems: 'center', backgroundColor: '#222' },
  modalBtnPrimary: { backgroundColor: '#23c483' },
  modalBtnPrimaryText: { color: 'black', fontWeight: '700' },
  modalBtnText: { color: 'white', fontWeight: '600' },
  modalBtnDestructive: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#e54848' },
  modalBtnDestructiveText: { color: '#e54848', fontWeight: '600' },
});
