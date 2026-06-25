import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import {
  markResultsImportRecoveryNotified,
  readResultsImportSession,
  RESULTS_IMPORT_RECOVERY_TOAST,
  writeResultsImportSession
} from "./results-import-session";

type AuthFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function useResultsImportRecovery(authFetch: AuthFetch, showToast: (message: string, tone?: "success" | "error" | "warning" | "info" | "danger") => void) {
  const location = useLocation();
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;

    const session = readResultsImportSession();
    if (!session) return;

    void (async () => {
      try {
        if (session.interrupted && !session.recoveryNotified) {
          markResultsImportRecoveryNotified();
          showToast(RESULTS_IMPORT_RECOVERY_TOAST, "warning");
          writeResultsImportSession(null);
          return;
        }

        if (location.pathname === "/teacher/results/upload") return;

        const res = await authFetch(`/api/portals/teacher/results/imports/${session.jobId}`);
        if (!res.ok) {
          writeResultsImportSession(null);
          return;
        }

        const data = (await res.json()) as { job: { status: string } };
        if (data.job.status === "queued" || data.job.status === "running") {
          await authFetch(`/api/portals/teacher/results/imports/${session.jobId}/cancel`, { method: "POST" });
          if (!session.recoveryNotified) {
            markResultsImportRecoveryNotified();
            showToast(RESULTS_IMPORT_RECOVERY_TOAST, "warning");
          }
        }
      } catch {
        // Ignore recovery errors — user can retry manually.
      } finally {
        if (readResultsImportSession()?.interrupted || location.pathname !== "/teacher/results/upload") {
          writeResultsImportSession(null);
        }
      }
    })();
  }, [authFetch, location.pathname, showToast]);
}

export async function cancelResultsImportJob(authFetch: AuthFetch, jobId: string, init?: RequestInit) {
  try {
    await authFetch(`/api/portals/teacher/results/imports/${jobId}/cancel`, { method: "POST", ...init });
  } catch {
    // Best effort when the page is unloading.
  }
}
