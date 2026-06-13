// Faraday-mode transport gate. The single most important defense against
// the stingray (cellular-tower MITM) threat: refuse to transmit when the
// only available route is cellular.
//
// See docs/invariants.md I1 and docs/threat_model.md §2.

import * as Network from 'expo-network';
import type { FaradayVerdict, TransportState } from './types';

const FARADAY_ENABLED = process.env.EXPO_PUBLIC_FARADAY_MODE !== 'false';
let runtimeStrictOverride = false;

export async function readTransport(): Promise<TransportState> {
  const s = await Network.getNetworkStateAsync();
  if (!s.isConnected) return { kind: 'offline' };

  switch (s.type) {
    case Network.NetworkStateType.WIFI:
      return { kind: 'wifi', ssid: null };
    case Network.NetworkStateType.ETHERNET:
      return { kind: 'ethernet' };
    case Network.NetworkStateType.VPN:
      // We cannot trust a VPN to mask the underlying radio — cell carriers can
      // still see endpoint metadata even if traffic is encrypted. Treat VPN-over-
      // cellular as cellular. See docs/forbidden_patterns.md §B2.2.
      return { kind: 'vpn', underlying: 'unknown' };
    case Network.NetworkStateType.CELLULAR:
      return { kind: 'cellular', generation: 'unknown' };
    case Network.NetworkStateType.NONE:
      return { kind: 'offline' };
    default:
      return { kind: 'unknown' };
  }
}

export function evaluateFaraday(t: TransportState): FaradayVerdict {
  if (!FARADAY_ENABLED && !runtimeStrictOverride) return { allowed: true, transport: t };

  switch (t.kind) {
    case 'wifi':
    case 'ethernet':
      return { allowed: true, transport: t };
    case 'vpn':
      // Conservative default: refuse VPN until the user manually attests it
      // is layered over WiFi/ethernet. UI exposes the override per session.
      return { allowed: false, transport: t, reason: 'VPN underlying transport unverified' };
    case 'cellular':
      return { allowed: false, transport: t, reason: 'Cellular radio is interceptable by IMSI catchers' };
    case 'offline':
      return { allowed: false, transport: t, reason: 'No network' };
    case 'unknown':
      return { allowed: false, transport: t, reason: 'Transport could not be classified' };
  }
}

export async function assertFaraday(): Promise<FaradayVerdict> {
  return evaluateFaraday(await readTransport());
}

// React hook helper lives in identity.tsx so it can re-evaluate on subscribe.
export type TransportListener = (verdict: FaradayVerdict) => void;
const listeners = new Set<TransportListener>();
let pollHandle: ReturnType<typeof setInterval> | null = null;

async function emitCurrentVerdict() {
  const v = await assertFaraday();
  for (const l of listeners) l(v);
}

export function setRuntimeFaradayStrict(enabled: boolean) {
  runtimeStrictOverride = enabled;
  void emitCurrentVerdict();
}

export function subscribeTransport(fn: TransportListener): () => void {
  listeners.add(fn);
  if (!pollHandle) {
    pollHandle = setInterval(async () => {
      await emitCurrentVerdict();
    }, 4000);
  }
  void assertFaraday().then(fn);
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && pollHandle) {
      clearInterval(pollHandle); pollHandle = null;
    }
  };
}
