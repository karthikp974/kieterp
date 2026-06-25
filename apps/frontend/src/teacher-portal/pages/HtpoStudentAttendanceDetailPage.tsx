import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { HtpoAttendancePeriodSelect, htpoAttendanceQueryString } from "../HtpoAttendancePeriodSelect";
import { parseHtpoPeriodFromSearchParams } from "../htpo-attendance-period";
import { useTeacherPortalHeaderTitle } from "../teacher-portal-header-context";
import { RequireTeacherModule } from "../RequireTeacherModule";
import { TpCard, TpKpi, TpKpiGrid } from "../teacher-portal-ui";
import { formatIstLocaleDate } from "../../shared/ist-time";
import type { HtpoStudentAttendanceDetail } from "../teacher-portal-types";

export function HtpoStudentAttendanceDetailPage() {
  const { sectionId, studentProfileId } = useParams<{ sectionId: string; studentProfileId: string }>();
  const [searchParams] = useSearchParams();
  const { authFetch } = useAuth();

  const [period, setPeriod] = useState(() => parseHtpoPeriodFromSearchParams(searchParams));
  const [data, setData] = useState<HtpoStudentAttendanceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => htpoAttendanceQueryString(period), [period]);

  useEffect(() => {
    if (!sectionId || !studentProfileId) return;
    let alive = true;
    setLoading(true);
    void authFetch(`/api/portals/teacher/htpo/sections/${sectionId}/students/${studentProfileId}?${query}`)
      .then(async (res) => {
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message ?? "Unable to load student attendance.");
        }
        return (await res.json()) as HtpoStudentAttendanceDetail;
      })
      .then((json) => {
        if (alive) {
          setData(json);
          setError(null);
        }
      })
      .catch((err) => {
        if (alive) {
          setData(null);
          setError(err instanceof Error ? err.message : "Unable to load student attendance.");
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [authFetch, sectionId, studentProfileId, query]);

  useTeacherPortalHeaderTitle(loading ? "Loading…" : (data?.student.fullName ?? "Student"));

  return (
    <RequireTeacherModule moduleKey="attendance">
      <div className="htpo-student-att-detail">
        {loading ? <p className="db-empty">Loading student attendance…</p> : null}
        {error ? <p className="db-empty">{error}</p> : null}

        {data && !loading ? (
          <div className="htpo-student-att-detail__body">
            <div className="htpo-student-att-detail__hero">
              <div>
                <p className="htpo-student-att-detail__roll">{data.student.rollNumber}</p>
                <p className="htpo-student-att-detail__section">{data.section.label}</p>
              </div>
              <HtpoAttendancePeriodSelect
                value={period}
                yearOptions={data.yearOptions}
                onChange={setPeriod}
              />
            </div>

            <TpKpiGrid>
              <TpKpi label="Attendance" value={data.summary.percentage == null ? "—" : `${data.summary.percentage}%`} sub={data.period.label} />
              <TpKpi label="Present days" value={data.summary.presentDays} sub={data.summary.daysLabel} />
              <TpKpi label="Working days" value={data.summary.workingDays} sub="Campus working days" />
              <TpKpi label="Absent days" value={data.summary.absentDays} sub="In selected period" />
            </TpKpiGrid>

            {data.bySubject.length ? (
              <TpCard>
                <h2 className="tp-card-title mb-3">By subject</h2>
                <div className="htpo-student-att-subject-grid">
                  {data.bySubject.map((row) => (
                    <div key={row.subject} className="htpo-student-att-subject-card">
                      <p className="htpo-student-att-subject-card__title">{row.subject}</p>
                      <p className="htpo-student-att-subject-card__value">
                        {row.percentage == null ? "—" : `${row.percentage}%`}
                      </p>
                      <p className="htpo-student-att-subject-card__meta">
                        {row.present} / {row.total} present
                      </p>
                    </div>
                  ))}
                </div>
              </TpCard>
            ) : null}

            <TpCard>
              <h2 className="tp-card-title mb-3">Session history</h2>
              {data.sessions.length ? (
                <div className="htpo-section-att-table-wrap htpo-tt-table-scroll">
                  <table className="htpo-section-att-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Subject</th>
                        <th>Status</th>
                        <th>Marked by</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sessions.map((row) => (
                        <tr key={row.id}>
                          <td>{formatIstLocaleDate(row.date)}</td>
                          <td className="htpo-section-att-table__primary">{row.subject}</td>
                          <td className={row.status === "PRESENT" ? "htpo-att-status--present" : "htpo-att-status--absent"}>
                            {row.status === "PRESENT" ? "Present" : "Absent"}
                          </td>
                          <td className="htpo-section-att-table__muted">{row.markedBy}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="db-empty">No attendance recorded in this date range.</p>
              )}
            </TpCard>
          </div>
        ) : null}
      </div>
    </RequireTeacherModule>
  );
}
