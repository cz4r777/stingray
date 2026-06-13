---
date: 2026-06-02
type: handover
role: Coder
event: return
ticket: T-002
issuer: Claude (Coder)
issued_to: Reviewer + Supervisor
sprint_state: T-001 review findings open (separate); T-002 ready-for-review; T-003..T-006 scoping
references:
  - ../tickets/T-002-persist-contacts.md
  - ../api_contracts.md  (on-device storage table updated)
  - ../invariants.md     (I9, I13 referenced; not modified)
  - ../roles.md
---

# Coder return-handover — T-002 (2026-06-02)

T-002 implementation reports back to Reviewer + Supervisor. State already
flipped to `coding`; on Reviewer approval Ops promotes to `staging`.

```
╔══════════════════════════════════════════════════════════════════════════════════════╗
║  CODER RETURN — T-002  Persist contacts (encrypted, vault-keyed) with SAS state      ║
║  Repo root  :  C:\Users\z\Desktop\code\stingray                                      ║
║  Branch     :  T-002-persist-contacts  (conceptual — repo not yet git-init'd)        ║
║  Coder      :  Claude                                                                ║
╠══════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                      ║
║  DESIGN SHAPE  (matches the plan in 2026-06-01 confirmation)                         ║
║                                                                                      ║
║    lib/local_store.ts  (NEW)                                                         ║
║      Generic encrypted KV API: get<T>/set<T>/del/has. Vault key passed               ║
║      explicitly per call — no module-level cache, no key in scope pre-unlock.        ║
║      Values JSON-encoded then secretbox-sealed. Backend: expo-secure-store           ║
║      on native, AsyncStorage on web (same shim pattern as vault.ts).                 ║
║      STORE_KEYS map exports the one and only key today: CONTACTS =                   ║
║      'stingray.contacts.v1'. Future tickets (T-005 conversations) add entries        ║
║      to that map — they do NOT introduce parallel storage paths.                     ║
║                                                                                      ║
║    lib/contacts.tsx  (NEW)                                                           ║
║      ContactsProvider context + useContacts() hook. Re-hydrates from the             ║
║      store on every `unlocked` change (unlock / lock / wipe / re-enroll).            ║
║      In-memory cache + write-through on every mutation. Public API:                  ║
║        contacts (Record<pubkey_hex, Contact>)                                        ║
║        loading                                                                       ║
║        addContact({ pubkey_hex, sign_pubkey_hex, alias })                            ║
║        updateSasState(pubkey_hex, sas_state)                                         ║
║        removeContact(pubkey_hex)                                                     ║
║        getContact(pubkey_hex)                                                        ║
║      INVARIANT I9 anchor: addContact() ALWAYS defaults sas_state to                  ║
║      'unverified'; caller cannot bypass. Re-adding an existing contact               ║
║      preserves its sas_state so verified records don't silently regress.            ║
║                                                                                      ║
║    lib/contacts.tsx also exports aliasFor(contacts, pubkey_hex) — the                ║
║      Conversations screen's alias lookup with pubkey-prefix fallback for             ║
║      unknown peers.                                                                  ║
║                                                                                      ║
║    lib/vault.ts  (EDITED)                                                            ║
║      UnlockedVault gains vault_key: Uint8Array. Same memory lifetime as              ║
║      box_sk/sign_sk — cleared by lock() and by strict-mode auto-lock in              ║
║      identity.tsx. Both unlock paths (.v2 read + .v1 migration) thread the           ║
║      derived key into the returned UnlockedVault.                                    ║
║      panicWipe() gains  await localStoreDel(STORE_KEYS.CONTACTS)  call,              ║
║      preserving INVARIANT I10. New comment marker for T-005 reviewer:                ║
║      "Adding a new STORE_KEYS entry MUST add a deleteItem call here."                ║
║                                                                                      ║
║    app/_layout.tsx  (EDITED)                                                         ║
║      <ContactsProvider> wraps <Gate /> inside <IdentityProvider>. Provider           ║
║      stack order: GestureHandlerRootView → IdentityProvider → ContactsProvider.      ║
║                                                                                      ║
║    app/(tabs)/contacts.tsx  (REWRITTEN)                                              ║
║      Stub Alert replaced with real addContact() + saved-contacts FlatList.           ║
║      Input validation: 64 lowercase hex chars; refuses self-pubkey; refuses          ║
║      empty/over-length aliases. SAS code rendered live while typing.                 ║
║      Status badge per contact: yellow (unverified), green (verified), red            ║
║      (mismatched). Remove action with confirm dialog. SAS verification UX            ║
║      polish (explicit "I verified" step, immovable mismatched state) is              ║
║      DEFERRED to T-003 per the ticket's out-of-scope list.                           ║
║                                                                                      ║
║    app/(tabs)/conversations.tsx  (EDITED)                                            ║
║      Imports useContacts + aliasFor. rollup() now takes contacts and uses            ║
║      aliasFor() for the per-peer display name. Pubkey-prefix fallback                ║
║      preserved for unknown peers.                                                    ║
║                                                                                      ║
║    docs/api_contracts.md  (EDITED)                                                   ║
║      On-device storage table gains the stingray.contacts.v1 row. Existing            ║
║      .v1 / .v2 vault key entries updated to reflect T-001 reality (v1 is             ║
║      legacy / read-only, v2 is current write path).                                  ║
║                                                                                      ║
║    lib/__tests__/local_store.test.ts  (NEW)                                          ║
║      Import-time self-test suite (matches crypto.test.ts pattern). Round-            ║
║      trip / wrong-key-returns-null / tampered-blob-returns-null / missing-           ║
║      key-returns-null / del-clears-blob. Gated behind                                ║
║      STINGRAY_RUN_LOCAL_STORE_TESTS=1 because it touches real secure-store           ║
║      slots — the test backs up + restores any pre-existing value so a dev            ║
║      with a live vault is never clobbered.                                           ║
║                                                                                      ║
║  ACCEPTANCE CRITERIA STATUS  (T-002 ticket §Acceptance)                              ║
║    [code]    Adding a contact persists across app restart                            ║
║              ContactsProvider reads from local_store on unlock; mutations            ║
║              write-through. NEEDS DEVICE RUN to confirm end-to-end.                  ║
║    [code]    Conversations renders alias when present, pubkey prefix when not        ║
║              aliasFor(contacts, peer) does this. NEEDS DEVICE RUN.                   ║
║    [code]    All writes go through local_store, secretbox-encrypted, no              ║
║              plaintext contacts.json on disk                                         ║
║              lib/contacts.tsx ONLY calls localStore.set/get/del. No                  ║
║              alternate path. Reviewer grep target:                                   ║
║                grep -r 'contacts\\.json\\|AsyncStorage.setItem.*contact' app lib      ║
║              should return nothing.                                                  ║
║    [code]    No alias / contact field reaches lib/relay.ts                           ║
║              lib/relay.ts is unchanged. lib/contacts.tsx does not import             ║
║              from lib/relay.ts. Reviewer grep target:                                ║
║                grep -r 'contacts\\|alias' lib/relay.ts lib/envelope.ts                ║
║              should show no contact-field crossings (envelope.ts imports             ║
║              types but does not read alias / sas_state / added_at).                  ║
║    [code]    Panic wipe clears contacts                                              ║
║              panicWipe() appended with localStoreDel(STORE_KEYS.CONTACTS).           ║
║    [~]       typecheck passes                                                        ║
║              NOT run from this environment (no `npm install` — metered-data          ║
║              rule). Code is syntactically clean TS. Reviewer or Ops must             ║
║              confirm after install.                                                  ║
║                                                                                      ║
║  INVARIANT IMPACT                                                                    ║
║    I9   relied on (not weakened). addContact() defaults to unverified;               ║
║         updateSasState() preserves existing-when-same-value semantics.               ║
║         T-003 will add the "mismatched is immovable" UI rule; T-002 does             ║
║         not enforce it at the data layer (kept narrow per ticket scope).             ║
║    I13  relied on (not weakened). No alias / contact field crosses to                ║
║         lib/relay.ts. ContactsProvider holds state only after unlock.                ║
║    I7   relied on (not weakened). box_sk / sign_sk paths unchanged.                  ║
║         vault_key added to UnlockedVault keeps the same memory lifetime              ║
║         as the existing secret material.                                             ║
║    I10  relied on (not weakened). panicWipe() now clears contacts alongside          ║
║         vault. New review marker for T-005: every STORE_KEYS entry needs             ║
║         a deleteItem call in panicWipe().                                            ║
║    I1   untouched. No new network paths.                                             ║
║    I14  untouched. No service_role references in any new code.                       ║
║                                                                                      ║
║    No invariant added, weakened, or removed. No threat-model section                 ║
║    narrowed. No forbidden_patterns.md §A entries added (feature work,                ║
║    not an incident).                                                                 ║
║                                                                                      ║
║  REVIEWER CHECKLIST PRE-FLIGHT  (pipeline.md §Stage 4)                              ║
║    a. Diff size — 1 new lib file + 1 new lib provider + 1 vault edit +              ║
║       1 layout edit + 1 screen rewrite + 1 screen edit + 1 doc edit +               ║
║       1 new test file = 8 files, moderate.                                           ║
║    b. service_role refs — none. grep clean.                                         ║
║    c. envelopes schema columns — unchanged. Not touched.                            ║
║    d. fetch() / supabase.from() outside lib/relay.ts — none added.                  ║
║    e. Cached ephemeral keypair / plaintext private key — none. vault_key            ║
║       on UnlockedVault is the SAME memory-lifetime as box_sk, persisted             ║
║       nowhere.                                                                       ║
║    f. console.log near crypto — none. The test file has console.log/error           ║
║       for PASS/FAIL surface and console.warn for the SKIPPED message; none          ║
║       carry secret material.                                                         ║
║    g. telemetry / crash SDK — none introduced.                                      ║
║    h. Android secure-shell overclaim — n/a.                                         ║
║    i. Threat-model implication — NARROWS §5 (forensic): contacts now sit            ║
║       under the same vault-key seal as the identity keys. Same posture for          ║
║       §3 (hostile relay): nothing on this ticket touches the relay.                  ║
║    j. Docs updated — api_contracts.md on-device storage table extended in           ║
║       same logical commit. invariants.md NOT modified (no invariant change          ║
║       needed; T-002 only relies on existing I9 / I13 / I7 / I10).                   ║
║    k. Test coverage — round-trip / wrong-key / tampered-blob / missing-key /        ║
║       del-clears. Test gated behind STINGRAY_RUN_LOCAL_STORE_TESTS=1 to             ║
║       avoid clobbering dev vaults.                                                   ║
║                                                                                      ║
║  WHAT COULD NOT BE VERIFIED FROM THIS ENVIRONMENT                                    ║
║    1. `npm install` and `npm run typecheck` NOT run (metered-data rule —            ║
║       per session memory user has metered data). Reviewer or Ops must run           ║
║       both after pulling. If typecheck fails, the most likely culprit is            ║
║       an interaction between Identity.vault_version (added in T-001) and             ║
║       the new vault_key field — both land in the same UnlockedVault.                ║
║    2. Acceptance criteria 1 + 2 + 5 (persistence across restart,                    ║
║       Conversations alias rendering, panic-wipe clears contacts) all need a         ║
║       running app on a device. Concrete Ops smoke test:                              ║
║         a. Enroll a fresh vault.                                                     ║
║         b. Add a contact with a known peer pubkey.                                  ║
║         c. Kill app. Reopen. Unlock. Confirm contact is still in the list.          ║
║         d. Open a chat to that peer (or simulate inbound from them).                ║
║         e. Confirm Conversations shows the alias, not the pubkey prefix.            ║
║         f. Panic-wipe. Re-enroll. Confirm contacts list is empty.                   ║
║    3. Cross-platform parity (Android + iOS) — same Ops smoke test on both.          ║
║                                                                                      ║
║  T-001 FOLLOW-UPS NOT ADDRESSED HERE                                                 ║
║    T-001 review findings are outstanding per the handover. T-002 did not            ║
║    touch lib/crypto.ts, ARGON2ID params, or the .v1→.v2 migration path,             ║
║    only added vault_key passthrough in UnlockedVault. Those follow-ups              ║
║    remain on T-001's plate.                                                          ║
║                                                                                      ║
║  HANDOVER ASKS                                                                       ║
║    Reviewer:                                                                         ║
║      - Walk pipeline.md §Stage 4 a-k against the 8 changed files.                    ║
║      - Run the two grep targets in §ACCEPTANCE CRITERIA STATUS and confirm           ║
║        the negative results.                                                         ║
║      - Either approve (flip ticket to `staging`) or send back to `coding`            ║
║        with comments.                                                                ║
║    Ops:                                                                              ║
║      - After Reviewer approves, run the 6-step smoke test above on iOS              ║
║        and Android preview builds.                                                   ║
║      - Confirm secure-store inspector shows stingray.contacts.v1 as                  ║
║        opaque base64, never plaintext JSON.                                          ║
║    Supervisor:                                                                       ║
║      - No ratification needed — no invariant/threat-model touch and no              ║
║        new Supervisor-only doc edit. Just close `prod → done` after 24h              ║
║        clean monitoring.                                                             ║
║                                                                                      ║
╚══════════════════════════════════════════════════════════════════════════════════════╝
```

## Receiving party response

*(Reviewer: walk pipeline.md §Stage 4 checklist. Flip to `review` then either
`staging` (approve) or `coding` (revisions needed). Ops: run smoke test on
real device. Supervisor: close after 24h monitoring window.)*
