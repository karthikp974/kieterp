import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { readPortalTheme, useOptionalPortalTheme } from "../shared/portal-theme";

export type ResultsImportOverlayPhase = "running" | "completed" | "failed";

type Props = {
  open: boolean;
  phase: ResultsImportOverlayPhase;
  progress: number;
  indeterminate?: boolean;
  statusText: string;
  fileName?: string;
  onClose: () => void;
  onViewReport?: () => void;
};

export function ResultsImportLockOverlay({
  open,
  phase,
  progress,
  indeterminate = false,
  statusText,
  fileName,
  onClose,
  onViewReport
}: Props) {
  const themeCtx = useOptionalPortalTheme();
  const themeMode = themeCtx?.mode ?? readPortalTheme();

  if (!open || typeof document === "undefined") return null;

  const busy = phase === "running";
  const title =
    phase === "completed" ? "Import finished" : phase === "failed" ? "Import could not finish" : "Import in progress";

  return createPortal(
    <div
      className="portal-root htpo-results-import-lock"
      data-portal-theme={themeMode}
      role="presentation"
      aria-hidden={false}
    >
      <div className="htpo-results-import-lock__backdrop" />
      <section
        className="htpo-results-import-lock__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="htpo-results-import-lock-title"
        aria-busy={busy}
      >
        <header className="htpo-results-import-lock__head">
          <div>
            <h2 id="htpo-results-import-lock-title">{title}</h2>
            {fileName ? <p className="htpo-results-import-lock__file">{fileName}</p> : null}
          </div>
          {!busy ? (
            <button type="button" className="htpo-results-import-lock__close" aria-label="Close import status" onClick={onClose}>
              <X size={20} />
            </button>
          ) : null}
        </header>

        {busy ? (
          <p className="htpo-results-import-lock__caution">
            Processing is in progress. Please stay on this screen until the import completes. Navigation inside the portal is
            temporarily disabled.
          </p>
        ) : null}

        <div className="htpo-results-progress-row">
          <div
            className={`htpo-results-progress-track ${indeterminate ? "is-indeterminate" : ""}`}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={indeterminate ? undefined : progress}
            aria-label="Import progress"
          >
            <div className="htpo-results-progress-bar" style={indeterminate ? undefined : { width: `${progress}%` }} />
          </div>
          {!indeterminate ? <span className="htpo-results-progress-pct">{progress}%</span> : null}
        </div>

        <p className="htpo-results-progress-text">{statusText}</p>

        {!busy ? (
          <div className="htpo-results-import-lock__actions">
            {phase === "completed" && onViewReport ? (
              <button type="button" className="htpo-results-action-btn htpo-results-action-btn--block" onClick={onViewReport}>
                View import report
              </button>
            ) : null}
            <button
              type="button"
              className={`htpo-results-action-btn htpo-results-action-btn--block ${phase === "completed" ? "htpo-results-action-btn--ghost" : ""}`}
              onClick={onClose}
            >
              Close
            </button>
          </div>
        ) : null}
      </section>
    </div>,
    document.body
  );
}
