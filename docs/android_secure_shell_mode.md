# Android Secure Shell Mode (Proposal)

> Status: proposal only. Not current scope. Android-focused hardening track for a future phase.
> Purpose: define a realistic "game-like takeover" mode for stingray on Android without overstating what the OS can protect.

---

## Summary

The user request is a "take over the device" mode: when stingray is activated, the app should feel less like a normal chat UI and more like a hardened secure terminal that:

- occupies the full display
- minimizes visible system chrome
- blocks screenshots and screen recording where Android allows it
- blanks app content in recents / app switcher
- resists overlay-based clickjacking
- can optionally run as a kiosk on a dedicated burner device

This is feasible **partially**, not absolutely.

Android can provide a strong **app-window privacy boundary**. Android cannot make a normal third-party app into a separate secure OS session. If the device already has privileged malware, a RAT, root, or an accessibility-based spyware implant, stingray cannot honestly guarantee that the screen or keystrokes are invisible to that software.

That limit must remain explicit in product copy and the threat model.

---

## Platform Floor Recommendation

Recommended floor for Android secure-shell features:

- **Secure Shell Mode requires Android 12+**
- **General app support below Android 12 should be reconsidered**

Rationale:

- Android's modern overlay defenses are materially better on Android 12+
- `HIDE_OVERLAY_WINDOWS` is available on Android 12+
- Android's own guidance notes that on Android 11 and lower, `FLAG_SECURE` is only reliably helpful on around 70% of devices because keyboard taps can still be recorded on some devices
- if the product promise is "hardened Android terminal," the weakest platform behavior should not define the security story

Practical recommendation:

- keep cross-platform / prototype support broad if needed during development
- for any user-facing hardened release, require Android 12+ for Secure Shell Mode
- strongly consider making Android 12 the minimum supported Android version for the whole product before public launch

---

## Threats This Mode Mitigates

- accidental screenshots
- ordinary screen recording and screen sharing
- app-switcher thumbnails / recents previews
- non-secure external display mirroring / casting
- overlay attacks from ordinary third-party apps
- casual observation while the app is backgrounded
- accidental exits or task switching on a dedicated device

## Threats This Mode Does NOT Mitigate

- rooted devices
- privileged malware
- remote access trojans with OS-level or vendor-level capture privileges
- accessibility spyware reading text or synthesizing touches
- hardware cameras filming the screen
- the user voluntarily revealing content

---

## Answer To The Video Question

The screenshot behavior and the video behavior are related.

On Android, `FLAG_SECURE` is the main control. It tells Android not to allow screenshots and not to show the app on non-secure displays. In practice, this is also the standard way to block ordinary screen recording / media projection capture for sensitive screens.

For stingray, the design assumption should be:

- **Yes:** we can make standard screenshots go black or fail.
- **Yes:** we can block ordinary screen recording / screen share paths on most supported Android devices.
- **Yes:** we can prevent the app from being shown on non-secure displays.
- **No:** we cannot guarantee invisibility from privileged malware or vendor-specific remote-control software.

Some remote-access products can blank the local screen because they operate with elevated privileges, device-owner powers, OEM hooks, or enterprise-management control that a normal app does not have.

---

## Proposed User-Facing Modes

### 1. Shield Mode

Cross-platform best-effort mode.

- raises a privacy curtain over content until the user explicitly reveals it
- auto-locks on background
- re-hides content when transport becomes unsafe
- keeps current Faraday transport logic fully active

This is the mode already partially prototyped in the current app shell.

### 2. Secure Screen Mode

Android-native hardened display mode for sensitive routes.

- enables screen-capture prevention
- blanks recents / app-switcher preview
- blocks non-secure display mirroring
- pairs with immediate re-shield on background

This is the minimum acceptable Android hardening layer.

### 3. Immersive Shell Mode

Full-screen "terminal chat" presentation.

- hides status and navigation bars using immersive mode
- uses a monospace, keyboard-first UI
- reduces visible chrome and distractions
- keeps a single-purpose, deliberate interaction model

This is primarily UX hardening and focus control, not a security boundary by itself.

### 4. Blind Compose Mode

Custom compose path designed to reduce exposure through ordinary keyboard and visual capture paths.

- avoids the normal `EditText` + system keyboard flow for sensitive composition
- uses an in-app compose pad / terminal keypad
- can mask the user's own outgoing text by default
- can show only incoming messages until the user deliberately reveals draft text
- minimizes what a casual screen viewer, screenshot, or ordinary screen recording can learn

This is **IME avoidance**, not "keylogger proof."

### 5. Dedicated Device Mode

Android burner-tablet / burner-phone deployment.

- optional lock task / kiosk mode
- stingray becomes the only foreground workflow
- user cannot casually leave to other apps

This mode is only realistic on a fully managed device or a device-owner setup.

---

## Platform Building Blocks

### A. `FLAG_SECURE`

Use for all sensitive Android activities / windows.

Expected effect:

- screenshot output is blocked or blank
- ordinary screen recording / media projection is blocked in common cases
- non-secure display output is blocked

Notes:

- this is the key control for "black screen on screenshot" and most normal screen-capture prevention
- this is not a promise against privileged capture

### B. `HIDE_OVERLAY_WINDOWS`

Android 12+ permission that opts the app out of third-party overlays being drawn above it.

Expected effect:

- improves resistance to tapjacking / cloak-and-dagger overlay attacks
- reduces the chance of malicious UI floating on top of stingray

### C. `filterTouchesWhenObscured`

Sensitive actions should reject touches when the window is obscured.

Expected effect:

- if another visible window is on top, touches on sensitive controls can be discarded
- useful for buttons like unlock, reveal, send, and panic wipe

### D. Immersive Full-Screen

Hide system bars while the secure shell is active.

Expected effect:

- game-like full-screen presence
- fewer accidental exits
- less surrounding OS surface visible during use

### E. Lock Task Mode

Dedicated-device option only.

Expected effect:

- kiosk-like pinning to stingray
- home / recents / notifications are restricted depending on device-owner policy

Important:

- not a general-user feature on arbitrary phones
- requires device-owner / DPC allowlisting to be meaningful

### F. Custom In-App Compose Pad

This is not a full Android system IME. It is an app-local input surface.

Expected effect:

- reduces reliance on third-party keyboards
- avoids some ordinary input-method capture paths
- allows masked entry, delayed reveal, and send-without-persisting-draft UX

Limits:

- does not stop privileged malware from reading touch events, accessibility output, or process memory
- does not justify claiming the app is safe against keyloggers
- should be described as reducing exposure, not eliminating it

---

## Blind Compose Proposal

### Goal

Reduce visual leakage and reduce dependence on the system keyboard for the most sensitive message composition flow.

### Behavior

When the user enters Stingray Mode:

- incoming messages remain visible
- outgoing draft text is hidden or masked
- compose uses a custom in-app keypad / terminal input surface
- the draft is not mirrored in a standard text field
- optional "hold to reveal" temporarily reveals the draft
- on send, the draft is cleared immediately from UI state

### Variants

#### Variant A: Masked terminal line

- user types into a custom compose line
- characters render as blocks / bullets / placeholders
- user can hold a button to reveal for 2-3 seconds

#### Variant B: Receive-only visible

- conversation view shows only peer messages
- user composes "blind" in a hidden local buffer
- send confirmation reveals only message length / send time, not body

#### Variant C: High-friction secure phrase mode

- reduced alphabet / keypad layout
- slower but more deliberate
- best reserved for short high-risk messages

### Recommendation

Build Variant A first.

It offers the best tradeoff between usability and reduced visual leakage.

### Security Position

Blind compose helps against:

- shoulder surfing
- ordinary screenshots
- ordinary screen recordings
- casual remote viewing of the display

Blind compose does **not** defend against:

- accessibility malware
- touch-event capture by privileged malware
- rooted-device instrumentation
- process-memory inspection

---

## Why Not Build A Full System Keyboard

Android supports custom IMEs, but that is the wrong abstraction for stingray.

Reasons:

- a system IME is more invasive and higher-maintenance
- users must install and select it system-wide
- it enlarges the trusted computing base
- it still does not solve the "compromised device" problem
- stingray only needs hardened input inside stingray, not across the whole OS

Therefore the recommended design is:

- **no custom system IME**
- **yes custom in-app compose pad**

---

## Concrete Plan For This Repo

## Phase X.1 — Android Secure Screen Baseline

Goal:

Protect sensitive screens from screenshots, standard recording, and recents previews.

Work:

1. Add `expo-screen-capture`.
2. Apply capture prevention to:
   - unlock
   - contacts
   - chat
   - settings
   - any future conversation-history screen
3. Enable prevention by default while unlocked; optionally scope it to sensitive routes if UX demands.
4. Re-assert prevention on app foreground.
5. Add a visible settings explanation: "Blocks screenshots and standard screen recording on supported Android devices."
6. Gate the feature behind Android 12+ if we choose not to raise the app-wide minimum immediately.

Acceptance:

- Android screenshot of a protected route is blank or blocked
- Android screen recording / ordinary share path cannot capture protected content in normal conditions
- recents preview does not reveal prior chat content

Notes:

- iOS behavior differs and must be documented honestly
- web cannot provide this guarantee

## Phase X.2 — Overlay And Touch Hardening

Goal:

Reduce overlay-based abuse and obscured-touch attacks.

Work:

1. Add `HIDE_OVERLAY_WINDOWS` to Android manifest via app config / plugin.
2. Add native touch-obscured filtering for sensitive controls.
3. Fail closed on obscured touches:
   - unlock
   - reveal content
   - send
   - panic wipe
4. Surface a clear warning if an obscured-touch event is detected.

Acceptance:

- third-party overlays are not allowed over stingray on supported Android versions
- sensitive buttons ignore touches when obscured

## Phase X.3 — Immersive Shell UI

Goal:

Ship the "terminal takeover" interaction model.

Work:

1. Add an Android secure shell route:
   - conversation list
   - current conversation
   - compose
   - status line for Faraday / shield / identity state
2. Use immersive mode to hide system bars while active.
3. Use a monospace-first layout with large tap targets and no tab bar.
4. Keep a visible escape path that requires deliberate intent.

Acceptance:

- entering secure shell feels full-screen and single-purpose
- system bars remain hidden except when explicitly revealed by gesture / system behavior
- content auto-re-shields on background

## Phase X.4 — Blind Compose Pad

Goal:

Reduce visual leakage and avoid the system keyboard path during sensitive composition.

Work:

1. Build an in-app compose pad instead of a normal text field for Stingray Mode.
2. Default to masked outgoing text.
3. Add hold-to-reveal.
4. Clear draft immediately after send or cancel.
5. Ensure the compose pad lives under secure-screen protections.

Acceptance:

- user can compose without invoking the ordinary soft keyboard
- draft text is hidden by default
- outgoing draft does not appear in app-switcher previews or screenshots

## Phase X.5 — Dedicated Device Mode

Goal:

Support a burner Android device that effectively becomes a stingray terminal.

Work:

1. Document device-owner / dedicated-device setup.
2. Add a small Android-only DPC or dedicated-device wrapper if the product chooses to own that setup.
3. Allowlist only stingray for lock task mode.
4. Provide a separate deployment path for dedicated devices; do not mix this with the ordinary consumer install story.

Acceptance:

- on a managed device, stingray can be pinned in kiosk-like mode
- user cannot casually leave the app or access unrelated apps

---

## Engineering Notes For Expo

- Current repo is managed Expo.
- `expo-screen-capture` is the lowest-friction path for Phase X.1.
- Overlay hardening and touch-obscured filtering may require a config plugin or native Android module.
- Dedicated-device lock task mode is beyond normal Expo-only app logic and should be treated as a native Android track.

This suggests a split:

- **Expo-first:** secure screen, privacy curtain, immersive shell UI
- **Native Android track:** overlay hardening, obscure-touch enforcement, dedicated-device mode

---

## Security Copy Requirements

The UI and docs must never say:

- "undetectable"
- "invisible to remote access"
- "blocks all screen capture"
- "secure against malware"

Allowed phrasing:

- "Blocks screenshots and standard screen recording on supported Android devices"
- "Best-effort protection against ordinary screen sharing and overlays"
- "Does not defend against a compromised device"

---

## Test Matrix

### Android baseline

- screenshot attempt while unlocked
- screenshot attempt while chat is visible
- screen recording attempt
- cast / non-secure display attempt
- app switcher preview after backgrounding
- background → foreground auto-re-shield

### Overlay / tapjacking

- overlay app present
- obscured touch on send
- obscured touch on reveal
- obscured touch on unlock

### Transport interaction

- secure shell on Wi-Fi
- secure shell on cellular
- secure shell on VPN
- secure shell on offline

### Dedicated-device path

- lock task enter
- lock task exit by admin only
- reboot persistence on managed device

---

## Scope Recommendation

Recommended order:

1. Phase X.1 Secure Screen Baseline
2. Phase X.2 Overlay And Touch Hardening
3. Phase X.3 Immersive Shell UI
4. Phase X.4 Blind Compose Pad
5. Phase X.5 Dedicated Device Mode

Do **not** begin with kiosk mode. The biggest privacy win comes first from display-capture hardening and reliable re-shielding.
