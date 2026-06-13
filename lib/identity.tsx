// React context wrapping the unlocked vault + transport gate.
// Mirrors date/lib/auth.tsx in shape so existing pipeline.md review checklists carry over.

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { AppState } from 'react-native';
import { vaultExists, unlockVault, createVault, panicWipe, UnlockedVault } from './vault';
import { setRuntimeFaradayStrict, subscribeTransport } from './transport';
import type { FaradayVerdict, Identity } from './types';

type IdentityCtx = {
  identity: Identity | null;
  unlocked: UnlockedVault | null;
  loading: boolean;
  hasVault: boolean;
  faraday: FaradayVerdict | null;
  strictMode: boolean;
  privacyShielded: boolean;
  unlock: (passphrase: string) => Promise<{ error: string | null }>;
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

  useEffect(() => {
    void vaultExists().then((b) => { setHasVault(b); setLoading(false); });
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
      return { error: null };
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : 'Unlock failed unexpectedly.' };
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
      return { error: null };
    } catch (e: unknown) {
      return { error: e instanceof Error ? e.message : 'Vault creation failed unexpectedly.' };
    }
  };

  const lock = () => setUnlocked(null);

  const wipe = async () => {
    await panicWipe();
    setUnlocked(null); setHasVault(false);
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
      unlock, enroll, lock, wipe,
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
