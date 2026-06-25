import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { useToast } from "../../shared/toast-context";
import { loadHtpoMarkSetup } from "../htpo-mark-attendance-api";
import { useTeacherPortalHeaderTitle } from "../teacher-portal-header-context";
import { RequireTeacherModule } from "../RequireTeacherModule";
import { TpCard } from "../teacher-portal-ui";

type AttendanceStatus = "PRESENT" | "ABSENT";

function AttendanceStatusToggle({
  value,
  label,
  onChange
}: {
  value: AttendanceStatus;
  label: string;
  onChange: (status: AttendanceStatus) => void;
}) {
  return (
    <div className="htpo-mark-att-toggle" role="group" aria-label={`Mark ${label}`}>
      <button
        type="button"
        className={`htpo-mark-att-toggle__btn htpo-mark-att-toggle__btn--present${value === "PRESENT" ? " is-active" : ""}`}
        aria-pressed={value === "PRESENT"}
        onClick={() => onChange("PRESENT")}
      >
        Present
      </button>
      <button
        type="button"
        className={`htpo-mark-att-toggle__btn htpo-mark-att-toggle__btn--absent${value === "ABSENT" ? " is-active" : ""}`}
        aria-pressed={value === "ABSENT"}
        onClick={() => onChange("ABSENT")}
      >
        Absent
      </button>
    </div>
  );
}

export function HtpoMarkAttendancePage() {
  const { sectionId } = useParams<{ sectionId: string }>();
  const navigate = useNavigate();
  const { authFetch } = useAuth();
  const { showToast } = useToast();

  const [setup, setSetup] = useState<Awaited<ReturnType<typeof loadHtpoMarkSetup>> | null>(null);
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sectionId) return;
    let alive = true;
    setLoading(true);
    void loadHtpoMarkSetup(authFetch, sectionId)
      .then((json) => {
        if (!alive) return;
        setSetup(json);
        setStatuses(Object.fromEntries(json.students.map((student) => [student.id, "PRESENT" as AttendanceStatus])));
        setError(null);
      })
      .catch((err) => {
        if (!alive) return;
        setSetup(null);
        setError(err instanceof Error ? err.message : "Unable to load section roster.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [authFetch, sectionId]);

  const absentCount = useMemo(
    () => (setup ? setup.students.filter((student) => (statuses[student.id] ?? "PRESENT") === "ABSENT").length : 0),
    [setup, statuses]
  );

  useTeacherPortalHeaderTitle(loading ? "Loading…" : (setup?.section.label ?? "Mark attendance"));

  function setAll(status: AttendanceStatus) {
    if (!setup) return;
    setStatuses(Object.fromEntries(setup.students.map((student) => [student.id, status])));
  }

  async function submitAttendance() {
    if (!setup) return;
    setSubmitting(true);
    try {
      const response = await authFetch("/api/attendance/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: setup.scope,
          attendanceDate: setup.attendanceDate,
          entries: setup.students.map((student) => ({
            studentProfileId: student.id,
            status: statuses[student.id] ?? "ABSENT"
          }))
        })
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? "Unable to mark attendance.");
      }
      showToast("Attendance marked");
      void navigate("/teacher/attendance");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Unable to mark attendance.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <RequireTeacherModule moduleKey="attendance">
      <div className="htpo-mark-att-page">
        {loading ? <p className="db-empty">Loading students…</p> : null}
        {error ? <p className="db-empty">{error}</p> : null}

        {setup && !loading ? (
          <TpCard className="htpo-mark-att-page__card">
            <div className="htpo-mark-att-toolbar">
              <p className="htpo-mark-att-toolbar__summary">
                {setup.students.length} student{setup.students.length === 1 ? "" : "s"} ·{" "}
                <span className="htpo-mark-att-toolbar__absent">{absentCount} absent</span>
              </p>
              <div className="htpo-mark-att-toolbar__actions">
                <button type="button" className="htpo-mark-att-quick-btn" onClick={() => setAll("PRESENT")}>
                  All present
                </button>
                <button type="button" className="htpo-mark-att-quick-btn" onClick={() => setAll("ABSENT")}>
                  All absent
                </button>
              </div>
            </div>

            <div className="htpo-section-att-table-wrap htpo-tt-table-scroll">
              <table className="htpo-section-att-table htpo-mark-att-table">
                <thead>
                  <tr>
                    <th>Roll number</th>
                    <th>Name</th>
                    <th>Mark</th>
                  </tr>
                </thead>
                <tbody>
                  {setup.students.map((student) => (
                    <tr key={student.id}>
                      <td className="htpo-section-att-table__primary">{student.rollNumber}</td>
                      <td>{student.fullName ?? "—"}</td>
                      <td>
                        <AttendanceStatusToggle
                          label={student.rollNumber}
                          value={statuses[student.id] ?? "PRESENT"}
                          onChange={(status) =>
                            setStatuses((current) => ({
                              ...current,
                              [student.id]: status
                            }))
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!setup.students.length ? <p className="db-empty">No active students in this section.</p> : null}
            <div className="htpo-mark-att-page__actions">
              <button
                type="button"
                className="db-wf-btn db-wf-btn--primary"
                disabled={submitting || !setup.students.length}
                onClick={() => void submitAttendance()}
              >
                {submitting ? "Submitting…" : "Submit attendance"}
              </button>
            </div>
          </TpCard>
        ) : null}
      </div>
    </RequireTeacherModule>
  );
}
