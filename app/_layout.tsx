import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { IdentityProvider, useIdentity } from '@/lib/identity';
import { ContactsProvider } from '@/lib/contacts';
import { ConversationsProvider } from '@/lib/conversations';
import { StingrayAction } from '@/lib/stingray-action';

function FaradayBanner() {
  const { faraday } = useIdentity();
  if (!faraday || faraday.allowed) return null;
  return (
    <View style={{ backgroundColor: '#7a0000', padding: 8 }}>
      <Text style={{ color: 'white', fontWeight: '700', textAlign: 'center' }}>
        Faraday block — {faraday.reason}. Switch to Wi-Fi.
      </Text>
    </View>
  );
}

function PrivacyCurtain() {
  const {
    faraday,
    strictMode,
    privacyShielded,
    revealSensitiveScreen,
    disarmStrictMode,
    lock,
  } = useIdentity();

  if (!privacyShielded) return null;

  const canReveal = !!faraday?.allowed;

  return (
    <View style={s.curtain}>
      <Text style={s.curtainTitle}>Shield mode active</Text>
      <Text style={s.curtainBody}>
        Sensitive content is hidden behind a local curtain. This helps against casual
        remote viewing and app-switcher previews, but it cannot remove OS-level malware
        or a true remote-access trojan.
      </Text>
      <Text style={s.curtainStatus}>
        {faraday
          ? faraday.allowed
            ? 'Safe transport detected. You can reveal locally.'
            : `Transport blocked: ${faraday.reason}`
          : 'Checking transport…'}
      </Text>
      <Pressable
        style={[s.curtainButton, !canReveal && s.curtainButtonDisabled]}
        disabled={!canReveal}
        onPress={revealSensitiveScreen}
      >
        <Text style={[s.curtainButtonText, !canReveal && s.curtainButtonTextDisabled]}>
          Reveal locally
        </Text>
      </Pressable>
      <Pressable style={s.curtainButton} onPress={lock}>
        <Text style={s.curtainButtonText}>Lock vault</Text>
      </Pressable>
      {strictMode ? (
        <Pressable style={s.curtainButton} onPress={disarmStrictMode}>
          <Text style={s.curtainButtonText}>Disarm strict mode</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Gate() {
  const { unlocked, hasVault, loading } = useIdentity();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!unlocked && !inAuthGroup) {
      router.replace(hasVault ? '/(auth)/unlock' : '/(auth)/enroll');
    } else if (unlocked && inAuthGroup) {
      router.replace('/(tabs)/conversations');
    }
  }, [unlocked, hasVault, loading, segments]);

  return (
    <>
      <FaradayBanner />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="chat/[peer]"
          options={{ headerShown: true, title: 'Chat', headerRight: () => <StingrayAction /> }}
        />
      </Stack>
      <PrivacyCurtain />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <IdentityProvider>
        <ContactsProvider>
          <ConversationsProvider>
            <Gate />
            <StatusBar style="light" />
          </ConversationsProvider>
        </ContactsProvider>
      </IdentityProvider>
    </GestureHandlerRootView>
  );
}

const s = StyleSheet.create({
  curtain: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#030304',
    paddingHorizontal: 24,
    justifyContent: 'center',
    gap: 14,
    zIndex: 100,
  },
  curtainTitle: {
    color: 'white',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  },
  curtainBody: {
    color: '#b7b7bc',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  curtainStatus: {
    color: '#23c483',
    textAlign: 'center',
    fontWeight: '600',
  },
  curtainButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#16161a',
    alignItems: 'center',
  },
  curtainButtonDisabled: {
    backgroundColor: '#111214',
  },
  curtainButtonText: {
    color: 'white',
    fontWeight: '700',
  },
  curtainButtonTextDisabled: {
    color: '#666',
  },
});
