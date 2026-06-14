import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator, Platform } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useIdentity } from '@/lib/identity';
import { enforceBiometric, getBiometricCapability, type BiometricCapability } from '@/lib/biometric';

// INVARIANT I7: passphrase strength is the only thing standing between an
// attacker with the on-disk blob and the user's private keys. We hard-block
// passphrases shorter than 12 chars in the UI; see docs/invariants.md I8.
const MIN_PASS = 12;

export default function Enroll() {
  const { enroll, hasVault, loading } = useIdentity();
  const router = useRouter();
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [alias, setAlias] = useState('');
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);
  // v0.1.5 — biometric gate. Web has no hardware to check; we accept
  // immediately there so the web demo (cz4r777.github.io/stingray) keeps
  // working. Native must pass enforceBiometric() before enrol is offered.
  const [bioCap, setBioCap] = useState<BiometricCapability | null>(null);
  const [bioReady, setBioReady] = useState<boolean | null>(Platform.OS === 'web' ? true : null);

  useEffect(() => {
    if (loading || !hasVault) return;
    router.replace('/(auth)/unlock');
  }, [hasVault, loading, router]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void getBiometricCapability().then((c) => {
      setBioCap(c);
      setBioReady(c.hasHardware && c.isEnrolled);
    });
  }, []);

  if (loading || hasVault) {
    return (
      <View style={s.container}>
        <Text style={s.title}>Checking vault…</Text>
        <Text style={s.sub}>
          {hasVault
            ? 'A local vault already exists on this device. Redirecting to unlock…'
            : 'Looking for an existing local vault on this device…'}
        </Text>
      </View>
    );
  }

  // Native: biometric capability gate. We do NOT offer enrolment until the
  // device has the hardware AND at least one biometric is enrolled. This is
  // the hard rule per INVARIANT I8.1 — stingray refuses to create vaults
  // that the user could not bind to biometric unlock.
  if (Platform.OS !== 'web' && bioReady === null) {
    return (
      <View style={s.container}>
        <Text style={s.title}>Checking biometric…</Text>
        <ActivityIndicator color="#23c483" />
      </View>
    );
  }
  if (Platform.OS !== 'web' && bioReady === false) {
    const reason = !bioCap?.hasHardware
      ? 'This device has no biometric sensor. Stingray requires biometric '
        + 'unlock to operate. Use a phone with fingerprint or face recognition.'
      : 'No biometric is set up on this device. Open your phone settings, '
        + 'add a fingerprint or face, then re-open stingray.';
    return (
      <View style={s.container}>
        <Text style={s.title}>Biometric required</Text>
        <Text style={s.sub}>{reason}</Text>
        <Pressable
          style={s.btn}
          onPress={() => {
            setBioReady(null);
            void getBiometricCapability().then((c) => {
              setBioCap(c);
              setBioReady(c.hasHardware && c.isEnrolled);
            });
          }}
        >
          <Text style={s.btnText}>Re-check</Text>
        </Pressable>
      </View>
    );
  }

  const onSubmit = async () => {
    if (busy || loading || submittingRef.current) return;
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
    submittingRef.current = true;
    setBusy(true);
    try {
      // Re-check at submit time. The capability could have changed between
      // the screen mount and the tap (rare but possible — settings open in
      // background, biometric removed). On web this is a no-op.
      if (Platform.OS !== 'web') {
        try { await enforceBiometric(); }
        catch (e) {
          Alert.alert('Biometric required', e instanceof Error ? e.message : 'Biometric not available.');
          return;
        }
      }
      const { error } = await enroll(pass, a);
      if (error) Alert.alert('Enroll failed', error);
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  };

  return (
    <View style={s.container}>
      <Text style={s.title}>New identity</Text>
      <Text style={s.sub}>
        Your keys are generated on this device. They are never sent to any server.
        If you lose the passphrase, no one — including us — can recover your account.
      </Text>
      {Platform.OS !== 'web' ? (
        <Text style={s.bioOk}>
          ✓ Biometric ready{bioCap?.strongLevel ? ' (strong)' : ''}. Your daily unlock will be a fingerprint or face.
        </Text>
      ) : null}

      <TextInput style={s.input} placeholder="Local alias (only you see this)" placeholderTextColor="#888" value={alias} onChangeText={setAlias} maxLength={30} />
      <TextInput style={s.input} placeholder={`Passphrase (≥${MIN_PASS} chars)`} placeholderTextColor="#888" secureTextEntry value={pass} onChangeText={setPass} />
      <TextInput style={s.input} placeholder="Confirm passphrase" placeholderTextColor="#888" secureTextEntry value={confirm} onChangeText={setConfirm} />

      <Pressable style={[s.btn, busy && s.btnDisabled]} onPress={onSubmit} disabled={busy}>
        {busy ? <ActivityIndicator color="black" /> : <Text style={s.btnText}>Create vault</Text>}
      </Pressable>
      {busy ? (
        <Text style={s.hint}>Creating keys and sealing the local vault… this can take a moment.</Text>
      ) : null}
      <Link href="/(auth)/unlock" style={s.link}>
        Already have a vault on this device? Unlock instead
      </Link>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0b0d', padding: 24, justifyContent: 'center', gap: 12 },
  title: { fontSize: 28, fontWeight: '600', color: 'white' },
  sub: { color: '#aaa', marginBottom: 8 },
  bioOk: { color: '#23c483', fontSize: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#333', borderRadius: 8, padding: 12, color: 'white', backgroundColor: '#16161a' },
  btn: { backgroundColor: '#23c483', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  btnDisabled: { opacity: 0.75 },
  btnText: { color: 'black', fontWeight: '700' },
  hint: { color: '#888', textAlign: 'center', fontSize: 12 },
  link: { marginTop: 16, textAlign: 'center', color: '#7a7a7a' },
});
