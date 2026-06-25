import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { HtpoAttendancePeriodSelect, formatWorkingDaysMeta, htpoAttendanceQueryString } from "../HtpoAttendancePeriodSelect";
import { HtpoStudentSearch } from "../HtpoStudentSearch";
import type { HtpoAttendancePeriodState } from "../htpo-attendance-period";
import { useTeacherPortalHeaderTitle } from "../teacher-portal-header-context";
import { RequireTeacherModule } from "../RequireTeacherModule";
import { TpCard } from "../teacher-portal-ui";
import { normalizeSectionAttendanceDetail } from "../htpo-section-attendance-api";
import type { HtpoSectionAttendanceDetail, HtpoSectionStudentAttendance } from "../teacher-portal-types";

export function HtpoSectionDetailPage() {
  const { sectionId } = useParams<{ sectionId: string }>();
  const navigate = useNavigate();
  const { authFetch } = useAuth();

  const [period, setPeriod] = useState<HtpoAttendancePeriodState>({ period: "this_semester" });
  const [belowPeriod, setBelowPeriod] = useState<HtpoAttendancePeriodState>({ period: "this_semester" });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [data, setData] = useState<HtpoSectionAttendanceDetail | null>(null);
  const [belowData, setBelowData] = useState<HtpoSectionStudentAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [belowLoading, setBelowLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 280);
    return () => window.clearTimeout(timer);
  }, [search]);

  const overviewQuery = useMemo(() => htpoAttendanceQueryString(period, debouncedSearch), [period, debouncedSearch]);
  const belowQuery = useMemo(() => htpoAttendanceQueryString(belowPeriod), [belowPeriod]);

  useEffect(() => {
    if (!sectionId) return;
    let alive = true;
    setLoading(true);
    void authFetch(`/api/portals/teacher/htpo/sections/${sectionId}?${overviewQuery}`)
      .then(async (res) => {
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message ?? "Unable to load section.");
        }
        return normalizeSectionAttendanceDetail(await res.json());
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
          setError(err instanceof Error ? err.message : "Unable to load section.");
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [authFetch, sectionId, overviewQuery]);

  useEffect(() => {
    if (!sectionId) return;
    let alive = true;
    setBelowLoading(true);
    void authFetch(`/api/portals/teacher/htpo/sections/${sectionId}?${belowQuery}`)
      .then(async (res) => {
        if (!res.ok) {
          const payload = (await res.json().catch(() => null)) as { message?: string } | null;
          throw new Error(payload?.message ?? "Unable to load below 75% list.");
        }
        return normalizeSectionAttendanceDetail(await res.json());
      })
      .then((json) => {
        if (alive) setBelowData(json.below75Percent);
      })
      .catch(() => {
        if (alive) setBelowData([]);
      })
      .finally(() => {
        if (alive) setBelowLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [authFetch, sectionId, belowQuery]);

  useTeacherPortalHeaderTitle(loading ? "Loading…" : (data?.section.label ?? "Section"));

  function openStudent(row: HtpoSectionStudentAttendance) {
    const query = htpoAttendanceQueryString(period);
    navigate(`/teacher/sections/${sectionId}/students/${row.studentProfileId}?${query}`, {
      state: { from: `/teacher/sections/${sectionId}` }
    });
  }

  return (
    <RequireTeacherModule moduleKey="attendance">
      <div className="htpo-section-detail">
        {loading ? <p className="db-empty">Loading section attendance…</p> : null}
        {error ? <p className="db-empty">{error}</p> : null}

        {data && !loading ? (
          <div className="htpo-section-detail-body">
            <TpCard className="htpo-section-att-card">
              <div className="htpo-section-att-card__head">
                <h2 className="tp-card-title">Attendance overview</h2>
                <HtpoAttendancePeriodSelect
                  value={period}
                  yearOptions={data.yearOptions}
                  onChange={setPeriod}
                />
              </div>
              <p className="htpo-section-att-card__meta">
                {data.period?.label ?? "This semester"} · {formatWorkingDaysMeta(data.period?.workingDays ?? 0)}
              </p>
              <HtpoStudentSearch students={data.students} value={search} onChange={setSearch} />
              {data.attendanceOverview.length ? (
                <div className="htpo-section-att-table-wrap htpo-tt-table-scroll">
                  <table className="htpo-section-att-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Roll number</th>
                        <th>Average</th>
                        <th>No of days</th>
                        <th>View</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.attendanceOverview.map((row) => (
                        <tr key={row.studentProfileId}>
                          <td className="htpo-section-att-table__primary">{row.fullName}</td>
                          <td>{row.rollNumber}</td>
                          <td>{formatPercent(row.percentage)}</td>
                          <td>{row.daysLabel}</td>
                          <td>
                            <button type="button" className="htpo-sections-view-btn" onClick={() => openStudent(row)}>
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="db-empty">No students match this search.</p>
              )}
            </TpCard>

            <TpCard className="htpo-section-att-card">
              <div className="htpo-section-att-card__head">
                <h2 className="tp-card-title">Below 75%</h2>
                <HtpoAttendancePeriodSelect
                  value={belowPeriod}
                  yearOptions={data.yearOptions}
                  onChange={setBelowPeriod}
                />
              </div>
              {belowLoading ? <p className="db-empty">Updating list…</p> : null}
              {!belowLoading && belowData.length ? (
                <div className="htpo-section-att-table-wrap htpo-tt-table-scroll">
                  <table className="htpo-section-att-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Roll number</th>
                        <th>Percentage</th>
                        <th>No of days</th>
                      </tr>
                    </thead>
                    <tbody>
                      {belowData.map((row) => (
                        <tr key={row.studentProfileId}>
                          <td className="htpo-section-att-table__primary">{row.fullName}</td>
                          <td>{row.rollNumber}</td>
                          <td className="htpo-section-att-table__warn">{formatPercent(row.percentage)}</td>
                          <td>{row.daysLabel}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {!belowLoading && !belowData.length ? (
                <p className="db-empty">No students below 75% for this period.</p>
              ) : null}
            </TpCard>
          </div>
        ) : null}
      </div>
    </RequireTeacherModule>
  );
}

function formatPercent(value: number | null) {
  return value == null ? "—" : `${value}%`;
}
