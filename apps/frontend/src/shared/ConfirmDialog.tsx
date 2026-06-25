import { Trash2, type LucideIcon } from "lucide-react";
import { useCallback, useState } from "react";

export type ConfirmOptions = {
  title: string;
  message: string;
  itemName?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  icon?: LucideIcon;
};

type PendingConfirm = ConfirmOptions & {
  resolve: (confirmed: boolean) => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  itemName,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  icon: Icon = Trash2,
  confirming = false,
  onCancel,
  onConfirm
}: ConfirmOptions & {
  open: boolean;
  confirming?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <div className="erp-confirm-overlay" role="presentation" onClick={onCancel}>
      <section
        className="erp-confirm-card"
        aria-modal="true"
        role="dialog"
        aria-labelledby="erp-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`erp-confirm-icon${tone === "primary" ? " erp-confirm-icon--primary" : ""}`}>
          <Icon size={24} aria-hidden />
        </div>
        <h2 id="erp-confirm-title">{title}</h2>
        <p>{message}</p>
        {itemName ? <strong>{itemName}</strong> : null}
        <div className="erp-confirm-actions">
          <button className="erp-confirm-cancel" type="button" onClick={onCancel} disabled={confirming}>
            {cancelLabel}
          </button>
          <button
            className={tone === "primary" ? "erp-confirm-primary" : "erp-confirm-danger"}
            type="button"
            onClick={onConfirm}
            disabled={confirming}
          >
            <Icon size={16} aria-hidden />
            {confirming ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve });
    });
  }, []);

  const dismiss = useCallback(
    (confirmed: boolean) => {
      pending?.resolve(confirmed);
      setPending(null);
    },
    [pending]
  );

  const dialog = (
    <ConfirmDialog
      open={Boolean(pending)}
      title={pending?.title ?? ""}
      message={pending?.message ?? ""}
      itemName={pending?.itemName}
      confirmLabel={pending?.confirmLabel}
      cancelLabel={pending?.cancelLabel}
      tone={pending?.tone}
      icon={pending?.icon}
      onCancel={() => dismiss(false)}
      onConfirm={() => dismiss(true)}
    />
  );

  return { confirm, dialog };
}
