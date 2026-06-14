import { View, Text, Pressable, StyleSheet, Alert, ScrollView } from 'react-native';
import { useIdentity } from '@/lib/identity';

export default function Settings() {
  const {
    identity,
    faraday,
    strictMode,
    privacyShielded,
    hideSensitiveScreen,
    revealSensitiveScreen,
    disarmStrictMode,
    lock,
    wipe,
    biometricCapability,
    biometricUnlockReady,
  } = useIdentity();

  const bioLine = !biometricCapability
    ? '…'
    : !biometricCapability.hasHardware
      ? 'no biometric sensor on this device'
      : !biometricCapability.isEnrolled
        ? 'hardware present, no biometric enrolled'
        : `enrolled — ${biometricCapability.strongLevel ? 'strong' : 'weak'} level`;

  return (
    <ScrollView style={s.bg} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <View style={s.card}>
        <Text style={s.label}>Transport</Text>
        <Text style={s.value}>
          {faraday ? `${faraday.transport.kind} — ${faraday.allowed ? 'allowed' : faraday.reason}` : '…'}
        </Text>
        <Text style={s.help}>
          Stingray refuses to transmit on cellular. Switch the device to Wi-Fi
          (and ideally airplane mode + Wi-Fi) before sending anything sensitive.
        </Text>
      </View>

      <View style={s.card}>
        <Text style={s.label}>Shield mode</Text>
        <Text style={s.value}>{strictMode ? 'armed' : 'idle'}</Text>
        <Text style={s.value}>{privacyShielded ? 'privacy curtain up' : 'content visible'}</Text>
        <Text style={s.help}>
          Best-effort only. This hides content locally and locks down harder on unsafe transport,
          but it cannot remove malware or guaranteed remote OS-level access.
        </Text>
      </View>

      <View style={s.card}>
        <Text style={s.label}>Biometric</Text>
        <Text style={s.value}>{bioLine}</Text>
        <Text style={s.value}>
          {biometricUnlockReady ? 'biometric unlock armed' : 'biometric unlock not cached'}
        </Text>
        <Text style={s.help}>
          Enforced. Daily unlock is your fingerprint or face; the passphrase is the fallback
          and the cryptographic root. The cached key is bound to the OS hardware-backed
          KeyStore / Keychain — wiping the vault, re-enrolling biometric, or panic wipe
          invalidates it.
        </Text>
      </View>

      <View style={s.card}>
        <Text style={s.label}>Identity</Text>
        <Text style={s.value}>{identity?.local_alias ?? '—'}</Text>
        <Text style={s.value} numberOfLines={1}>{identity?.pubkey_hex ?? '—'}</Text>
      </View>

      <Pressable style={s.btn} onPress={privacyShielded ? revealSensitiveScreen : hideSensitiveScreen}>
        <Text style={s.btnText}>{privacyShielded ? 'Reveal content' : 'Raise privacy curtain'}</Text>
      </Pressable>

      {strictMode ? (
        <Pressable style={s.btn} onPress={disarmStrictMode}>
          <Text style={s.btnText}>Disarm strict mode</Text>
        </Pressable>
      ) : null}

      <Pressable style={s.btn} onPress={lock}>
        <Text style={s.btnText}>Lock vault</Text>
      </Pressable>

      <Pressable
        style={[s.btn, s.danger]}
        onPress={() => Alert.alert(
          'Panic wipe',
          'Deletes your local keys. Any unread inbox is decryptable only with these keys — wiping means losing access.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Wipe', style: 'destructive', onPress: () => void wipe() },
          ],
        )}
      >
        <Text style={[s.btnText, { color: '#aa3333' }]}>Panic wipe</Text>
      </Pressable>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  bg: { backgroundColor: '#0b0b0d', flex: 1 },
  card: { backgroundColor: '#16161a', borderRadius: 10, padding: 14, gap: 6 },
  label: { color: '#aaa', fontSize: 12 },
  value: { color: 'white', fontFamily: 'monospace' },
  help: { color: '#888', fontSize: 12 },
  btn: { padding: 14, borderRadius: 8, backgroundColor: '#222', alignItems: 'center' },
  btnText: { color: 'white', fontWeight: '600' },
  danger: { borderWidth: 1, borderColor: '#aa3333', backgroundColor: 'transparent' },
});
