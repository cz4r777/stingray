# Deployment

Single durable runbook for taking a change from idea to production.

> **Read first:** [pipeline.md](pipeline.md) defines the per-change workflow (Coder → Reviewer → Ops). This file defines what Ops actually *does* — environments, secrets, build commands, store submission, rollback, relay maintenance.

---

## End-to-end flow

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. DESIGN  (Supervisor)                                          │
│    Scope is captured in docs FIRST.                              │
│    Threat-model implication noted in the ticket.                 │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│ 2. BUILD  (Coder)                                                │
│    a. Schema (idempotent) → schema.sql                           │
│    b. Code (matches api_contracts.md)                            │
│    c. Local verify (typecheck + run on web + Faraday simulator)  │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│ 3. REVIEW  (Reviewer — separate pass, separate brain)            │
│    Checklist in pipeline.md §Stage 4.                            │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│ 4. STAGING DEPLOY  (Ops)                                         │
│    a. Apply schema to staging relay                              │
│    b. eas update --branch staging  (JS-only changes)             │
│       OR eas build --profile preview  (native changes)           │
│    c. Smoke test on TestFlight / Play Internal Track             │
│    d. Toggle airplane mode mid-session; confirm Faraday banner   │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│ 5. PROD DEPLOY  (Ops, with explicit go-ahead)                    │
│    a. Apply schema to prod relay                                 │
│    b. eas update --branch production  (JS-only)                  │
│       OR eas build --profile production + store submission       │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│ 6. MONITOR  (Ops)                                                │
│    Daily: relay row count, expiry job count                      │
│    Weekly: Supabase logs                                         │
│    Incidents → forbidden_patterns.md Section A                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Environments

Three environments. Each has its own relay project, its own anon key, its own EAS channel.

| Env | Relay project | Client distribution | When used |
|---|---|---|---|
| **dev** | `stingray-relay-dev` (free tier) | Expo Go on developer device + `npm run web` | Day-to-day local dev |
| **staging** | `stingray-relay-staging` (free tier) | EAS preview build → TestFlight (iOS) + Play Internal Track (Android) | Validating a release candidate |
| **prod** | `stingray-relay-prod` (free tier OK; Pro if connection count justifies) | App Store + Play Store production listings | Real users |

**Why three projects, not one with schemas?** Each Supabase project is one realtime endpoint and one set of anon keys. An env mistake (wrong key, wrong realtime channel) would cross envelopes between worlds. Project-level isolation is the only reliable boundary.

---

## Secrets per environment

| Secret | Dev | Staging | Prod |
|---|---|---|---|
| `EXPO_PUBLIC_RELAY_URL` | `.env` (gitignored) | EAS secret `RELAY_URL_STAGING` | EAS secret `RELAY_URL_PROD` |
| `EXPO_PUBLIC_RELAY_ANON_KEY` | `.env` | EAS secret | EAS secret |
| `EXPO_PUBLIC_FARADAY_MODE` | `'true'` (default) | `'true'` ALWAYS | `'true'` ALWAYS |
| Supabase service-role key (per env) | ops machine only, `chmod 600` | ops machine only | ops machine only |
| Apple Developer credentials | n/a | EAS credentials store | EAS credentials store |
| Google Play service-account JSON | n/a | EAS credentials store | EAS credentials store |

EAS secrets are set with `eas secret:create --name FOO --value BAR --scope project`. They appear in `process.env` at build time. See [security_rules.md](security_rules.md) for the full secret-handling protocol.

---

## Zero-to-prod: first-time setup

### Dev (local)

```bash
# 1. Install JS deps (~200 MB; run on unmetered wifi)
npm install

# 2. Create the dev relay at https://supabase.com (free tier)
#    Project name: stingray-relay-dev

# 3. Copy keys: Supabase → Settings → API
#    Project URL  → EXPO_PUBLIC_RELAY_URL
#    anon public  → EXPO_PUBLIC_RELAY_ANON_KEY

cp .env.example .env
# Edit .env with the two values above. Keep EXPO_PUBLIC_FARADAY_MODE=true.

# 4. Apply the schema
#    Supabase → SQL Editor → New query → paste supabase/schema.sql → Run.
#    Re-running is safe (INVARIANT I15).

# 5. (Auth providers) — there are none. Skip the auth tab entirely.

# 6. Run the app
npm run web      # smoke test in browser first
```

### Staging

Repeat steps 2–4 in a new Supabase project (`stingray-relay-staging`). Then:

```bash
eas secret:create --name RELAY_URL_STAGING --value https://STAGING-REF.supabase.co --scope project
eas secret:create --name RELAY_ANON_KEY_STAGING --value eyJ... --scope project
eas build --platform all --profile preview
```

### Prod

Same as staging with `stingray-relay-prod` and `RELAY_URL_PROD` / `RELAY_ANON_KEY_PROD`. Production builds:

```bash
eas build --platform all --profile production
eas submit --platform ios     # uploads to App Store Connect
eas submit --platform android # uploads to Play Console
```

---

## Build flow (per release)

### JS-only change (no native deps changed)

```bash
eas update --branch staging --message "Brief description"
# After staging validation:
eas update --branch production --message "Brief description"
```

### Native change (added expo plugin, native dep, changed app.json native config, bumped Expo SDK)

```bash
# Bump version in app.json: expo.version (semver) and expo.ios.buildNumber / expo.android.versionCode (integers).
eas build --platform all --profile production
eas submit --platform ios
eas submit --platform android
```

### Schema change

```bash
# 1. Apply to staging FIRST
#    Supabase (staging) → SQL Editor → paste schema.sql → Run
#    Verify in Table editor that intended changes happened.

# 2. Test against staging via the staging EAS channel.

# 3. Apply to prod
#    Supabase (prod) → SQL Editor → paste schema.sql → Run.

# 4. Schema↔client compatibility window — see forbidden_patterns.md C3.
```

---

## Relay maintenance

The relay needs one ongoing maintenance task: the 30-day envelope expiry.

```bash
# Run daily from an ops machine (cron, GitHub Actions, or a serverless function).
# Uses the service-role key.
psql "$RELAY_DB_URL" -c "select public.expire_stale_envelopes();"
```

Expected output: an integer count of deleted rows. In a healthy relay, this is small (most envelopes ack-delete before they age out). A sudden jump indicates an unusually large recipient population with offline devices, OR a buggy client that fails to ack-delete — investigate.

---

## Store submission gates

From [pipeline.md §Pre-launch hardening pipeline](pipeline.md). **None are optional.**

| # | Gate | Status check |
|---|---|---|
| 1 | Argon2id KDF in place | Inspect `lib/crypto.ts` — no hash-chain placeholder |
| 2 | SAS verification gates sensitive features in UI | Manual test: send media to an unverified contact → refused |
| 3 | Faraday banner visible when cellular detected | Manual test: airplane mode toggle → banner appears |
| 4 | `EXPO_PUBLIC_FARADAY_MODE` is `true` in production EAS profile | `eas env:list` for production profile |
| 5 | No third-party SDKs initiating outbound requests | Build with network log; assert no domains beyond the relay URL |
| 6 | Privacy disclosures match actual behaviour | Cross-check App Store Privacy + Google Data Safety form |
| 7 | EAS Build signed binaries for both platforms | `eas build:list` shows green for last build on both platforms |
| 8 | Outside cryptographer review of the threat model | Linked in PR description |

---

## App Store Connect + Play Console: required metadata

stingray's submission story is shorter than a typical product (no payments, no social discovery, no media library) but the privacy story has to be airtight.

### App Store Connect
- App name, subtitle (≤30 chars), category (Utilities → Communication)
- App description (≤4000 chars). Be honest about the threat model and the recovery-free design.
- Privacy policy URL — required.
- **App Privacy questionnaire** — only the recipient pubkey + bucket size + timestamp are collected by the relay. Body, contacts, message content: NONE.
- Age rating: 17+ (per Apple's policy for E2EE comms tools), or 4+ if you can argue the app makes no mature content.
- Demo account credentials: stingray has none. The reviewer needs a vault on the test device — provide a pre-enrolled build OR enrollment instructions with a recommended passphrase.

### Play Console
- App name, descriptions.
- Privacy policy URL.
- **Data safety form** — declare what the relay sees and what the device stores.
- Content rating: complete Google's IARC questionnaire honestly.
- Target audience: 18+.

---

## Rollback strategy

| What broke | How to revert |
|---|---|
| Just-pushed OTA JS update | `eas update` again pointing at the previous git commit. |
| Just-released native binary | Cannot pull a binary from the stores. Submit a hotfix and request expedited review. |
| Schema change in prod | Forward-only. Write a forward migration that restores the prior behavior. **Do not run `DROP` on `envelopes`** — every queued message becomes undeliverable. |
| Faraday gate accidentally allowed cellular | Mark a release-blocking incident. Hotfix immediately. Force-upgrade users where possible. |
| Vault format incompatibility (Phase 1 KDF swap) | The migration code in `vault.ts` should accept BOTH `.v1` and `.v2` blobs and rewrite on first unlock. A botched migration is recovered by rolling back the client; the on-disk `.v1` blob is unchanged until a successful upgrade. |

---

## Monitoring

| Signal | Where | Cadence |
|---|---|---|
| Relay row count | SQL: `select count(*) from public.envelopes` | Daily; flag if growing unbounded |
| Expiry job ran | Output of `expire_stale_envelopes()` | Daily |
| Realtime concurrent connections | Supabase → Settings → Usage | Weekly |
| Crash rate | Manual — local crash logs exported by users on request | As reported |
| Faraday-bypass flag in any production profile | `eas env:list` audit | Per release |

---

## eas.json template

Create this at the repo root the first time you set up EAS.

```json
{
  "cli": { "version": ">= 12.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "channel": "staging",
      "env": {
        "EXPO_PUBLIC_RELAY_URL": "$RELAY_URL_STAGING",
        "EXPO_PUBLIC_RELAY_ANON_KEY": "$RELAY_ANON_KEY_STAGING",
        "EXPO_PUBLIC_FARADAY_MODE": "true"
      }
    },
    "production": {
      "channel": "production",
      "env": {
        "EXPO_PUBLIC_RELAY_URL": "$RELAY_URL_PROD",
        "EXPO_PUBLIC_RELAY_ANON_KEY": "$RELAY_ANON_KEY_PROD",
        "EXPO_PUBLIC_FARADAY_MODE": "true"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

`EXPO_PUBLIC_FARADAY_MODE` is hardcoded `"true"` in both build profiles. The only way it ends up `"false"` in a build artifact is by editing this file — which is exactly the kind of change the reviewer must catch. See [forbidden_patterns.md B6.4](forbidden_patterns.md).

---

## Common deploy mistakes (forbidden)

See [forbidden_patterns.md §C](forbidden_patterns.md) for full entries. The short list:

- Skipping the staging deploy.
- Bumping `expo.version` but forgetting `ios.buildNumber` / `android.versionCode` — stores reject re-uploads.
- OTA-updating a JS bundle that requires a native API the deployed binary doesn't have.
- Applying a schema change to prod before the client that uses it ships.
- Shipping a build with `EXPO_PUBLIC_FARADAY_MODE=false`. Catastrophic.
- Committing real anon keys or service-role keys in `eas.json` or `app.json`.
