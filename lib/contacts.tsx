// Contacts persistence — encrypted local store fronted by a React context.
//
// Storage:    stingray.contacts.v1 in lib/local_store.ts (secretbox-sealed
//             under the vault key from UnlockedVault).
// Shape:      Record<pubkey_hex, Contact>.
// Lifetime:   reads when the vault unlocks, clears when it locks (or panic
//             wipes), persists every mutation write-through.
//
// INVARIANT REFERENCES
//   - I9  : new contacts default to sas_state='unverified'. UI (T-003) gates
//           the transition to 'verified' on an explicit user confirmation;
//           this layer just persists whatever state the UI hands us.
//   - I13 : aliases and contact metadata are local-only. NOTHING from this
//           module is ever passed to lib/relay.ts or any network surface.
//   - I7  : the contacts blob is sealed under the vault key, which lives in
//           memory only between unlock and lock.
//
// OUT OF SCOPE (T-002):
//   - SAS verification UX (T-003): no "mismatched-is-immovable" rule here;
//     T-003 wires that at the UI layer.
//   - Conversation persistence (T-005): a separate STORE_KEYS entry.

import {
  createContext, useContext, useEffect, useState, useCallback,
  type ReactNode,
} from 'react';
import * as localStore from './local_store';
import { useIdentity } from './identity';
import type { Contact } from './types';

export type ContactsMap = Record<string, Contact>;

export type ContactInput = {
  pubkey_hex: string;
  sign_pubkey_hex: string;
  alias: string;
};

type ContactsCtx = {
  contacts: ContactsMap;
  loading: boolean;
  // Adds a contact at sas_state='unverified'. INVARIANT I9: callers do NOT
  // get to pass a starting sas_state — they must mark verified explicitly
  // through markVerified after an out-of-band SAS comparison.
  addContact: (c: ContactInput) => Promise<void>;
  // T-003: explicit verification step. Promotes unverified→verified. Refuses
  // to overwrite a mismatched record — mismatched is immovable (data layer
  // guard, not just UX) per the T-003 acceptance criterion "mismatched
  // contacts are immovable from that state — re-adding requires deletion".
  markVerified: (pubkey_hex: string) => Promise<void>;
  // T-003: explicit mismatch action. Once mismatched, the only path back is
  // removeContact + re-add. Calling markVerified or markMismatched on a
  // mismatched record is a no-op; only removeContact transitions out.
  markMismatched: (pubkey_hex: string) => Promise<void>;
  // Lower-level setter retained for migration / programmatic flows. The UI
  // should use markVerified / markMismatched. INVARIANT I9: this still
  // refuses to overwrite a mismatched record.
  updateSasState: (pubkey_hex: string, sas_state: Contact['sas_state']) => Promise<void>;
  removeContact: (pubkey_hex: string) => Promise<void>;
  getContact: (pubkey_hex: string) => Contact | undefined;
};

const Ctx = createContext<ContactsCtx | null>(null);

export function ContactsProvider({ children }: { children: ReactNode }) {
  const { unlocked } = useIdentity();
  const [contacts, setContacts] = useState<ContactsMap>({});
  const [loading, setLoading] = useState(true);

  // Re-hydrate whenever the unlocked vault changes (unlock, lock, wipe,
  // re-enroll). Locking drops the vault_key → store reads return null →
  // in-memory state resets to {}.
  useEffect(() => {
    let mounted = true;
    if (!unlocked) {
      setContacts({});
      setLoading(false);
      return;
    }
    setLoading(true);
    void localStore
      .get<ContactsMap>(localStore.STORE_KEYS.CONTACTS, unlocked.vault_key)
      .then((c) => {
        if (!mounted) return;
        setContacts(c ?? {});
        setLoading(false);
      });
    return () => { mounted = false; };
  }, [unlocked]);

  const persist = useCallback(async (next: ContactsMap) => {
    if (!unlocked) throw new Error('contacts: write attempted while locked');
    await localStore.set(localStore.STORE_KEYS.CONTACTS, unlocked.vault_key, next);
    setContacts(next);
  }, [unlocked]);

  const addContact: ContactsCtx['addContact'] = useCallback(async (c) => {
    if (c.pubkey_hex.length !== 64) {
      throw new Error('contacts: pubkey_hex must be 64 hex chars');
    }
    // INVARIANT I9: defaults to unverified; never honour a caller-supplied
    // sas_state on creation. If a contact already exists, preserve its
    // sas_state (so re-adding doesn't silently regress a 'verified' record).
    const existing = contacts[c.pubkey_hex];
    const next: ContactsMap = {
      ...contacts,
      [c.pubkey_hex]: {
        pubkey_hex: c.pubkey_hex,
        sign_pubkey_hex: c.sign_pubkey_hex,
        alias: c.alias,
        sas_state: existing?.sas_state ?? 'unverified',
        added_at: existing?.added_at ?? new Date().toISOString(),
      },
    };
    await persist(next);
  }, [contacts, persist]);

  const updateSasState: ContactsCtx['updateSasState'] = useCallback(async (pubkey_hex, sas_state) => {
    const existing = contacts[pubkey_hex];
    if (!existing) return;
    if (existing.sas_state === sas_state) return;
    // INVARIANT I9 + T-003 acceptance: mismatched is immovable at the data
    // layer. The only path out is removeContact + re-add. This guard is
    // intentionally redundant with the UI — defense in depth means a future
    // programmatic caller cannot bypass the sticky rule.
    if (existing.sas_state === 'mismatched') return;
    const next: ContactsMap = {
      ...contacts,
      [pubkey_hex]: { ...existing, sas_state },
    };
    await persist(next);
  }, [contacts, persist]);

  const markVerified: ContactsCtx['markVerified'] = useCallback(async (pubkey_hex) => {
    // Thin wrapper that names the intent at the call site. The UI must only
    // reach this from inside the "I verified the same 7 digits" confirm
    // modal — never from a default-save path. INVARIANT I9.
    await updateSasState(pubkey_hex, 'verified');
  }, [updateSasState]);

  const markMismatched: ContactsCtx['markMismatched'] = useCallback(async (pubkey_hex) => {
    // Mismatched is permanent until delete. Skip the updateSasState guard so
    // we can transition INTO mismatched from any prior state (including
    // 'verified' if the user discovers the SAS didn't actually match).
    const existing = contacts[pubkey_hex];
    if (!existing) return;
    if (existing.sas_state === 'mismatched') return;
    const next: ContactsMap = {
      ...contacts,
      [pubkey_hex]: { ...existing, sas_state: 'mismatched' },
    };
    await persist(next);
  }, [contacts, persist]);

  const removeContact: ContactsCtx['removeContact'] = useCallback(async (pubkey_hex) => {
    if (!contacts[pubkey_hex]) return;
    const next: ContactsMap = { ...contacts };
    delete next[pubkey_hex];
    await persist(next);
  }, [contacts, persist]);

  const getContact = useCallback(
    (pubkey_hex: string) => contacts[pubkey_hex],
    [contacts],
  );

  return (
    <Ctx.Provider value={{
      contacts, loading,
      addContact, markVerified, markMismatched, updateSasState,
      removeContact, getContact,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useContacts(): ContactsCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useContacts must be used inside <ContactsProvider>');
  return ctx;
}

// Convenience: alias lookup with pubkey-prefix fallback. The fallback exists
// because Conversations may show peers we haven't added as contacts yet (e.g.
// inbound mail from a stranger). Pubkey prefix is short and recognisable; we
// deliberately do NOT pretend they have an alias when they don't.
export function aliasFor(contacts: ContactsMap, pubkey_hex: string): string {
  return contacts[pubkey_hex]?.alias ?? pubkey_hex.slice(0, 8);
}

// T-003: trust-state lookup. An unknown peer (no contact record) is treated
// as 'unverified' for UI purposes — we have no SAS comparison on file, so
// the most we can claim is "key seen, identity unverified".
//
// INVARIANT I9 + forbidden_patterns.md B5.2: callers MUST NOT display a
// verified badge unless this returns 'verified'. There is no third option
// to short-circuit ("we have the pubkey, surely it's fine") — the function
// reads only sas_state.
export function sasFor(contacts: ContactsMap, pubkey_hex: string): Contact['sas_state'] {
  return contacts[pubkey_hex]?.sas_state ?? 'unverified';
}

// T-003: media-send gate. Returns null if the conversation may send media
// (verified contacts only); returns a refusal reason string otherwise.
//
// Media attachments don't exist in v0; this gate is added now so future
// attachments work inherits the refusal at every send site. forbidden_patterns
// B5.2 spirit: a verified-only path is the only safe default.
export function refuseMediaSend(contacts: ContactsMap, pubkey_hex: string): string | null {
  const state = sasFor(contacts, pubkey_hex);
  if (state === 'verified') return null;
  if (state === 'mismatched') {
    return 'Contact is marked mismatched. Remove and re-add after verifying the SAS code with the peer.';
  }
  return 'Contact is unverified. Compare the 7-digit SAS code with the peer first.';
}
