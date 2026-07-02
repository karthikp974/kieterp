export const SYSTEM_QUEUE = "system-jobs";
export const RESULT_PDF_IMPORT_JOB = "result-pdf-import";
/** Bulk student enrollment import — runs off the request thread (password hashing is CPU-heavy). */
export const STUDENT_BULK_IMPORT_JOB = "student-bulk-import";
/** Reserved for async bulk promotion runs (not yet enqueued from API). */
export const PROMOTION_BULK_JOB = "promotion-bulk";
/** Reserved for large tabular exports (reports still stream synchronously today). */
export const REPORT_EXPORT_JOB = "report-export";
/** Repeatable housekeeping: purge AuthSession rows past their expiry (runs daily). */
export const SESSION_CLEANUP_JOB = "session-cleanup";
/** How often the session-cleanup repeatable job runs (ms). */
export const SESSION_CLEANUP_EVERY_MS = 24 * 60 * 60 * 1000;
