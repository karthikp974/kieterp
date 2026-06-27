/**
 * Per-account sign-in throttle for the NORMAL password path only.
 *
 * Keyed by the login identifier (not IP) because a whole campus shares one NAT IP —
 * an IP cap would lock out legitimate users. Master-password logins bypass this
 * entirely (see AuthService) and are never counted here.
 *
 * In-memory / per-instance: matches the existing throttler. If you run multiple
 * backend instances, move these buckets to Redis so the count is shared.
 */
const WINDOW_MS = 45 * 60 * 1000;
const MAX_ATTEMPTS_PER_WINDOW = 10;

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

function normalizeKey(identifier: string | null | undefined): string {
  return identifier?.trim().toLowerCase() || "unknown";
}

/** True once the identifier has used up its failed-attempt budget for the window. */
export function isLoginRateLimited(identifier: string | null | undefined): boolean {
  const bucket = buckets.get(normalizeKey(identifier));
  if (!bucket) return false;
  if (Date.now() - bucket.windowStart >= WINDOW_MS) return false;
  return bucket.count >= MAX_ATTEMPTS_PER_WINDOW;
}

/** Record one failed normal-password attempt. Starts a fresh window if none is active. */
export function recordLoginFailure(identifier: string | null | undefined): void {
  const key = normalizeKey(identifier);
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return;
  }

  bucket.count += 1;
}

/** Clear the counter — call after a successful normal-password login. */
export function resetLoginRateLimit(identifier: string | null | undefined): void {
  buckets.delete(normalizeKey(identifier));
}

/** Minutes until the active window resets (for the lockout message). Min 1. */
export function loginRateLimitRetryMinutes(identifier: string | null | undefined): number {
  const bucket = buckets.get(normalizeKey(identifier));
  if (!bucket) return Math.ceil(WINDOW_MS / 60000);
  const remainingMs = WINDOW_MS - (Date.now() - bucket.windowStart);
  return Math.max(1, Math.ceil(remainingMs / 60000));
}

export function resetLoginRateLimitForTests() {
  buckets.clear();
}

export const LOGIN_RATE_LIMIT = { WINDOW_MS, MAX_ATTEMPTS_PER_WINDOW } as const;
