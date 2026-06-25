import { Download, X } from "lucide-react";
import { useState, type ButtonHTMLAttributes } from "react";
import { ErpButton } from "../design-system/ErpButton";
import { EXPORT_FORMATS, type ExportFormatId } from "./export-formats";

export function ExportFormatDialog({
  open,
  title = "Export",
  cardName,
  description,
  onClose,
  onExport
}: {
  open: boolean;
  title?: string;
  cardName: string;
  description?: string;
  onClose: () => void;
  onExport: (format: ExportFormatId) => Promise<void>;
}) {
  const [exporting, setExporting] = useState<ExportFormatId | null>(null);
  if (!open) return null;

  const lead =
    description ??
    `Choose a format for ${cardName.replace(/_/g, " ")}. Files use PAGE_CARD_YYYY-MM-DD naming.`;

  return (
    <div className="erp-confirm-overlay" role="presentation" onClick={onClose}>
      <section
        className="erp-export-dialog"
        aria-modal="true"
        role="dialog"
        aria-labelledby="erp-export-format-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="erp-export-dialog-head">
          <h2 id="erp-export-format-title" className="erp-type-card-title">
            {title}
          </h2>
          <button type="button" className="erp-btn erp-btn--icon erp-btn--secondary" onClick={onClose} aria-label="Close">
            <X size={18} aria-hidden />
          </button>
        </div>
        <p className="erp-export-dialog-lead erp-type-body">
          {lead}
        </p>
        <div className="erp-export-dialog-options">
          {EXPORT_FORMATS.map((format) => (
            <button
              key={format.id}
              type="button"
              className="erp-export-option erp-btn erp-btn--md erp-btn--secondary erp-export-option-btn"
              disabled={Boolean(exporting)}
              onClick={() => {
                setExporting(format.id);
                void onExport(format.id).finally(() => setExporting(null));
              }}
            >
              {exporting === format.id ? "Downloading…" : format.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

export function ExportTriggerButton({
  children = "Export",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <ErpButton variant="secondary" size="md" className={`erp-export-trigger ${className}`.trim()} {...rest}>
      <Download size={16} strokeWidth={2.2} aria-hidden />
      {children}
    </ErpButton>
  );
}
