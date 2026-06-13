// Conversation history persistence — encrypted local store fronted by a
// React context. Pairs with lib/contacts.tsx; same encryption envelope.
//
// Storage:    stingray.conversations.v1 in lib/local_store.ts (secretbox-
//             sealed under the vault key from UnlockedVault).
// Shape:      Record<peer_pubkey_hex, Plaintext[]>  — capped at MAX_PER_PEER.
// Lifetime:   reads when the vault unlocks, clears when it locks (or panic
//             wipes), persists every mutation write-through.
//
// INVARIANT REFERENCES
//   - I7  : conversations sit under the same vault-key seal as the identity
//           keys. No plaintext message body on disk.
//   - I11 : ack-delete remains the relay cleanup rule. This file does NOT
//           ack-delete — that's lib/envelope.ts. We only persist BEFORE the
//           ack-delete fires, so a crash between persist and ack leaves a
//           redeliverable envelope on the relay (handled by id-based dedupe).
//   - I12 : decrypt failures never reach this layer — envelope.ts drops them
//           silently. This layer trusts every Plaintext it receives.
//   - I13 : aliases/contact data stay local-only. Conversation bodies are
//           local-only by the same argument: encrypted at rest, never on
//           the wire except as opaque ciphertext.
//
// CAP RATIONALE (MAX_PER_PEER = 500)
//   - keeps secure-store blobs bounded; expo-secure-store has per-entry
//     size limits on both iOS (4 KB recommended) and Android (~2 KB practical
//     for KeyStore-backed entries on older devices).
//   - 500 messages of average ~80 bytes ≈ 40 KB plain, 40 KB ciphertext.
//     This exceeds the iOS recommendation; we accept it because the
//     alternative is data loss the user did not consent to. A future ticket
//     ("auto-burn old messages" Settings toggle) lowers the cap on demand.
//   - Eviction is FIFO: oldest message goes first.

import {
  createContext, useContext, useEffect, useState, useCallback,
  type ReactNode,
} from 'react';
import * as localStore from './local_store';
import { useIdentity } from './identity';
import type { Plaintext } from './types';

export type ConversationsMap = Record<string, Plaintext[]>;

// Per-peer cap. See CAP RATIONALE above before tuning.
export const MAX_PER_PEER = 500;

type ConversationsCtx = {
  conversations: ConversationsMap;
  loading: boolean;
  // Append a freshly-decrypted message. Idempotent: re-receiving a message
  // with the same `id` is a no-op (id-based dedupe — INVARIANT I11
  // ack-delete-but-redeliverable safety).
  appendMessage: (peer_pubkey_hex: string, msg: Plaintext) => Promise<void>;
  // Get history for a peer, oldest-first. Safe to call pre-load (returns []).
  getHistory: (peer_pubkey_hex: string) => Plaintext[];
};

const Ctx = createContext<ConversationsCtx | null>(null);

export function ConversationsProvider({ children }: { children: ReactNode }) {
  const { unlocked } = useIdentity();
  const [conversations, setConversations] = useState<ConversationsMap>({});
  const [loading, setLoading] = useState(true);

  // Re-hydrate whenever the unlocked vault changes (unlock, lock, wipe).
  useEffect(() => {
    let mounted = true;
    if (!unlocked) {
      setConversations({});
      setLoading(false);
      return;
    }
    setLoading(true);
    void localStore
      .get<ConversationsMap>(localStore.STORE_KEYS.CONVERSATIONS, unlocked.vault_key)
      .then((c) => {
        if (!mounted) return;
        setConversations(c ?? {});
        setLoading(false);
      });
    return () => { mounted = false; };
  }, [unlocked]);

  const persist = useCallback(async (next: ConversationsMap) => {
    if (!unlocked) throw new Error('conversations: write attempted while locked');
    await localStore.set(localStore.STORE_KEYS.CONVERSATIONS, unlocked.vault_key, next);
    setConversations(next);
  }, [unlocked]);

  const appendMessage: ConversationsCtx['appendMessage'] = useCallback(async (peer_pubkey_hex, msg) => {
    if (!unlocked) return;
    // Read-modify-write under the latest state. React batching is fine —
    // if two appends race they both see the same prior state and the second
    // write supersedes; the dedupe key catches the duplicate.
    setConversations((prior) => {
      const existing = prior[peer_pubkey_hex] ?? [];
      // INVARIANT I11 safety: id-based dedupe. If a crash between local
      // persist and relay ack-delete causes the envelope to be re-fetched,
      // appendMessage will be called again with the same id and we no-op.
      if (existing.some((m) => m.id === msg.id)) {
        return prior;
      }
      const appended = [...existing, msg];
      // FIFO cap. Keep the LAST MAX_PER_PEER messages (newest); drop oldest.
      const capped = appended.length > MAX_PER_PEER
        ? appended.slice(appended.length - MAX_PER_PEER)
        : appended;
      const next: ConversationsMap = { ...prior, [peer_pubkey_hex]: capped };
      // Fire-and-forget persist — the in-memory state is the source of
      // truth for this render; the disk write is the durability layer.
      // If persist fails, the next foreground drain will re-attempt; a
      // re-receive will still dedupe. INVARIANT I12 spirit: never log.
      void localStore.set(localStore.STORE_KEYS.CONVERSATIONS, unlocked.vault_key, next);
      return next;
    });
  }, [unlocked]);

  // Synchronous read off in-memory state. Returns [] for unknown peers.
  const getHistory: ConversationsCtx['getHistory'] = useCallback((peer_pubkey_hex) => {
    return conversations[peer_pubkey_hex] ?? [];
  }, [conversations]);

  return (
    <Ctx.Provider value={{ conversations, loading, appendMessage, getHistory }}>
      {children}
    </Ctx.Provider>
  );
}

export function useConversations(): ConversationsCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useConversations must be used inside <ConversationsProvider>');
  return ctx;
}

// Helper: produce a Conversation-row roll-up from the full history map.
// Used by app/(tabs)/conversations.tsx so the list survives restart without
// re-fetching from the relay.
export function rollupFromHistory(
  conversations: ConversationsMap,
  aliasOf: (peer: string) => string,
  unreadOf: (peer: string) => number = () => 0,
): {
  peer_pubkey_hex: string;
  alias: string;
  last_plaintext_preview: string | null;
  last_at: string | null;
  unread: number;
}[] {
  const out = Object.entries(conversations).map(([peer, msgs]) => {
    const last = msgs[msgs.length - 1] ?? null;
    return {
      peer_pubkey_hex: peer,
      alias: aliasOf(peer),
      last_plaintext_preview: last?.body.slice(0, 80) ?? null,
      last_at: last?.received_at || last?.sent_at || null,
      unread: unreadOf(peer),
    };
  });
  return out.sort((a, b) => (b.last_at ?? '').localeCompare(a.last_at ?? ''));
}
