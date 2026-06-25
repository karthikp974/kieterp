import { useCallback, useEffect, useMemo, useState } from "react";
import { Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { readApiError } from "../shared/read-api-error";
import { useToast } from "../shared/toast-context";
import type { HtpoResultsSetup, HtpoResultsViewRow } from "./htpo-results-types";
import { TpCard } from "./teacher-portal-ui";

export function HtpoResultsViewCard({ setup }: { setup: HtpoResultsSetup | null }) {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [sectionId, setSectionId] = useState("");
  const [semesterNumber, setSemesterNumber] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<HtpoResultsViewRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!setup) return;
    const initial = setup.fixedSectionId ?? setup.sections[0]?.id ?? "";
    setSectionId(initial);
  }, [setup]);

  const loadView = useCallback(async () => {
    if (!sectionId) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (semesterNumber) params.set("semesterNumber", String(semesterNumber));
      const res = await authFetch(`/api/portals/teacher/results/sections/${sectionId}/view?${params.toString()}`);
      if (!res.ok) throw new Error(await readApiError(res, "Could not load results."));
      const data = (await res.json()) as { rows: HtpoResultsViewRow[]; section: { semesterNumber: number } };
      setRows(data.rows);
      if (!semesterNumber) setSemesterNumber(data.section.semesterNumber);
    } catch (error) {
      setRows([]);
      showToast(error instanceof Error ? error.message : "Could not load results.", "error");
    } finally {
      setLoading(false);
    }
  }, [authFetch, sectionId, search, semesterNumber, showToast]);

  useEffect(() => {
    void loadView();
  }, [loadView]);

  const sectionOptions = setup?.sections ?? [];
  const showSectionSelect = setup?.mode === "htpo" && sectionOptions.length > 1;

  const grouped = useMemo(() => {
    const map = new Map<string, HtpoResultsViewRow[]>();
    for (const row of rows) {
      const list = map.get(row.studentProfileId) ?? [];
      list.push(row);
      map.set(row.studentProfileId, list);
    }
    return [...map.values()];
  }, [rows]);

  if (!setup?.sections.length) {
    return (
      <TpCard className="htpo-results-view-card">
        <p className="htpo-results-empty">No sections available for results in your scope.</p>
      </TpCard>
    );
  }

  return (
    <TpCard className="htpo-results-view-card">
      <header className="htpo-results-card-head">
        <h2 className="htpo-results-card-title">View results</h2>
      </header>

      <div className="htpo-results-view-filters">
        {showSectionSelect ? (
          <label className="htpo-results-filter">
            <span className="htpo-results-filter-label">Section</span>
            <select className="htpo-results-select" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              {sectionOptions.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="htpo-results-filter htpo-results-filter--search">
          <span className="htpo-results-filter-label">Search</span>
          <input
            className="db-input"
            placeholder="Name or roll number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>

      {!loading && grouped.length ? (
        <div className="htpo-results-view-student-actions">
          {grouped.map((studentRows) => {
            const student = studentRows[0];
            return (
              <div key={student.studentProfileId} className="htpo-results-view-student-row">
                <span className="htpo-results-view-student-label">
                  {student.rollNumber} — {student.fullName}
                </span>
                <button
                  type="button"
                  className="htpo-results-info-btn"
                  aria-label={`View all results for ${student.fullName}`}
                  title="View all semesters"
                  onClick={() => void navigate(`/teacher/results/students/${student.studentProfileId}`)}
                >
                  <Info size={16} aria-hidden />
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {loading ? <p className="htpo-results-empty">Loading results…</p> : null}

      {!loading && grouped.length ? (
        <div className="htpo-results-table-wrap">
          <table className="htpo-results-table">
            <thead>
              <tr>
                <th>Roll no</th>
                <th>Name</th>
                <th>Sub code</th>
                <th>Sub name</th>
                <th>Internals</th>
                <th>Grade</th>
                <th>Credits</th>
                <th>SGPA</th>
                <th>CGPA</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((studentRows) =>
                studentRows.map((row, index) => (
                  <tr key={`${row.studentProfileId}-${row.subjectCode ?? "empty"}-${index}`}>
                    <td>{row.rollNumber}</td>
                    <td>{row.fullName}</td>
                    <td>{row.subjectCode ?? "—"}</td>
                    <td>{row.subjectName ?? "—"}</td>
                    <td>{row.internals ?? "—"}</td>
                    <td>{row.grade ?? "—"}</td>
                    <td>{row.credits ?? "—"}</td>
                    <td>{row.sgpa ?? "—"}</td>
                    <td>{row.cgpa ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loading && !grouped.length ? <p className="htpo-results-empty">No results found for this section.</p> : null}
    </TpCard>
  );
}
