const STORAGE_KEY = "erp-teacher-results-import-session";

export type ResultsImportSession = {
  jobId: string;
  fileName: string;
  startedAt: number;
  /** Set when the browser tab or app was closed mid-import. */
  interrupted?: boolean;
  /** Avoid showing the recovery toast more than once. */
  recoveryNotified?: boolean;
};

export function readResultsImportSession(): ResultsImportSession | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ResultsImportSession;
  } catch {
    return null;
  }
}

export function writeResultsImportSession(session: ResultsImportSession | null) {
  if (typeof sessionStorage === "undefined") return;
  if (!session) {
    sessionStorage.removeItem(STORAGE_KEY);
    return;
  }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function markResultsImportInterrupted() {
  const current = readResultsImportSession();
  if (!current) return;
  writeResultsImportSession({ ...current, interrupted: true });
}

export function markResultsImportRecoveryNotified() {
  const current = readResultsImportSession();
  if (!current) return;
  writeResultsImportSession({ ...current, recoveryNotified: true });
}

export const RESULTS_IMPORT_RECOVERY_TOAST =
  "Your previous results import did not finish because the session was interrupted. Please upload the file again to retry.";
