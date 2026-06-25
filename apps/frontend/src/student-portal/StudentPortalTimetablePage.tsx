import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/auth-context";
import { useToast } from "../shared/toast-context";
import { StudentSectionTimetableGrid } from "./StudentSectionTimetableGrid";
import type { StudentTimetableResponse } from "./student-timetable-types";
import { StudentPortalTimetableSkeleton } from "./StudentPortalTimetableSkeleton";

export function StudentPortalTimetablePage() {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const [data, setData] = useState<StudentTimetableResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/portals/student/timetable");
      if (!res.ok) throw new Error("bad");
      setData((await res.json()) as StudentTimetableResponse);
    } catch {
      showToast("Could not load timetable.", "error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [authFetch, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return <StudentPortalTimetableSkeleton />;
  }

  if (!data) {
    return <p className="sp-dash-error">Timetable could not be loaded.</p>;
  }

  return (
    <div className="sp-tt">
      <StudentSectionTimetableGrid sectionLabel={data.section.label} days={data.days} rows={data.rows} />
    </div>
  );
}
