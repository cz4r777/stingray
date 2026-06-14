import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView, FlatList, Modal,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { CameraView, useCameraPermissions } from 'expo-camera';
import QRCode from 'react-native-qrcode-svg';
import { useIdentity } from '@/lib/identity';
import { useContacts, sasFor } from '@/lib/contacts';
import { sasCode, fromHex } from '@/lib/crypto';
import type { Contact } from '@/lib/types';

// INVARIANT I9 (T-003): contacts are NEVER verified without an explicit
// out-of-band SAS comparison + tap of "I verified" in the modal.
// INVARIANT I13: aliases stay local-only.
// MISMATCHED IS IMMOVABLE: only recovery is delete + re-add.

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
  const [showMyQr, setShowMyQr] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

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
        sign_pubkey_hex: peerPubLower,
        alias: a,
      });
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

  const onLeaveUnverified = () => setPending(null);

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

  // Open camera. Asks for permission if needed.
  const onScan = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert('Camera blocked', 'Stingray needs camera access to scan a peer\'s public-key QR.');
        return;
      }
    }
    setScanning(true);
  };

  // Triggered when the camera reads a QR. Validates and autofills the input.
  const onScanned = ({ data }: { data: string }) => {
    if (!scanning) return; // ignore repeated callbacks after first scan
    const candidate = data.trim().toLowerCase();
    if (candidate.length !== 64 || !/^[0-9a-f]{64}$/.test(candidate)) {
      setScanning(false);
      Alert.alert('Not a stingray key', 'The QR did not contain a 64-char hex public key.');
      return;
    }
    setScanning(false);
    setPeerPub(candidate);
  };

  const contactList = Object.values(contacts).sort((a, b) =>
    a.alias.localeCompare(b.alias),
  );

  return (
    <ScrollView style={s.bg} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <View style={s.card}>
        <Text style={s.label}>Your public key</Text>
        <Text selectable style={s.mono}>{myPub}</Text>
        <View style={s.row}>
          <Pressable style={[s.btn, { flex: 1 }]} onPress={() => { void Clipboard.setStringAsync(myPub); Alert.alert('Copied'); }}>
            <Text style={s.btnText}>Copy</Text>
          </Pressable>
          <Pressable style={[s.btn, { flex: 1, backgroundColor: '#23c483' }]} onPress={() => setShowMyQr(true)}>
            <Text style={[s.btnText, { color: 'black' }]}>Show QR</Text>
          </Pressable>
        </View>
        <Text style={s.help}>
          Share this on a channel the stingray cannot intercept (in person, signed paper,
          QR on an air-gapped device). Tap Show QR to have the peer scan it.
        </Text>
      </View>

      <View style={s.card}>
        <Text style={s.label}>Add contact</Text>
        <View style={s.row}>
          <TextInput
            style={[s.input, { flex: 1 }]}
            placeholder="Peer public key (64 hex chars)"
            placeholderTextColor="#888"
            autoCapitalize="none"
            value={peerPub}
            onChangeText={setPeerPub}
          />
          <Pressable style={s.scanBtn} onPress={() => { void onScan(); }}>
            <Text style={s.scanBtnText}>Scan</Text>
          </Pressable>
        </View>
        <TextInput
          style={s.input}
          placeholder="Local alias (only you see this)"
          placeholderTextColor="#888"
          value={alias}
          onChangeText={setAlias}
          maxLength={30}
        />
        {livePreviewSas ? (
          <View style={s.sasBoxBig}>
            <Text style={s.sasLabelBig}>SAS verification code</Text>
            <Text style={s.sasBig}>{livePreviewSas}</Text>
            <Text style={s.help}>
              Both phones MUST show the SAME 7 digits. Compare out-of-band before tapping
              "I verified" in the next step.
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
          <Text style={s.dim}>No contacts yet. Paste a peer&apos;s public key above or scan a QR.</Text>
        ) : (
          <FlatList
            scrollEnabled={false}
            data={contactList}
            keyExtractor={(c) => c.pubkey_hex}
            ItemSeparatorComponent={() => <View style={s.sep} />}
            renderItem={({ item }) => {
              const itemSas = sasCode(fromHex(myPub), fromHex(item.pubkey_hex));
              return (
                <View style={s.contactRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.contactAlias}>{item.alias}</Text>
                    <Text style={s.contactPub} numberOfLines={1}>{item.pubkey_hex}</Text>
                    <View style={s.statusRow}>
                      <Text style={[s.contactStatus, statusColor(item.sas_state)]}>
                        {statusLabel(item.sas_state)}
                      </Text>
                    </View>
                    <Text style={s.sasInline}>SAS: <Text style={s.sasInlineCode}>{itemSas}</Text></Text>
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
              );
            }}
          />
        )}
      </View>

      {/* "Show my QR" modal — the peer scans this to get my pubkey */}
      <Modal visible={showMyQr} transparent animationType="fade" onRequestClose={() => setShowMyQr(false)}>
        <View style={s.modalBackdrop}>
          <View style={[s.modalCard, { alignItems: 'center' }]}>
            <Text style={s.modalTitle}>Your public key</Text>
            <Text style={s.modalBody}>Have the peer scan this with their stingray app → Contacts → Scan.</Text>
            <View style={s.qrBox}>
              <QRCode value={myPub} size={260} backgroundColor="white" color="black" />
            </View>
            <Text selectable style={[s.mono, { textAlign: 'center' }]}>{myPub}</Text>
            <Pressable style={[s.modalBtn, s.modalBtnPrimary]} onPress={() => setShowMyQr(false)}>
              <Text style={s.modalBtnPrimaryText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Scan-peer-QR modal */}
      <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
        <View style={s.scanBg}>
          <CameraView
            style={s.cameraFill}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={onScanned}
          />
          <View style={s.scanOverlay}>
            <Text style={s.scanHint}>Point at the peer&apos;s public-key QR</Text>
            <Pressable style={[s.modalBtn, { backgroundColor: '#333' }]} onPress={() => setScanning(false)}>
              <Text style={s.modalBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Confirm-SAS modal — the only path to sas_state='verified' */}
      <Modal visible={!!pending} transparent animationType="fade" onRequestClose={onLeaveUnverified}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Confirm SAS</Text>
            <Text style={s.modalBody}>
              Compare these 7 digits with {pending?.alias ?? 'the peer'} on a SEPARATE channel
              (in person, paper, voice on a different device). Both sides must see the same code.
            </Text>
            <View style={s.modalSasBoxBig}>
              <Text style={s.modalSasBig}>{pending?.sas}</Text>
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

void sasFor;

const s = StyleSheet.create({
  bg: { backgroundColor: '#0b0b0d', flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b0b0d' },
  dim: { color: '#888' },
  card: { backgroundColor: '#16161a', borderRadius: 10, padding: 14, gap: 10 },
  label: { color: 'white', fontWeight: '600' },
  mono: { color: '#23c483', fontFamily: 'monospace', fontSize: 12 },
  input: { borderWidth: 1, borderColor: '#333', borderRadius: 8, padding: 12, color: 'white' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  btn: { padding: 12, borderRadius: 8, backgroundColor: '#333', alignItems: 'center' },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: 'white', fontWeight: '600' },
  help: { color: '#888', fontSize: 12 },
  scanBtn: {
    paddingHorizontal: 14, paddingVertical: 12, borderRadius: 8,
    backgroundColor: '#23c483', alignItems: 'center', justifyContent: 'center',
  },
  scanBtnText: { color: 'black', fontWeight: '700' },

  // Bigger inline SAS preview (was 28pt)
  sasBoxBig: {
    borderWidth: 1, borderColor: '#23c483', borderRadius: 8,
    padding: 14, gap: 6, backgroundColor: '#0b0b0d',
    alignItems: 'center',
  },
  sasLabelBig: { color: '#aaa', fontSize: 13 },
  sasBig: {
    color: '#23c483',
    fontFamily: 'monospace',
    fontSize: 44,
    letterSpacing: 8,
    fontWeight: '700',
  },

  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  contactAlias: { color: 'white', fontWeight: '600' },
  contactPub: { color: '#666', fontFamily: 'monospace', fontSize: 11, marginTop: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  contactStatus: { fontSize: 12 },
  sasInline: { color: '#888', fontSize: 12, marginTop: 4 },
  sasInlineCode: { color: '#23c483', fontFamily: 'monospace', fontWeight: '700' },
  markMismatched: { color: '#e54848', fontSize: 11, marginTop: 4 },
  sep: { height: 1, backgroundColor: '#222' },
  removeBtn: { color: '#e54848', fontWeight: '600' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 16 },
  modalCard: { backgroundColor: '#16161a', borderRadius: 12, padding: 18, gap: 12 },
  modalTitle: { color: 'white', fontSize: 22, fontWeight: '700' },
  modalBody: { color: '#bbb', fontSize: 14, lineHeight: 20 },
  qrBox: { backgroundColor: 'white', padding: 12, borderRadius: 8 },

  // Bigger SAS in confirm modal (was 32pt)
  modalSasBoxBig: {
    borderWidth: 2, borderColor: '#23c483', borderRadius: 10,
    padding: 18, alignItems: 'center', backgroundColor: 'black',
  },
  modalSasBig: {
    color: '#23c483',
    fontFamily: 'monospace',
    fontSize: 56,
    letterSpacing: 10,
    fontWeight: '700',
  },

  modalBtn: { padding: 14, borderRadius: 8, alignItems: 'center', backgroundColor: '#222' },
  modalBtnPrimary: { backgroundColor: '#23c483' },
  modalBtnPrimaryText: { color: 'black', fontWeight: '700', fontSize: 16 },
  modalBtnText: { color: 'white', fontWeight: '600' },
  modalBtnDestructive: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#e54848' },
  modalBtnDestructiveText: { color: '#e54848', fontWeight: '600' },

  scanBg: { flex: 1, backgroundColor: 'black' },
  cameraFill: { flex: 1 },
  scanOverlay: {
    position: 'absolute', bottom: 40, left: 16, right: 16,
    padding: 16, gap: 12, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 12,
  },
  scanHint: { color: 'white', textAlign: 'center', fontSize: 14 },
});
