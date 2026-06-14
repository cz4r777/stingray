import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator, Platform } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useIdentity } from '@/lib/identity';

export default function Unlock() {
  const { unlock, unlockBiometric, wipe, hasVault, loading, biometricUnlockReady } = useIdentity();
  const router = useRouter();
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);
  // v0.1.5 — biometric-first auto-prompt. Fires once on mount when the
  // OS-cached vault key is available. If the user cancels we DO NOT
  // re-prompt automatically (would be hostile UX); we leave the
  // passphrase input visible and offer a "Try biometric" pill instead.
  const autoBioFiredRef = useRef(false);
  const [bioBusy, setBioBusy] = useState(false);
  const [bioOffered, setBioOffered] = useState<boolean>(biometricUnlockReady);

  useEffect(() => {
    setBioOffered(biometricUnlockReady);
  }, [biometricUnlockReady]);

  useEffect(() => {
    if (loading || hasVault) return;
    router.replace('/(auth)/enroll');
  }, [hasVault, loading, router]);

  // Auto-prompt biometric on mount when a cached key is available.
  // We do NOT auto-prompt on web (no hardware) or after a panic wipe.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (loading || !hasVault || !biometricUnlockReady) return;
    if (autoBioFiredRef.current) return;
    autoBioFiredRef.current = true;
    void tryBiometric();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, hasVault, biometricUnlockReady]);

  if (loading || !hasVault) {
    return (
      <View style={s.container}>
        <Text style={s.title}>Checking vault…</Text>
        <Text style={s.sub}>
          {!hasVault && !loading
            ? 'No local vault was found on this device. Redirecting to enrol…'
            : 'Looking for a local vault on this device…'}
        </Text>
      </View>
    );
  }

  async function tryBiometric() {
    if (bioBusy) return;
    setBioBusy(true);
    try {
      const { error } = await unlockBiometric();
      if (error) {
        // Don't alert — user may have cancelled deliberately. Leave the
        // passphrase input visible. The "Try biometric" pill stays.
        return;
      }
    } finally {
      setBioBusy(false);
    }
  }

  const onSubmit = async () => {
    if (busy || loading || submittingRef.current) return;
    // Argon2id MODERATE takes ~300–800 ms on a mid-2025 phone. The spinner is
    // intentional — the slow unlock is the per-guess cost defense from I8.
    submittingRef.current = true;
    setBusy(true);
    try {
      const { error } = await unlock(pass);
      if (error) Alert.alert('Unlock failed', error);
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
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
      <Text style={s.sub}>
        {bioOffered
          ? 'Tap your fingerprint sensor or use Face Unlock. Or enter your passphrase.'
          : 'Enter the passphrase that decrypts your local key vault.'}
      </Text>

      {bioOffered ? (
        <Pressable style={[s.bioBtn, bioBusy && s.btnDisabled]} onPress={tryBiometric} disabled={bioBusy}>
          {bioBusy ? <ActivityIndicator color="black" /> : <Text style={s.bioBtnText}>Use biometric</Text>}
        </Pressable>
      ) : null}

      <TextInput
        style={s.input}
        placeholder="Passphrase"
        placeholderTextColor="#888"
        secureTextEntry
        value={pass}
        onChangeText={setPass}
      />
      <Pressable style={s.btn} onPress={onSubmit} disabled={busy}>
        {busy ? <ActivityIndicator color="black" /> : <Text style={s.btnText}>Unlock with passphrase</Text>}
      </Pressable>
      {busy ? (
        <Text style={s.hint}>Deriving vault key… this is intentionally slow.</Text>
      ) : null}
      <Link href="/(auth)/enroll" style={s.link}>
        Need a new identity instead? Panic wipe first, then enrol
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
  btnDisabled: { opacity: 0.75 },
  bioBtn: { backgroundColor: '#23c483', padding: 14, borderRadius: 8, alignItems: 'center', marginBottom: 4 },
  bioBtnText: { color: 'black', fontWeight: '700' },
  link: { marginTop: 16, textAlign: 'center', color: '#7a7a7a' },
  hint: { color: '#888', textAlign: 'center', fontSize: 12 },
  panic: { marginTop: 'auto', padding: 12, alignItems: 'center' },
  panicText: { color: '#aa3333', fontWeight: '600' },
});
