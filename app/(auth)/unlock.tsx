import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Link } from 'expo-router';
import { useIdentity } from '@/lib/identity';

export default function Unlock() {
  const { unlock, wipe } = useIdentity();
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    // Argon2id MODERATE takes ~300–800 ms on a mid-2025 phone. The spinner is
    // intentional — the slow unlock is the per-guess cost defense from I8.
    setBusy(true);
    const { error } = await unlock(pass);
    setBusy(false);
    if (error) Alert.alert('Unlock failed', error);
  };

  const onPanic = () => {
    Alert.alert(
      'Panic wipe',
      'This deletes your local keys. Anyone messaging you will see no response. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Wipe', style: 'destructive', onPress: () => void wipe() },
      ],
    );
  };

  return (
    <View style={s.container}>
      <Text style={s.title}>Unlock</Text>
      <Text style={s.sub}>Enter the passphrase that decrypts your local key vault.</Text>
      <TextInput
        style={s.input}
        placeholder="Passphrase"
        placeholderTextColor="#888"
        secureTextEntry
        value={pass}
        onChangeText={setPass}
      />
      <Pressable style={s.btn} onPress={onSubmit} disabled={busy}>
        {busy ? <ActivityIndicator color="black" /> : <Text style={s.btnText}>Unlock</Text>}
      </Pressable>
      {busy ? (
        <Text style={s.hint}>Deriving vault key… this is intentionally slow.</Text>
      ) : null}
      <Link href="/(auth)/enroll" style={s.link}>
        No vault on this device — start fresh
      </Link>
      <Pressable style={s.panic} onPress={onPanic}>
        <Text style={s.panicText}>Panic wipe</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0b0d', padding: 24, justifyContent: 'center', gap: 12 },
  title: { fontSize: 28, fontWeight: '600', color: 'white' },
  sub: { color: '#aaa', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#333', borderRadius: 8, padding: 12, color: 'white', backgroundColor: '#16161a' },
  btn: { backgroundColor: '#23c483', padding: 14, borderRadius: 8, alignItems: 'center' },
  btnText: { color: 'black', fontWeight: '700' },
  link: { marginTop: 16, textAlign: 'center', color: '#7a7a7a' },
  hint: { color: '#888', textAlign: 'center', fontSize: 12 },
  panic: { marginTop: 'auto', padding: 12, alignItems: 'center' },
  panicText: { color: '#aa3333', fontWeight: '600' },
});
