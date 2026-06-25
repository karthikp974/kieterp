import { Trash2, type LucideIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { readPortalTheme, useOptionalPortalTheme } from "./portal-theme";

export type PortalConfirmOptions = {
  title: string;
  message: string;
  itemName?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  icon?: LucideIcon;
};

type PendingPortalConfirm = PortalConfirmOptions & {
  resolve: (confirmed: boolean) => void;
};

export function PortalConfirmDialog({
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
}: PortalConfirmOptions & {
  open: boolean;
  confirming?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const portalTheme = useOptionalPortalTheme();
  const themeMode = portalTheme?.mode ?? readPortalTheme();

  if (!open) return null;

  return createPortal(
    <div
      className="portal-root htpo-portal-confirm-overlay"
      data-portal-theme={themeMode}
      role="presentation"
      onClick={onCancel}
    >
      <section
        className="htpo-portal-confirm-card"
        aria-modal="true"
        role="dialog"
        aria-labelledby="htpo-portal-confirm-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`htpo-portal-confirm-icon${tone === "primary" ? " htpo-portal-confirm-icon--primary" : ""}`}>
          <Icon size={22} aria-hidden />
        </div>
        <h2 id="htpo-portal-confirm-title">{title}</h2>
        <p>{message}</p>
        {itemName ? <strong>{itemName}</strong> : null}
        <div className="htpo-portal-confirm-actions">
          <button className="htpo-portal-confirm-cancel" type="button" onClick={onCancel} disabled={confirming}>
            {cancelLabel}
          </button>
          <button
            className={tone === "primary" ? "htpo-portal-confirm-primary" : "htpo-portal-confirm-danger"}
            type="button"
            onClick={onConfirm}
            disabled={confirming}
          >
            <Icon size={15} aria-hidden />
            {confirming ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}

export function usePortalConfirm() {
  const [pending, setPending] = useState<PendingPortalConfirm | null>(null);

  const confirm = useCallback((options: PortalConfirmOptions) => {
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
    <PortalConfirmDialog
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
