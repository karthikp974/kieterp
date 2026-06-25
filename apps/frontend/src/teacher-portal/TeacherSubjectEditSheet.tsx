import { X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { readPortalTheme, useOptionalPortalTheme } from "../shared/portal-theme";
import { useTeacherPortalSheetLock } from "./use-teacher-portal-sheet-lock";

type EditSubject = {
  id: string;
  subjectName: string;
  subjectCode: string;
};

export function TeacherSubjectEditSheet({
  open,
  subject,
  saving,
  onClose,
  onSave
}: {
  open: boolean;
  subject: EditSubject | null;
  saving: boolean;
  onClose: () => void;
  onSave: (values: { subjectName: string; subjectCode: string }) => void;
}) {
  const portalTheme = useOptionalPortalTheme();
  const themeMode = portalTheme?.mode ?? readPortalTheme();
  const [form, setForm] = useState({ subjectName: "", subjectCode: "" });

  useTeacherPortalSheetLock(open, onClose);

  useEffect(() => {
    if (open && subject) {
      setForm({ subjectName: subject.subjectName, subjectCode: subject.subjectCode });
    }
  }, [open, subject]);

  if (!open || !subject || typeof document === "undefined") return null;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.subjectName.trim() || !form.subjectCode.trim()) return;
    onSave({ subjectName: form.subjectName.trim(), subjectCode: form.subjectCode.trim() });
  }

  return createPortal(
    <div
      className="portal-root teacher-portal-root tp-portal-sheet-overlay"
      data-portal-theme={themeMode}
      role="presentation"
      onClick={onClose}
    >
      <section
        className="tp-portal-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tp-subject-edit-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tp-portal-sheet-head">
          <h2 id="tp-subject-edit-title">Edit subject</h2>
          <button type="button" className="tp-portal-sheet-close" aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <form className="tp-portal-sheet-body" onSubmit={handleSubmit}>
          <label className="db-field tp-syllabus-field">
            <span>Subject name</span>
            <input
              className="db-input"
              value={form.subjectName}
              placeholder="e.g. Data Structures"
              onChange={(event) => setForm({ ...form, subjectName: event.target.value })}
              required
            />
          </label>
          <label className="db-field tp-syllabus-field">
            <span>Subject ID / Subject code</span>
            <input
              className="db-input"
              value={form.subjectCode}
              placeholder="e.g. R231205"
              onChange={(event) => setForm({ ...form, subjectCode: event.target.value })}
              required
            />
          </label>
          <div className="tp-portal-sheet-actions">
            <button type="button" className="db-wf-btn" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="db-wf-btn db-wf-btn--primary" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body
  );
}
