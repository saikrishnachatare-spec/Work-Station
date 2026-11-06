/**
 * Preview-only pending-onboarding handoff (stage-3 race fix).
 *
 * The signup form cannot run POST /api/me/bootstrap itself: finalize()
 * activates the Clerk session, AuthGate immediately swaps the route tree for
 * the unmapped gate, and the form unmounts mid-request. So the form stashes
 * the onboarding payload here BEFORE finalize, and the unmapped gate (which
 * survives the session flip) runs the bootstrap.
 *
 * Security/lifetime rules (reviewed):
 * - Identity-bound: the payload is keyed to the Clerk sub it was created
 *   with; the gate only runs it when the CURRENT session's sub matches. An
 *   account switch never sees or uses another account's payload.
 * - No secrets: never stores the password, the email OTP, or any token -
 *   only the onboarding fields that are about to be POSTed anyway.
 * - Lifetime: in-memory, plus sessionStorage on web so a full page reload
 *   (or tab crash) mid-onboarding does not silently drop it. sessionStorage
 *   is per-tab and dies with the tab; nothing is written to localStorage.
 * - Cleared on bootstrap success, on 409 (already bound), and on sign-out.
 * - Retry-safe: a 403 (not allowlisted yet) or a network failure leaves the
 *   payload in place; the gate offers Retry. The server route is atomic and
 *   keyed on sub, so a retried POST after an unknown outcome lands as 409
 *   (treated as success) - never a duplicate identity.
 */
import { Platform } from 'react-native';

export type PendingBootstrap = {
  sub: string;
  full_name: string;
  account_type: string;
  org_name: string;
  course: string;
  level: string;
  phone: string;
};

const STORAGE_KEY = 'clerkPrepPendingBootstrap';
let memory: PendingBootstrap | null = null;

function readRaw(): PendingBootstrap | null {
  if (memory) return memory;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (raw) memory = JSON.parse(raw) as PendingBootstrap;
    } catch {
      // Corrupt or unavailable storage: behave as empty, never crash auth.
    }
  }
  return memory;
}

export function setPendingBootstrap(p: PendingBootstrap): void {
  memory = p;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch {
      // Storage full/blocked: in-memory copy still covers this page life.
    }
  }
}

/** The stashed payload, only when it belongs to this Clerk sub. */
export function peekPendingBootstrapFor(sub: string): PendingBootstrap | null {
  const p = readRaw();
  return p && p.sub === sub ? p : null;
}

export function clearPendingBootstrap(): void {
  memory = null;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}
