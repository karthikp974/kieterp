import { useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { readApiErrorMessage } from "../../shared/api-error";
import { useToast } from "../../shared/toast-context";
import { RequireTeacherModule } from "../RequireTeacherModule";
import { TeacherSyllabusManageEditor } from "../TeacherSyllabusManageEditor";
import { TeacherPortalModuleShell } from "../TeacherPortalModuleShell";
import { useTeacherPortal } from "../teacher-portal-context";
import { TEACHER_MODULE_SUBTITLES } from "../teacher-portal-module-copy";
import { teacherEligibleForSyllabus } from "../teacher-syllabus-types";
import type { TeacherSyllabusDetailResponse, TeacherSyllabusUnit } from "../teacher-syllabus-types";

export function TeacherPortalSyllabusManagePage() {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { dashboard, defaultPath } = useTeacherPortal();
  const [params] = useSearchParams();
  const roles = dashboard?.assignments.map((assignment) => assignment.role) ?? [];

  const subjectId = params.get("subjectId")?.trim() ?? "";
  const subjectLabel = params.get("label")?.trim() ?? "Selected subject";

  if (params.get("mode") === "create") {
    return <Navigate to="/teacher/syllabus" replace />;
  }
  const [units, setUnits] = useState<TeacherSyllabusUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!subjectId) {
      setUnits([]);
      setReady(true);
      return;
    }
    setLoading(true);
    try {
      const res = await authFetch(`/api/portals/teacher/syllabus/subjects/${subjectId}`);
      if (!res.ok) throw new Error(await readApiErrorMessage(res, "Could not load syllabus."));
      const data = (await res.json()) as TeacherSyllabusDetailResponse;
      if (!data.exists) {
        navigate("/teacher/syllabus", { replace: true });
        return;
      }
      setUnits(data.syllabus.units);
      setReady(true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not load syllabus.", "error");
      navigate("/teacher/syllabus", { replace: true });
    } finally {
      setLoading(false);
    }
  }, [authFetch, navigate, showToast, subjectId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  if (!subjectId) {
    return <Navigate to="/teacher/syllabus" replace />;
  }

  if (dashboard && !teacherEligibleForSyllabus(roles)) {
    return <Navigate to={defaultPath} replace />;
  }

  return (
    <RequireTeacherModule moduleKey="syllabus">
      <TeacherPortalModuleShell subtitle={TEACHER_MODULE_SUBTITLES.syllabus}>
        {loading || !ready ? (
          <p className="tp-syllabus-muted">Loading syllabus…</p>
        ) : (
          <TeacherSyllabusManageEditor
            mode="edit"
            subjectId={subjectId}
            subjectLabel={subjectLabel}
            initialUnits={units}
            onDone={() => navigate("/teacher/syllabus", { replace: false })}
          />
        )}
      </TeacherPortalModuleShell>
    </RequireTeacherModule>
  );
}
