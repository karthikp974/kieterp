/** Cache key namespaces. Invalidate with CacheService.delByPrefix(prefix). */
export const ADMIN_DASHBOARD_CACHE_PREFIX = "dash:admin:summary:";
export const REPORTS_SUMMARY_CACHE_PREFIX = "reports:summary:";

/** Short TTL bounds staleness even without explicit invalidation. */
export const DASHBOARD_CACHE_TTL_SECONDS = 45;
