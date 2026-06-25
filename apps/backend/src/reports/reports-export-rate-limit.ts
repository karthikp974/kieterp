const WINDOW_MS = 60_000;
const MAX_EXPORTS_PER_WINDOW = 5;

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

export function assertReportExportRateLimit(userId: string) {
  const now = Date.now();
  const bucket = buckets.get(userId);
  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(userId, { count: 1, windowStart: now });
    return;
  }
  if (bucket.count >= MAX_EXPORTS_PER_WINDOW) {
    throw new Error("RATE_LIMIT");
  }
  bucket.count += 1;
}

export function resetReportExportRateLimitForTests() {
  buckets.clear();
}
