import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { Link } from 'expo-router';
import { useIdentity } from '@/lib/identity';

// INVARIANT I7: passphrase strength is the only thing standing between an
// attacker with the on-disk blob and the user's private keys. We hard-block
// passphrases shorter than 12 chars in the UI; see docs/invariants.md I8.
const MIN_PASS = 12;

export default function Enroll() {
  const { enroll } = useIdentity();
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [alias, setAlias] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    const a = alias.trim();
    if (a.length < 1 || a.length > 30) {
      Alert.alert('Alias', 'Pick a local alias between 1 and 30 chars.');
      return;
    }
    if (pass.length < MIN_PASS) {
      Alert.alert('Passphrase', `Use at least ${MIN_PASS} characters.`);
      return;
    }
    if (pass !== confirm) {
      Alert.alert('Passphrase', 'Confirmation does not match.');
      return;
    }
    setBusy(true);
    const { error } = await enroll(pass, a);
    setBusy(false);
    if (error) Alert.alert('Enroll failed', error);
  };

  return (
    <View style={s.container}>
      <Text style={s.title}>New identity</Text>
      <Text style={s.sub}>
        Your keys are generated on this device. They are never sent to any server.
        If you lose the passphrase, no one — including us — can recover your account.
      </Text>

      <TextInput style={s.input} placeholder="Local alias (only you see this)" placeholderTextColor="#888" value={alias} onChangeText={setAlias} maxLength={30} />
      <TextInput style={s.input} placeholder={`Passphrase (≥${MIN_PASS} chars)`} placeholderTextColor="#888" secureTextEntry value={pass} onChangeText={setPass} />
      <TextInput style={s.input} placeholder="Confirm passphrase" placeholderTextColor="#888" secureTextEntry value={confirm} onChangeText={setConfirm} />

      <Pressable style={s.btn} onPress={onSubmit} disabled={busy}>
        <Text style={s.btnText}>{busy ? '…' : 'Create vault'}</Text>
      </Pressable>
      <Link href="/(auth)/unlock" style={s.link}>
        Already have a vault on this device? Unlock
      </Link>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0b0d', padding: 24, justifyContent: 'center', gap: 12 },
  title: { fontSize: 28, fontWeight: '600', color: 'white' },
  sub: { color: '#aaa', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#333', borderRadius: 8, padding: 12, color: 'white', backgroundColor: '#16161a' },
  btn: { backgroundColor: '#23c483', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  btnText: { color: 'black', fontWeight: '700' },
  link: { marginTop: 16, textAlign: 'center', color: '#7a7a7a' },
});
