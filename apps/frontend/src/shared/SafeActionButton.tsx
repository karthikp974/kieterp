import { ButtonHTMLAttributes } from "react";
import { useActionButton } from "./useActionButton";
import "./SafeActionButton.css";

type SafeActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  run: () => Promise<void> | void;
  /** Label while the action is running (e.g. "Saving...", "Deleting..."). */
  busyLabel?: string;
  /** Label shown briefly after success (default "Done"). */
  successLabel?: string;
  /** Optional error handler (e.g. show a toast). The button always resets so the user can retry. */
  onError?: (error: unknown) => void;
  /**
   * Visual variant — preserves the button's existing styling during the rollout.
   * "primary" (default) | "secondary" | "danger" keep the db-wf-btn classes;
   * "plain" applies no db-wf-btn classes so an already-styled/icon button keeps its look.
   */
  variant?: "primary" | "secondary" | "danger" | "plain";
};

/** Inline spinner that inherits the button's text colour. */
function Spinner() {
  return (
    <svg
      className="animate-spin"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25" />
      <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Action button hardened against double-clicks / double submits. On click it disables and
 * shows a spinner + busy label; on success it shows a check + success label for ~1.5s; on
 * error it resets immediately. Long actions surface "Still working..." (5s) then
 * "This is taking longer than usual — please wait" (20s). Uses the app's db-wf-btn styles.
 */
export function SafeActionButton({
  run,
  children,
  busyLabel = "Working...",
  successLabel = "Done",
  onError,
  variant = "primary",
  className = "",
  disabled,
  ...props
}: SafeActionButtonProps) {
  const action = useActionButton(() => run(), { onError });
  const variantClass = variant === "plain" ? "" : `db-wf-btn db-wf-btn--${variant}`;

  const content =
    action.status === "loading" ? (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Spinner />
        {action.progressMessage ?? busyLabel}
      </span>
    ) : action.status === "success" ? (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span aria-hidden="true">✓</span>
        {successLabel}
      </span>
    ) : (
      children
    );

  return (
    <button
      {...props}
      type="button"
      disabled={action.isLocked || disabled}
      aria-busy={action.isBusy}
      onClick={() => action.run()}
      className={`${variantClass} ${className}`.trim()}
    >
      {content}
    </button>
  );
}
