---
id: T-004
title: Android secure-shell — screenshot block, app-switcher shielding, blind-compose pad
phase: 3
state: scoping
owner_supervisor: cz4r777
owner_coder: unassigned
created: 2026-05-17
updated: 2026-05-17
invariants_touched: [I7, I13]
threat_model_section: §5 (forensic / device-seizure attacker), §6 (compromised-device — honesty boundary)
---

# T-004 — Android secure-shell

## Why

[`framework.md`](../framework.md) Pillar 6 ("Display hardening is real, but not magic") and
[workflow.md Phase 3](../workflow.md) call for Android-specific display protections: blocking
ordinary screenshots, blanking app-switcher previews of sensitive routes, resisting overlay
clickjacking, and offering a blind-compose mode that does not route through the platform IME.

These are NOT a defense against a compromised device — that boundary is named explicitly in
[framework.md](../framework.md) and [threat_model.md §6](../threat_model.md). They ARE a defense
against ordinary shoulder-surfing, casual screen recording by another app, and the recents-screen
leak where a curious onlooker can see chat content in the app-switcher preview.

## Scope (what's in)

- Add `expo-screen-capture` (or platform-direct `FLAG_SECURE`) for sensitive routes:
  unlock, enroll, contacts (with peer pubkey visible), conversations, chat, settings (panic
  wipe button area).
- Add an `<SecureScreen>` wrapper component in `lib/secure_shell.tsx` that wraps a route and
  toggles `FLAG_SECURE` on mount/unmount. Avoids leaving the flag set globally.
- Configure the Android manifest (`app.json` plugin) to blank the app-switcher preview when
  any `SecureScreen` is on top. iOS gets a best-effort equivalent via `expo-screen-capture`'s
  iOS support (limited).
- Add an "immersive shell" toggle in Settings: when on, chat screens go fullscreen with
  status/nav bars hidden. Pure UX, NOT a trust boundary — labelled as such in-screen.
- Add **blind-compose mode** for the chat composer:
  - Custom in-app keyboard (numeric + small symbol set + dictation-disabled text pad).
  - Drafts shown as `••••` until the user holds a "Reveal" button.
  - Bypasses the platform IME so a third-party keyboard or accessibility spyware does not
    see keystrokes via the standard input pipeline. (Limited defense; documented honestly.)
- Detect overlay/toast windows and refuse `Send` while one is on top (Android only;
  `obscured-touch` event). The button briefly grays out with an explanation.
- Gate the "secure shell" promises to Android 12+ in copy. Older Androids get best-effort but
  no marketing claim.
- Documentation:
  - New `docs/android_secure_shell_mode.md` design doc (already referenced from
    [docs/README.md](../README.md) — write the body in this ticket).
  - Update [framework.md](../framework.md) Pillar 6 with the concrete capabilities once shipped.
  - Update [threat_model.md §5](../threat_model.md) with the residual-risk paragraph for these
    additions.

## Out of scope (what's NOT in)

- iOS feature parity beyond what `expo-screen-capture` provides. iOS does not expose a
  `FLAG_SECURE` equivalent; we honestly say so.
- Defense against root-level malware, accessibility spyware, or installed RATs. Stated in
  [framework.md](../framework.md) and [threat_model.md §6](../threat_model.md).
- Custom secure keyboard with full punctuation / emoji / autocorrect. Blind-compose is
  intentionally minimal — fewer features mean fewer side channels.
- Anti-Frida / anti-debugger checks. These are arms-race territory.

## Files likely to change

- `lib/secure_shell.tsx` (new)
- `lib/blind_compose.tsx` (new)
- `app/_layout.tsx` (wrap sensitive route group)
- `app/(auth)/unlock.tsx`, `enroll.tsx`
- `app/(tabs)/contacts.tsx`, `conversations.tsx`, `settings.tsx`
- `app/chat/[peer].tsx`
- `app.json` (Android manifest tweaks via Expo config plugin)
- `package.json` (`expo-screen-capture`)
- `docs/android_secure_shell_mode.md` (new)
- `docs/framework.md`, `docs/threat_model.md`, `docs/invariants.md` (cross-links)

## Acceptance criteria

- [ ] On Android 12+: a manual screenshot attempt on chat screen produces the OS
      "screenshot disabled by app" toast.
- [ ] On Android 12+: app-switcher preview of a chat screen is blank.
- [ ] Standard screen-recording apps capture a black frame for sensitive routes.
- [ ] Blind-compose: drafts visible only when the Reveal button is held.
- [ ] Blind-compose: a third-party keyboard installed on the device does NOT receive draft
      keystrokes (verified by enabling a logging keyboard and inspecting its log — keystrokes
      should be absent for blind-compose, present for ordinary text fields elsewhere).
- [ ] An overlay window on top of the Send button: tapping does NOT send. The button is
      visibly disabled with an explanation.
- [ ] iOS build: ships a best-effort equivalent (screen-recording detection via
      `expo-screen-capture` events) but copy never promises Android-grade protection.
- [ ] Marketing / copy never claims defense against compromised-device adversaries
      ([forbidden_patterns.md B5.2 spirit](../forbidden_patterns.md) — no overclaim).

## Risk / threat-model implication

NARROWS [§5](../threat_model.md) at the visual / casual-onlooker boundary. Does NOT widen
[§6](../threat_model.md) — explicit copy preserves the honesty about compromised devices.

A genuine concern: the blind-compose pad is a custom input surface that increases the app's
attack surface. Mitigated by keeping it minimal (text + backspace + space + a tiny symbol set)
and writing it in pure RN (no `WebView`).

The Android `FLAG_SECURE` flag is best-effort: a rooted device can clear it and capture
freely. We document this in [threat_model.md §5](../threat_model.md).

## Handover checklist

### `scoping → ready` (Supervisor)
- [ ] Wireframes for blind-compose pad attached
- [ ] Decision on default-on vs default-off for immersive mode written into the ticket
- [ ] `docs/android_secure_shell_mode.md` outline drafted
- [ ] `invariants_touched` confirmed: does this need a new invariant ("sensitive routes are
      wrapped in `<SecureScreen>`")? If so, propose I16.

### `ready → coding` (Coder)
- [ ] Ticket re-read cold
- [ ] [framework.md Pillar 6](../framework.md) + [threat_model.md §5 / §6](../threat_model.md) read
- [ ] Branch `T-004-android-secure-shell` created

### `coding → review` (Coder)
- [ ] `npm run typecheck` passes
- [ ] Manual screenshot test on Android 12+ device
- [ ] Manual app-switcher test on Android 12+ device
- [ ] Manual logging-keyboard test for blind-compose
- [ ] `docs/android_secure_shell_mode.md` is the actual built behaviour, not aspirational
- [ ] PR description names T-004 and links to the new design doc

### `review → staging` (Reviewer)
- [ ] No marketing language in code comments or strings overclaims protection
- [ ] iOS path is best-effort and labelled as such
- [ ] No new outbound network destination introduced
- [ ] [threat_model.md §6](../threat_model.md) updated to reflect what we now defend

### `staging → prod` (Ops)
- [ ] Tested on at least two Android 12+ devices and one Android 11 device (to confirm
      degraded behaviour is honest, not crashy)
- [ ] iOS smoke test

### `prod → done` (Supervisor)
- [ ] 24h clean monitoring
- [ ] Outside reviewer (or at least a second pair of eyes) confirms the design doc matches
      the shipped behaviour
