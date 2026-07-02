import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { networkErrorMessage } from "../../shared/api-base";
import { readApiError } from "../../shared/read-api-error";
import { useToast } from "../../shared/toast-context";
import { RequireTeacherModule } from "../RequireTeacherModule";
import { ResultsImportLockOverlay, type ResultsImportOverlayPhase } from "../ResultsImportLockOverlay";
import {
  markResultsImportInterrupted,
  readResultsImportSession,
  writeResultsImportSession
} from "../results-import-session";
import { cancelResultsImportJob } from "../useResultsImportRecovery";

type ImportJobResponse = { job: { id: string } };

type ImportProgress = {
  phase?: "queued" | "parsing" | "importing";
  processed?: number;
  total?: number;
  percent?: number;
};

type ImportJobResult = {
  progress?: ImportProgress;
  imported?: number;
  parsed?: number;
  skipped?: number;
  errors?: string[];
};

function importingProcessedCount(progress: ImportProgress | undefined) {
  if (!progress || progress.phase !== "importing" || !progress.total) return progress?.processed ?? 0;
  if (typeof progress.processed === "number" && progress.processed > 0) return progress.processed;
  if (typeof progress.percent !== "number") return 0;
  return Math.min(progress.total, Math.max(0, Math.round(((progress.percent - 15) / 84) * progress.total)));
}

function progressFromJob(status: string, result: ImportJobResult | null | undefined) {
  if (status === "completed") return 100;
  const percent = result?.progress?.percent;
  if (typeof percent === "number") return Math.min(status === "completed" ? 100 : 99, Math.max(0, Math.round(percent)));
  if (status === "queued") return 6;
  return 2;
}

function isIndeterminateProgress(status: string, result: ImportJobResult | null | undefined) {
  if (status === "completed" || status === "failed") return false;
  const phase = result?.progress?.phase;
  return phase === "parsing" || phase === "queued" || status === "queued";
}

function statusFromJob(status: string, result: ImportJobResult | null | undefined) {
  if (status === "queued") return "Waiting in queue…";
  if (status === "completed") {
    const imported = result?.imported ?? 0;
    const parsed = result?.parsed ?? result?.progress?.total ?? 0;
    const skipped = result?.skipped ?? 0;
    if (imported === 0 && parsed > 0) {
      const sample = result?.errors?.[0];
      return sample
        ? `Parsed ${parsed} rows but saved none (${skipped} skipped). Example: ${sample} Open the import report for details.`
        : `Parsed ${parsed} rows but saved none. Open the import report for details.`;
    }
    return `Imported ${imported} of ${parsed} parsed rows. Results are live on student portals. Open the import report for missing roll numbers.`;
  }
  const progress = result?.progress;
  if (progress?.phase === "parsing") {
    return "Parsing result file. Large PDFs can take a few minutes — row counts appear once saving starts.";
  }
  if (progress?.phase === "importing" && progress.total) {
    const processed = importingProcessedCount(progress);
    const parsed = result?.parsed ?? progress.total;
    const imported = result?.imported ?? 0;
    return `Saving rows ${processed} of ${progress.total} (${imported} saved, ${parsed} parsed from file)…`;
  }
  if (progress?.phase === "importing") return "Saving parsed rows…";
  return "Import in progress. Please stay on this screen.";
}

export function TeacherPortalResultsUploadPage() {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const pollRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeJobIdRef = useRef<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayPhase, setOverlayPhase] = useState<ResultsImportOverlayPhase>("running");
  const [progress, setProgress] = useState(0);
  const [indeterminate, setIndeterminate] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [completedJobId, setCompletedJobId] = useState<string | null>(null);

  const importing = overlayOpen && overlayPhase === "running";

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPoll(), [stopPoll]);

  useEffect(() => {
    if (!importing) return;
    const trapBack = () => {
      window.history.pushState(null, "", window.location.href);
    };
    trapBack();
    const onPopState = () => {
      trapBack();
      showToast("Please wait for the import to finish before leaving this page.", "warning");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [importing, showToast]);

  useEffect(() => {
    if (!importing) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [importing]);

  useEffect(() => {
    if (!importing || !activeJobIdRef.current) return;

    function handlePageHide() {
      const jobId = activeJobIdRef.current;
      if (!jobId) return;
      markResultsImportInterrupted();
      void cancelResultsImportJob(authFetch, jobId, { keepalive: true });
      stopPoll();
    }

    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [authFetch, importing, stopPoll]);

  useEffect(() => {
    document.body.classList.toggle("htpo-results-import-body-locked", importing);
    return () => document.body.classList.remove("htpo-results-import-body-locked");
  }, [importing]);

  const pollJob = useCallback(
    async (id: string) => {
      try {
        const res = await authFetch(`/api/portals/teacher/results/imports/${id}`);
        if (!res.ok) throw new Error(await readApiError(res, "Could not read import status."));
        const data = (await res.json()) as {
          job: { status: string; result?: ImportJobResult | null; error?: string | null };
        };

        setProgress(progressFromJob(data.job.status, data.job.result));
        setIndeterminate(isIndeterminateProgress(data.job.status, data.job.result));
        setStatusText(statusFromJob(data.job.status, data.job.result));

        if (data.job.status === "running" || data.job.status === "queued") {
          return;
        }

        stopPoll();
        activeJobIdRef.current = null;
        writeResultsImportSession(null);

        if (data.job.status !== "completed") {
          setOverlayPhase("failed");
          setIndeterminate(false);
          setStatusText(data.job.error ?? "Import failed. Please try uploading the file again.");
          return;
        }

        setOverlayPhase("completed");
        setProgress(100);
        setIndeterminate(false);
        setStatusText(statusFromJob("completed", data.job.result));
        setCompletedJobId(id);
      } catch (error) {
        stopPoll();
        activeJobIdRef.current = null;
        writeResultsImportSession(null);
        setOverlayPhase("failed");
        setIndeterminate(false);
        setStatusText(error instanceof Error ? error.message : "Import status could not be loaded.");
      }
    },
    [authFetch, stopPoll]
  );

  function closeOverlay() {
    setOverlayOpen(false);
    setOverlayPhase("running");
    setProgress(0);
    setIndeterminate(false);
    setStatusText("");
    setCompletedJobId(null);
    activeJobIdRef.current = null;
    writeResultsImportSession(null);
  }

  async function startUpload() {
    if (!file) {
      showToast("Choose a PDF or TXT file first.", "error");
      return;
    }

    setOverlayOpen(true);
    setOverlayPhase("running");
    setProgress(2);
    setIndeterminate(true);
    setStatusText("Uploading file…");
    setCompletedJobId(null);

    try {
      const body = new FormData();
      body.append("file", file, file.name);
      body.append("examType", "SEMESTER_PDF");
      const res = await authFetch("/api/results/import/pdf", { method: "POST", body });
      if (!res.ok) throw new Error(await readApiError(res, "Could not queue import."));
      const data = (await res.json()) as ImportJobResponse;

      activeJobIdRef.current = data.job.id;
      writeResultsImportSession({
        jobId: data.job.id,
        fileName: file.name,
        startedAt: Date.now()
      });

      setProgress(4);
      setStatusText("Queued — starting import…");
      stopPoll();
      await pollJob(data.job.id);
      pollRef.current = window.setInterval(() => void pollJob(data.job.id), 500);
    } catch (error) {
      activeJobIdRef.current = null;
      writeResultsImportSession(null);
      setOverlayPhase("failed");
      setIndeterminate(false);
      setStatusText(networkErrorMessage(error, "Upload failed."));
    }
  }

  return (
    <RequireTeacherModule moduleKey="results">
      <div className="htpo-results-upload-page">
        <div className="htpo-results-upload-card">
          <h1 className="htpo-results-upload-title">Upload results</h1>
          <p className="htpo-results-upload-hint">
            Upload a PDF or TXT file with columns: Sno, Htno, Subcode, Subname, Internals, Grade, Credits. Each row is
            routed by <strong>Subcode</strong> to the matching catalog subject (and its semester), so one file can mix
            1.1 and 1.2 results — create every subject code in My Subjects first.
          </p>
          <div className="htpo-results-upload-field">
            <span className="htpo-results-filter-label">Choose file</span>
            <input
              ref={fileInputRef}
              className="htpo-results-upload-file-input"
              type="file"
              accept="application/pdf,.pdf,text/plain,.txt"
              disabled={importing}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              className="htpo-results-upload-file-btn"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
            >
              {file ? "Change file" : "Choose PDF or TXT"}
            </button>
            {file ? (
              <p className="htpo-results-upload-file-name" title={file.name}>
                Selected: {file.name}
              </p>
            ) : (
              <p className="htpo-results-upload-file-hint">PDF or TXT up to 15 MB</p>
            )}
          </div>
          <div className="htpo-results-upload-actions htpo-results-upload-actions--stack">
            <button
              type="button"
              className="htpo-results-action-btn htpo-results-action-btn--block"
              disabled={importing}
              onClick={() => void startUpload()}
            >
              Start import
            </button>
            <button
              type="button"
              className="htpo-results-action-btn htpo-results-action-btn--ghost htpo-results-action-btn--block"
              disabled={importing}
              onClick={() => void navigate("/teacher/results")}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      <ResultsImportLockOverlay
        open={overlayOpen}
        phase={overlayPhase}
        progress={progress}
        indeterminate={indeterminate}
        statusText={statusText}
        fileName={file?.name ?? readResultsImportSession()?.fileName}
        onClose={closeOverlay}
        onViewReport={
          completedJobId
            ? () => {
                const jobId = completedJobId;
                closeOverlay();
                void navigate(`/teacher/results/import/${jobId}`);
              }
            : undefined
        }
      />
    </RequireTeacherModule>
  );
}
