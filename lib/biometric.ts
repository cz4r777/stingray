// Biometric capability + prompt helpers.
//
// v0.1.5 introduces ENFORCED biometric unlock: a device that has no biometric
// hardware OR has no biometric currently enrolled cannot create a stingray
// vault. The passphrase remains the cryptographic foundation (the vault is
// still Argon2id-derived per INVARIANT I8) but the everyday unlock factor
// is the biometric prompt gated by hardware-backed key storage.
//
// Threat-model shift documented in docs/invariants.md I8.1.

import * as LocalAuthentication from 'expo-local-authentication';

export type BiometricCapability = {
  hasHardware: boolean;
  isEnrolled: boolean;
  strongLevel: boolean;            // SECURE_STRONG (Android Class 3) / iOS biometric
};

export async function getBiometricCapability(): Promise<BiometricCapability> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) return { hasHardware: false, isEnrolled: false, strongLevel: false };
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  const level = await LocalAuthentication.getEnrolledLevelAsync();
  // SecurityLevel.BIOMETRIC_STRONG === 2 (Android Class 3 / iOS Face/Touch ID)
  // SecurityLevel.BIOMETRIC_WEAK === 1 (Android Class 2, fingerprint-only on older)
  const strongLevel = level === LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG;
  return { hasHardware, isEnrolled, strongLevel };
}

// Block enrolment unless the device has hardware + an enrolled biometric.
// Thrown reason string is user-facing.
export async function enforceBiometric(): Promise<void> {
  const c = await getBiometricCapability();
  if (!c.hasHardware) {
    throw new Error(
      'This device has no biometric sensor. Stingray requires biometric '
      + 'unlock to operate. Use a phone with fingerprint or face recognition.',
    );
  }
  if (!c.isEnrolled) {
    throw new Error(
      'No biometric is set up on this device. Open your phone settings, '
      + 'add a fingerprint or face, and come back.',
    );
  }
}

// Prompt the user for a biometric scan. Returns true on success.
// Falls through to device passcode if biometric is unavailable or fails
// repeatedly (default OS behaviour).
export async function promptBiometric(reason: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const res = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    cancelLabel: 'Use passphrase instead',
    disableDeviceFallback: false,
    fallbackLabel: 'Use device passcode',
  });
  if (res.success) return { ok: true };
  return { ok: false, reason: res.error ?? 'cancelled' };
}
