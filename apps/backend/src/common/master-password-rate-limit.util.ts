import { HttpException, HttpStatus } from "@nestjs/common";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_WINDOW = 5;

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

export function assertMasterPasswordRateLimit(ipAddress: string | null | undefined) {
  const key = ipAddress?.trim() || "unknown";
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    return;
  }

  if (bucket.count >= MAX_ATTEMPTS_PER_WINDOW) {
    throw new HttpException("Too many master password attempts. Try again later.", HttpStatus.TOO_MANY_REQUESTS);
  }
}

export function recordMasterPasswordAttempt(ipAddress: string | null | undefined) {
  const key = ipAddress?.trim() || "unknown";
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return;
  }

  bucket.count += 1;
}

export function resetMasterPasswordRateLimitForTests() {
  buckets.clear();
}
