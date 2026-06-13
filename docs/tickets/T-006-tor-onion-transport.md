---
id: T-006
title: Optional Tor / onion-routed transport (high-threat mode)
phase: 8
state: scoping
owner_supervisor: cz4r777
owner_coder: unassigned
created: 2026-05-20
updated: 2026-05-20
invariants_touched: [I1, I2, I3]
threat_model_section: §3 (hostile relay), §4 (hostile network observer)
---

# T-006 — Optional Tor / onion-routed transport

## Why

[threat_model.md §4](../threat_model.md) names IP-address correlation at the relay as an
acknowledged residual risk: the relay operator (or any observer of the relay's network
path) sees client IPs even though they cannot decrypt envelope contents. For users facing
a more capable adversary than the cellular-tower MITM stingray was originally built
against, that residual leak is meaningful.

Two existing projects have solved adjacent versions of this problem and their solutions
sit in our [Design references](../asc11_handover.md#design-references):

- **[adamant-im/](../../adamant-im/)** ships a `vite --mode tor` build that produces a
  PWA variant designed to be served from a `.onion` and route all traffic through Tor.
- **[session-android/libsession/](../../session-android/libsession/)** implements a
  full 3-hop onion-routing layer (the Oxen Service Node network) on top of NaCl primitives.

This ticket is a Phase-8 spike that adopts the adamant-im pattern as our v1: a build-mode
toggle that routes all relay traffic over Tor SOCKS, with the Faraday gate extended to
classify Tor as an allowed transport.

## Scope (what's in)

- Add an `EXPO_PUBLIC_TOR_MODE` env var. When `true`, the app:
  - Refuses to start unless a Tor SOCKS endpoint is reachable on a configurable host:port
    (default `127.0.0.1:9050`).
  - Routes ALL relay HTTPS + WSS traffic through that SOCKS endpoint.
  - Tightens the Faraday gate: `cellular` is refused as today, AND `wifi`/`ethernet` are
    only allowed if the SOCKS endpoint is reachable on that interface.
- Extend [`lib/transport.ts`](../../lib/transport.ts) `TransportState` to include a new
  `{ kind: 'tor'; sock: { host, port } }` variant and corresponding `evaluateFaraday`
  branch. Tor mode is always "allowed".
- Add a Settings toggle that reads/writes a relay-URL override (so users can point at a
  `.onion` relay address when in Tor mode).
- Document the deployment shape in [`docs/deployment.md`](../deployment.md): the relay
  must be reachable on its `.onion` for Tor-mode clients to drain envelopes.
- Add a threat-model entry to [`docs/threat_model.md`](../threat_model.md) §4 describing
  what an observer between client and Tor entry node still sees, and what changes for
  observers between Tor exit and relay.
- Document that Tor-over-cellular is **still refused** ([INVARIANT I1](../invariants.md)):
  Tor encrypts content but the cellular radio still leaks physical-layer presence to a
  stingray.

## Out of scope (what's NOT in)

- Embedding a Tor client in the app itself. v1 expects the user to run Tor on their
  device (Orbot on Android, Tor.app on macOS, system Tor service on Linux). A bundled
  Tor (via `react-native-tor` or similar) is a follow-up ticket if user demand justifies
  the binary-size cost.
- Replacing the relay with a Session-style decentralised mailbox network. That is its
  own multi-quarter effort and would deprecate large parts of the current architecture.
- Defending against Tor exit-node observation in cases where the relay is on the public
  Internet rather than as a `.onion`. The ticket's "right" deployment is `.onion → .onion`.
- "Hidden mode" UI obfuscation (steganography, app-icon disguise, decoy passphrases).
  Out of scope; separate Phase 8/9 design discussion.

## Files likely to change

- `lib/transport.ts` (extend `TransportState`, `evaluateFaraday`)
- `lib/relay.ts` (route fetch / realtime through SOCKS when Tor mode is on)
- `app/(tabs)/settings.tsx` (relay URL override + Tor-mode indicator)
- `app/_layout.tsx` (banner adjustment for Tor mode)
- `.env.example` (add `EXPO_PUBLIC_TOR_MODE`)
- `docs/api_contracts.md` (add `EXPO_PUBLIC_TOR_MODE` to env table)
- `docs/threat_model.md` (§4 update)
- `docs/invariants.md` (refine I1, I2 wording so "cellular + Tor" remains refused)
- `docs/deployment.md` (relay `.onion` deployment notes)

## Acceptance criteria

- [ ] With `EXPO_PUBLIC_TOR_MODE=true` and no Tor running: app refuses to start past the
      unlock screen, with a banner naming Tor as the unreachable dependency.
- [ ] With Tor running on `127.0.0.1:9050` and the relay reachable on its `.onion`: send
      + receive works end-to-end through Tor.
- [ ] Cellular + Tor: still refused. Faraday banner reads "cellular detected" regardless
      of Tor being available.
- [ ] Wi-Fi + Tor: allowed. Banner names Tor as the active transport.
- [ ] No code path in `lib/relay.ts` issues a plain network call that bypasses SOCKS when
      Tor mode is on. (Reviewer grep: any `fetch()` or `supabase.from(...)` without the
      Tor proxy applied is a block.)
- [ ] Switching off Tor mode in Settings and re-enrolling on the same device works
      cleanly — no leftover SOCKS config that breaks the non-Tor path.

## Risk / threat-model implication

**Narrows [§4](../threat_model.md)** — the relay operator and any observer between
clients no longer see correlatable IPs. The benefit is real but not free.

**Two new residual risks:**

1. **User error.** A user who toggles Tor mode off while a relay URL still points to a
   `.onion` will see a confusing failure rather than a fallback. The Settings UI must
   warn explicitly.
2. **Tor-availability fingerprinting.** An adversary observing the device's local
   network can see Tor connect to its first-hop relay. This is not a leak of stingray
   traffic content, but it is a leak that the user is *using* Tor. Acceptable in our
   threat model; documented.

This ticket DOES NOT widen [INVARIANT I1](../invariants.md): cellular is still refused
even with Tor available. Tor encrypts the application layer; the cellular radio still
emits the same physical-layer signature a stingray uses for proximity detection.

## Handover checklist

### `scoping → ready` (Supervisor)
- [ ] Decision on bundled-Tor vs system-Tor for v1 (default: system-Tor)
- [ ] Decision on whether to ship a default `.onion` relay or require the user to provide one
- [ ] [adamant-im](../../adamant-im/) `vite-pwa.config.ts` Tor-mode and [session-android/libsession/](../../session-android/libsession/) onion-routing layer reviewed; design notes captured in the threat-model update
- [ ] Schema unchanged — no relay schema sign-off needed

### `ready → coding` (Coder)
- [ ] Ticket re-read cold
- [ ] [INVARIANT I1](../invariants.md), [I2](../invariants.md), [I3](../invariants.md) re-read
- [ ] [threat_model.md §4](../threat_model.md) read in full
- [ ] [adamant-im/vite-pwa.config.ts](../../adamant-im/vite-pwa.config.ts) (Tor mode branch) skimmed
- [ ] Branch `T-006-tor-onion-transport` created

### `coding → review` (Coder)
- [ ] `npm run typecheck` passes
- [ ] Manual test: with Tor running and relay on `.onion`, send + receive works
- [ ] Manual test: without Tor running, app refuses to start with explicit message
- [ ] Manual test: cellular + Tor → still refused
- [ ] Network log shows no traffic to the clearnet relay when Tor mode is on
- [ ] Docs updated in the same commit (threat_model.md §4, api_contracts.md env table,
      deployment.md `.onion` notes)
- [ ] PR description names T-006 and links the two design references it draws from

### `review → staging` (Reviewer)
- [ ] No bypass path in `lib/relay.ts` — every network call goes through the SOCKS-aware
      client when Tor mode is on
- [ ] No leak of the relay URL to a clearnet DNS resolver before the SOCKS connection
      is established (DNS-over-SOCKS, not system DNS)
- [ ] Faraday gate logic preserved: cellular + Tor = still refused

### `staging → prod` (Ops)
- [ ] Stand up a `.onion` relay on the staging Supabase project (Tor hidden service on
      top of the Postgres-realtime endpoint, or a thin proxy)
- [ ] Two-device test over Tor: send + receive + ack-delete works
- [ ] Cellular toggle test: enable cellular only, confirm refusal banner

### `prod → done` (Supervisor)
- [ ] 24h clean monitoring window
- [ ] Threat-model update reviewed and accepted

## Notes

The ambitious follow-up to this ticket is a **Session-style decentralised mailbox**:
multiple relay nodes, swarm membership per recipient pubkey, message replication across
nodes. That is a multi-quarter rework and is intentionally NOT in this ticket. T-006
buys the privacy benefit of onion routing without the architectural rewrite.

If T-006 ships well and user demand is real, a follow-up "T-NNN — Bundled Tor client"
ticket can add `react-native-tor` (or equivalent) so the app does not depend on Orbot
or a system Tor service. The cost is binary size + native build complexity.
