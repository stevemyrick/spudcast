/**
 * Tiny in-memory failure throttle for the login endpoint — enough to blunt
 * brute-force/credential-stuffing on a self-hosted box without a dependency.
 * Keyed by client IP; failures within a window trip a temporary lock.
 */
interface Bucket {
  fails: number;
  windowResetAt: number;
  lockedUntil: number;
}

const MAX_FAILS = 8;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

const buckets = new Map<string, Bucket>();

function sweep(now: number): void {
  if (buckets.size < 1000) return;
  for (const [k, b] of buckets) {
    if (b.lockedUntil < now && b.windowResetAt < now) buckets.delete(k);
  }
}

/** Seconds remaining on a lock for this key, or 0 if not locked. */
export function loginLockSeconds(key: string): number {
  const b = buckets.get(key);
  if (b && b.lockedUntil > Date.now()) return Math.ceil((b.lockedUntil - Date.now()) / 1000);
  return 0;
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  sweep(now);
  let b = buckets.get(key);
  if (!b || b.windowResetAt < now) {
    b = { fails: 0, windowResetAt: now + WINDOW_MS, lockedUntil: 0 };
  }
  b.fails += 1;
  if (b.fails >= MAX_FAILS) b.lockedUntil = now + LOCK_MS;
  buckets.set(key, b);
}

export function recordLoginSuccess(key: string): void {
  buckets.delete(key);
}

/** Test-only: clear all buckets. */
export function _resetRateLimits(): void {
  buckets.clear();
}
