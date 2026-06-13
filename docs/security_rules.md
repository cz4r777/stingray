# Security Rules

> **Threat model summary:** [threat_model.md](threat_model.md) is the long version. In short: defend against a cellular-tower MITM (stingray / IMSI catcher), a compromised or hostile relay operator, and a moderately-sophisticated forensic attacker who gains brief physical access to a powered-on device. NOT in scope: a sustained nation-state actor with custom malware already running on the device.

---

## 1. Secrets inventory

| Secret | Lives in | Permissions | Synced via Git? |
|---|---|---|---|
| `RELAY_URL` | `.env` (`EXPO_PUBLIC_RELAY_URL`) | n/a — public URL | **NO** (not sensitive but excluded) |
| Anon key | `.env` (`EXPO_PUBLIC_RELAY_ANON_KEY`) | n/a — designed to be public | **NO** in `.env`; OK in compiled bundle |
| Service-role key | NOT in client `.env`. Ops machine only. | `chmod 600` | **NO** — never |
| User's vault passphrase | User's head, optionally a password manager | n/a | **NO** — by definition |
| Vault salt (`stingray.vault.salt.v1`) | `expo-secure-store` only | platform keychain ACL | **NO** |
| Vault blob (`stingray.vault.blob.v1`) | `expo-secure-store` only | platform keychain ACL | **NO** |

---

## 2. `.env` rules

- File location (dev): `c:\Users\z\Desktop\code\stingray\.env`
- File location (CI/EAS): set via EAS secrets, never committed
- Required permissions on Unix: `chmod 600`
- Required `.gitignore` entry: `.env` (already present)
- Template is `.env.example` — safe to commit; contains placeholders only

Before any commit that touches secrets:
```bash
grep '^\.env$' .gitignore   # must succeed
git status                  # confirm .env is NOT staged
```

---

## 3. Key types and their boundaries

### Anon key (`anon`)
- **What it can do:** insert / select / delete on `envelopes` (no other tables exist).
- **Bypasses RLS?** No — but RLS is permissive on this relay by design.
- **OK to ship in client bundle?** Yes — this is the design.
- **Implication:** an attacker with the anon key can drain envelopes addressed to a given pubkey or insert garbage. They still cannot decrypt anything. The cryptographic boundary is doing the work. See [INVARIANT I4](invariants.md).

### Service-role key (`service_role`)
- **What it can do:** anything, including DDL.
- **Bypasses RLS?** YES.
- **OK to ship in client bundle?** **NO. NEVER.** See [INVARIANT I14](invariants.md).
- **Where it lives:** ops scripts on the developer machine, used to run `expire_stale_envelopes()` and apply migrations.

### Vault key (per device, per user)
- Never persisted. Derived in memory from the passphrase and salt at unlock time.
- Lifetime: from `unlockVault()` to `lock()` / app suspend / panic wipe.
- If the device is suspended without locking the vault, the unlocked secret keys remain in RAM. Locking on suspend is a Phase 1 ticket.

### X25519 / Ed25519 secret keys (per identity)
- Live only inside the vault payload.
- Loaded into the `IdentityProvider` context on unlock; held in JS-side memory.
- React's garbage collector is not a cryptographic eraser — secret material may persist in memory past `lock()` until the JS heap is reclaimed. Treat this as a known weakness, not a feature.

---

## 4. PII handling

stingray is designed to minimise PII server-side. The table below describes what exists where.

| Location | PII present | Retention | Logging stance |
|---|---|---|---|
| relay `envelopes` row | recipient pubkey, opaque ciphertext, timestamps | 30 days max (ack-delete first; expiry job is fallback) | OK to log row counts; NEVER log `ciphertext` or `ephemeral_pubkey` values to a public sink. |
| local vault | user alias, secret keys | until panic wipe / uninstall | NEVER export the vault payload to a log or crash report |
| local conversation store | message bodies, contact aliases | until panic wipe / uninstall | NEVER include in any telemetry |
| in-memory plaintext | message bodies during composition / display | until JS GC after navigation | acceptable; document the limitation in [threat_model.md](threat_model.md) |

**General rule:** the only metadata the relay legitimately holds is "a recipient pubkey received N envelopes of various bucket sizes over the past 30 days". Everything else is PII that must not appear in any log, any analytics event, any crash report, or any export.

---

## 5. Account deletion / panic wipe

stingray has no account in the conventional sense — there is no server-side row to delete. "Account deletion" maps to:

1. User invokes Panic Wipe in-app.
2. `panicWipe()` removes the salt and the encrypted blob from `expo-secure-store`.
3. The device is now indistinguishable from a fresh install.
4. (Optional) The user manually scrubs their relay inbox by draining one more time, then disconnects from Wi-Fi before the next inbound message lands; queued envelopes addressed to the wiped key become undecryptable garbage that expires in 30 days.

What we DO NOT support and do not intend to support:

- A server-side endpoint that says "delete this user". There is no user.
- A "delete all my messages on the relay" operation invoked by anyone other than the key-holder. The point of the design is that nobody (including us) holds the key.

---

## 6. Logging

- **Never log:** message bodies, contact aliases, vault payloads, vault passphrase (obviously), ciphertext, ephemeral pubkeys, the user's own pubkey beyond the first 8 chars (for debugging).
- **OK to log:** boolean Faraday verdict + transport kind, bucket sizes (in aggregate), error CODES (`"box_open_failed"`, not the ciphertext that failed).
- **Where logs go:** Expo dev console in dev. In production, NO automatic upload. A Phase 8 ticket adds a local-only crash log the user can export manually if they choose.

---

## 7. Vault unlock flow specifics

- Passphrase minimum length is enforced in the enroll UI at 12 characters. Hard refuse below that.
- The KDF (v0 placeholder; v1 Argon2id) introduces per-guess cost. See [INVARIANT I8](invariants.md).
- Unlock failure does NOT distinguish between "no vault" and "wrong passphrase" — both produce `null`. The UI surfaces a generic "Wrong passphrase or no vault" message to avoid a probing oracle.

---

## 8. SAS verification (mandatory before sensitive use)

Every contact starts as `unverified`. The UI:

- shows a yellow padlock everywhere the contact appears
- exposes the 7-digit SAS code on the contact-add screen
- requires an explicit confirm step before recording `sas_state = 'verified'`

Refuse to send media (when attachments arrive in a later phase) to unverified contacts.

See [INVARIANT I9](invariants.md) for the rule and [forbidden_patterns.md B3.2](forbidden_patterns.md) for the failure mode.

---

## 9. Faraday gate

- The gate is the single most important defense in the product. See [INVARIANT I1](invariants.md).
- Polling interval: 4 seconds. Suspended devices do not poll.
- The gate is conservative: when it can't classify the transport (e.g. simulator network types), it BLOCKS. False-block is recoverable; false-allow is not.
- The gate banner is sticky, visible, and not dismissible. There is no "remind me later".

`EXPO_PUBLIC_FARADAY_MODE=false` exists ONLY for QA. Setting it `false` in any built artifact intended for end users is a release-blocking error.

---

## 10. Relay operator threats

The relay is in the threat model. We assume the operator (us, today; the user, in self-host mode tomorrow) is either honest-but-curious or fully compromised. Either way:

- The schema in [supabase/schema.sql](../supabase/schema.sql) cannot leak plaintext because it does not hold plaintext.
- Subscribing to all envelopes for all recipients reveals only opaque rows.
- Tampering with `bucket` or padding the ciphertext flip-flips bits → decrypt fails → recipient drops on the floor. No partial-plaintext path exists.

What the relay operator CAN learn:

- Which pubkeys receive mail (and roughly how often)
- The distribution of bucket sizes per recipient
- The IP addresses of clients connecting (network-level metadata) — mitigated only by VPN-over-Wi-Fi or Tor (Phase 7)

These limits are acknowledged in [threat_model.md §3](threat_model.md) and are not "bugs". They are the surface area we accept in exchange for not running a custom backend.

---

## 11. What is NOT defended

Honesty matters more than reassurance. The following are NOT covered by stingray:

- A backdoored device with kernel-level malware already running (it can read plaintext as the user types it — there is no application-layer defense)
- Sophisticated physical attacks (cold-boot RAM extraction within the unlock window)
- Voice / RF side channels (we don't ship audio)
- Carrier-level location tracking when the cellular radio is enabled for any other purpose (use airplane mode + Wi-Fi)
- Shoulder surfing (dark UI helps a bit; that's all)
