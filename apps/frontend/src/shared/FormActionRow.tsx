import type { ReactNode } from "react";

type FormActionRowProps = {
  primaryLabel: ReactNode;
  cancelLabel?: ReactNode;
  onCancel: () => void;
  primaryType?: "button" | "submit";
  primaryDisabled?: boolean;
  onPrimary?: () => void;
};

/** Equal-width primary + cancel — use at the bottom of admin/portal forms. */
export function FormActionRow({
  primaryLabel,
  cancelLabel = "Cancel",
  onCancel,
  primaryType = "submit",
  primaryDisabled = false,
  onPrimary
}: FormActionRowProps) {
  return (
    <div className="db-form-actions">
      <button
        type={primaryType}
        className="db-wf-btn db-wf-btn--primary"
        disabled={primaryDisabled}
        onClick={onPrimary}
      >
        {primaryLabel}
      </button>
      <button type="button" className="db-wf-btn" onClick={onCancel}>
        {cancelLabel}
      </button>
    </div>
  );
}
