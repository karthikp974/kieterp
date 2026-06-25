import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../shared/PageHeader";
import { RequireTeacherModule } from "../RequireTeacherModule";

export function TeacherPortalFeedbackPage() {
  const navigate = useNavigate();

  return (
    <RequireTeacherModule moduleKey="feedback">
      <PageHeader
        eyebrow="Teacher portal"
        title="Feedback"
        description="Create and manage feedback forms for audiences in your assigned scope."
      />
      <section className="db-section">
        <h2>Feedback workflows</h2>
        <p className="mb-4 text-sm text-[color:var(--erp-muted)]">
          These tools use the same ERP feedback module as admin, with backend permission checks on every action.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="db-wf-btn db-wf-btn--primary" onClick={() => void navigate("/feedback/create-feedback-form")}>
            Create form
          </button>
          <button type="button" className="db-wf-btn" onClick={() => void navigate("/feedback/active-forms")}>
            Active forms
          </button>
          <button type="button" className="db-wf-btn" onClick={() => void navigate("/feedback/feedback-reports")}>
            Reports
          </button>
        </div>
      </section>
    </RequireTeacherModule>
  );
}
