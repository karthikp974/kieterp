import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { useToast } from "../shared/toast-context";
import { formatFeedbackDateTime, formatFeedbackFormType } from "./feedback/format-feedback-date";
import { StudentFeedbackQuestionField } from "./feedback/StudentFeedbackQuestionField";
import { StudentPortalFeedbackFormSkeleton } from "./feedback/StudentPortalFeedbackFormSkeleton";
import type { StudentFeedbackDetailResponse, StudentFeedbackQuestion } from "./feedback/student-feedback-types";
import {
  answersFromSubmission,
  buildSubmitPayload,
  validateFeedbackAnswers
} from "./feedback/validate-feedback-answers";
import { dispatchStudentNotificationsRefresh } from "./student-portal-notification-events";

async function readError(response: Response) {
  const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
  const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
  return new Error(message || "Request failed.");
}

export function StudentPortalFeedbackFillPage() {
  const { formId } = useParams<{ formId: string }>();
  const navigate = useNavigate();
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [detail, setDetail] = useState<StudentFeedbackDetailResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!formId) return;
    setLoading(true);
    try {
      const res = await authFetch(`/api/portals/student/feedback/forms/${encodeURIComponent(formId)}`);
      if (!res.ok) throw await readError(res);
      const data = (await res.json()) as StudentFeedbackDetailResponse;
      setDetail(data);
      setAnswers(answersFromSubmission(data.form.questions, data.submission));
      setFieldErrors({});
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not load form.", "error");
      navigate("/student/feedback");
    } finally {
      setLoading(false);
    }
  }, [authFetch, formId, navigate, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const readOnly = detail?.readOnly ?? true;
  const canSubmit = detail?.canSubmit ?? false;

  const statusBanner = useMemo(() => {
    if (!detail) return null;
    if (detail.lifecycleStatus === "SUBMITTED" && readOnly) {
      return detail.submission
        ? `Submitted on ${formatFeedbackDateTime(detail.submission.submittedAt)}. Responses are read-only.`
        : "This form has been submitted.";
    }
    if (detail.lifecycleStatus === "EXPIRED") {
      return "This form has closed. You can review questions and your submission only.";
    }
    if (detail.lifecycleStatus === "UPCOMING") {
      return `Opens on ${formatFeedbackDateTime(detail.form.startsAt)}.`;
    }
    return null;
  }, [detail, readOnly]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!formId || !detail || !canSubmit) return;

    const questions = detail.form.questions;
    const validationError = validateFeedbackAnswers(questions, answers);
    if (validationError) {
      showToast(validationError, "error");
      const nextErrors: Record<string, string> = {};
      for (const q of questions) {
        if (q.required) {
          const err = validateFeedbackAnswers([q], answers);
          if (err) nextErrors[q.id] = err.replace(/^Please (answer|rate): /, "");
        }
      }
      setFieldErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      const res = await authFetch(`/api/portals/student/feedback/forms/${encodeURIComponent(formId)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: buildSubmitPayload(questions, answers) })
      });
      if (!res.ok) throw await readError(res);
      showToast("Feedback submitted successfully.", "success");
      dispatchStudentNotificationsRefresh();
      navigate("/student/feedback");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Submit failed.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !detail) {
    return <StudentPortalFeedbackFormSkeleton />;
  }

  const { form } = detail;
  const typeLabel = formatFeedbackFormType(form.formType, form.customType);

  return (
    <div className="sp-fb sp-fb--form">
      <header className="sp-fb-head sp-fb-head--form">
        <Link to="/student/feedback" className="sp-fb-back">
          ← Back to feedback
        </Link>
        <h2 className="sp-fb-page-title">{form.title}</h2>
        <p className="sp-fb-page-sub">{typeLabel}</p>
      </header>

      {statusBanner ? <p className="sp-fb-banner">{statusBanner}</p> : null}

      <div className="sp-fb-form-intro">
        <p className="sp-fb-form-desc">{form.description}</p>
        <dl className="sp-fb-form-dates">
          <div>
            <dt>Opens</dt>
            <dd>{formatFeedbackDateTime(form.startsAt)}</dd>
          </div>
          <div>
            <dt>Closes</dt>
            <dd>{formatFeedbackDateTime(form.endsAt)}</dd>
          </div>
          <div>
            <dt>Assigned by</dt>
            <dd>{form.assignedBy}</dd>
          </div>
        </dl>
      </div>

      <form className="sp-fb-form" onSubmit={(e) => void handleSubmit(e)} noValidate>
        {form.questions.map((q: StudentFeedbackQuestion) => (
          <StudentFeedbackQuestionField
            key={q.id}
            question={q}
            value={answers[q.id]}
            readOnly={readOnly}
            error={fieldErrors[q.id]}
            onChange={(v) => {
              setAnswers((prev) => ({ ...prev, [q.id]: v }));
              setFieldErrors((prev) => {
                const next = { ...prev };
                delete next[q.id];
                return next;
              });
            }}
          />
        ))}

        {canSubmit ? (
          <button type="submit" className="sp-fb-btn sp-fb-btn--primary sp-fb-submit" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit feedback"}
          </button>
        ) : null}
      </form>
    </div>
  );
}
