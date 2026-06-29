import { X } from "lucide-react";
import { useState } from "react";
import type { ExportFormatId } from "../shared/export/export-formats";

const TEACHER_EXPORT_FORMATS = [
  { id: "docx", label: "Word" },
  { id: "excel", label: "Excel" },
  { id: "google-sheets", label: "Google Sheets" },
  { id: "txt", label: "TXT" },
  { id: "pdf", label: "PDF" }
] as const satisfies ReadonlyArray<{ id: ExportFormatId; label: string }>;

export type TeacherPortalExportFormat = (typeof TEACHER_EXPORT_FORMATS)[number]["id"];

export function TeacherPortalExportDialog({
  open,
  title,
  leadPrimary,
  leadSecondary,
  onClose,
  onExport
}: {
  open: boolean;
  title: string;
  leadPrimary: string;
  leadSecondary: string;
  onClose: () => void;
  onExport: (format: TeacherPortalExportFormat) => Promise<void>;
}) {
  const [exporting, setExporting] = useState<TeacherPortalExportFormat | null>(null);
  if (!open) return null;

  return (
    <div className="erp-confirm-overlay" role="presentation" onClick={onClose}>
      <section
        className="erp-export-dialog"
        aria-modal="true"
        role="dialog"
        aria-labelledby="teacher-export-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="erp-export-dialog-head">
          <h2 id="teacher-export-title">{title}</h2>
          <button type="button" className="db-icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="erp-export-dialog-lead">
          Export <strong>{leadPrimary}</strong> · <strong>{leadSecondary}</strong>
        </p>
        <div className="erp-export-dialog-options">
          {TEACHER_EXPORT_FORMATS.map((format) => (
            <button
              key={format.id}
              type="button"
              className="erp-export-option"
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

export function TeacherPortalExportButton({
  title,
  leadPrimary,
  leadSecondary,
  onExport,
  className = "erp-btn erp-btn--secondary erp-btn--sm"
}: {
  title: string;
  leadPrimary: string;
  leadSecondary: string;
  onExport: (format: TeacherPortalExportFormat) => Promise<void>;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        Export
      </button>
      <TeacherPortalExportDialog
        open={open}
        title={title}
        leadPrimary={leadPrimary}
        leadSecondary={leadSecondary}
        onClose={() => setOpen(false)}
        onExport={async (format) => {
          await onExport(format);
          setOpen(false);
        }}
      />
    </>
  );
}
