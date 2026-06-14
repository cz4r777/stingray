// React context wrapping the unlocked vault + transport gate.
// Mirrors date/lib/auth.tsx in shape so existing pipeline.md review checklists carry over.

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { AppState } from 'react-native';
import {
  vaultExists, unlockVault, createVault, panicWipe, UnlockedVault,
  biometricUnlockAvailable, unlockVaultBiometric,
} from './vault';
import { setRuntimeFaradayStrict, subscribeTransport } from './transport';
import { getBiometricCapability, type BiometricCapability } from './biometric';
import type { FaradayVerdict, Identity } from './types';

type IdentityCtx = {
  identity: Identity | null;
  unlocked: UnlockedVault | null;
  loading: boolean;
  hasVault: boolean;
  faraday: FaradayVerdict | null;
  strictMode: boolean;
  privacyShielded: boolean;
  // v0.1.5 — enforced biometric.
  // `biometricCapability` is the OS-reported hardware/enrolment state.
  // `biometricUnlockReady` is true iff there is a cached vault key on disk
  //   that the OS will release after a biometric prompt — i.e. the user
  //   has at least one previous passphrase unlock and the cache slot
  //   has not been wiped.
  biometricCapability: BiometricCapability | null;
  biometricUnlockReady: boolean;
  unlock: (passphrase: string) => Promise<{ error: string | null }>;
  unlockBiometric: () => Promise<{ error: string | null }>;
  enroll: (passphrase: string, alias: string) => Promise<{ error: string | null }>;
  lock: () => void;
  wipe: () => Promise<void>;
  armStrictMode: () => void;
  disarmStrictMode: () => void;
  revealSensitiveScreen: () => void;
  hideSensitiveScreen: () => void;
};

const Ctx = createContext<IdentityCtx | null>(null);

export function IdentityProvider({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState<UnlockedVault | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasVault, setHasVault] = useState(false);
  const [faraday, setFaraday] = useState<FaradayVerdict | null>(null);
  const [strictMode, setStrictMode] = useState(false);
  const [privacyShielded, setPrivacyShielded] = useState(false);
  const [biometricCapability, setBiometricCapability] = useState<BiometricCapability | null>(null);
  const [biometricUnlockReady, setBiometricUnlockReady] = useState(false);

  useEffect(() => {
    void vaultExists().then((b) => { setHasVault(b); setLoading(false); });
    void getBiometricCapability().then(setBiometricCapability);
    void biometricUnlockAvailable().then(setBiometricUnlockReady);
    return subscribeTransport(setFaraday);
  }, []);

  useEffect(() => {
    if (!strictMode) return;
    if (faraday?.allowed) return;
    setPrivacyShielded(true);
    setUnlocked(null);
  }, [strictMode, faraday]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (!strictMode) return;
      if (state === 'active') return;
      setPrivacyShielded(true);
      setUnlocked(null);
    });
    return () => sub.remove();
  }, [strictMode]);

  const unlock: IdentityCtx['unlock'] = async (pass) => {
    try {
      const v = await unlockVault(pass);
      if (!v) return { error: 'Wrong passphrase or no vault.' };
      setUnlocked(v); setHasVault(true);
      // Passphrase unlock refreshes the biometric cache inside unlockVault;
      // surface the new state to the UI.
      void biometricUnlockAvailable().then(setBiometricUnlockReady);
      return { error: null };
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : 'Unlock failed unexpectedly.' };
    }
  };

  // v0.1.5 — biometric-only unlock. Triggers the OS biometric prompt; on
  // success retrieves the cached vault key and decrypts the blob. On any
  // failure (cancel, hardware refusal, invalidated key), returns an error
  // string so the caller can fall through to the passphrase input.
  const unlockBiometric: IdentityCtx['unlockBiometric'] = async () => {
    try {
      const v = await unlockVaultBiometric();
      if (!v) return { error: 'Biometric unlock unavailable. Use your passphrase.' };
      setUnlocked(v); setHasVault(true);
      return { error: null };
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : 'Biometric unlock failed.' };
    }
  };

  const enroll: IdentityCtx['enroll'] = async (pass, alias) => {
    try {
      if (await vaultExists()) return { error: 'Vault already exists — unlock instead.' };
      void await createVault(pass, alias);
      // The vault is real on disk now even if auto-unlock fails.
      setHasVault(true);
      const v = await unlockVault(pass);
      if (!v) {
        return { error: 'Vault created, but automatic unlock failed. Use Unlock on this device.' };
      }
      setUnlocked(v);
      // Refresh biometric availability after enrol (createVault attempts the
      // cache write inline).
      void biometricUnlockAvailable().then(setBiometricUnlockReady);
      return { error: null };
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : 'Vault creation failed unexpectedly.' };
    }
  };

  const lock = () => setUnlocked(null);

  const wipe = async () => {
    await panicWipe();
    setUnlocked(null); setHasVault(false);
    setBiometricUnlockReady(false);
  };

  const armStrictMode = () => {
    setStrictMode(true);
    setPrivacyShielded(true);
    setRuntimeFaradayStrict(true);
  };

  const disarmStrictMode = () => {
    setStrictMode(false);
    setPrivacyShielded(false);
    setRuntimeFaradayStrict(false);
  };

  const revealSensitiveScreen = () => setPrivacyShielded(false);
  const hideSensitiveScreen = () => setPrivacyShielded(true);

  return (
    <Ctx.Provider value={{
      identity: unlocked?.identity ?? null,
      unlocked,
      loading,
      hasVault,
      faraday,
      strictMode,
      privacyShielded,
      biometricCapability,
      biometricUnlockReady,
      unlock, unlockBiometric, enroll, lock, wipe,
      armStrictMode,
      disarmStrictMode,
      revealSensitiveScreen,
      hideSensitiveScreen,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useIdentity() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useIdentity must be used inside <IdentityProvider>');
  return ctx;
}
