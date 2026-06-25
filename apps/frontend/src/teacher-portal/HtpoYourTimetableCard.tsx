import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/auth-context";
import { readApiError } from "../shared/read-api-error";
import type { HtpoYourTimetableList } from "./htpo-timetable-assign-types";
import { TpCard } from "./teacher-portal-ui";

export function HtpoYourTimetableCard() {
  const { authFetch } = useAuth();
  const [rows, setRows] = useState<HtpoYourTimetableList["rows"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch("/api/portals/teacher/timetable/yours");
      if (!res.ok) {
        throw new Error(await readApiError(res, "Could not load your timetable."));
      }
      const data = (await res.json()) as HtpoYourTimetableList;
      setRows(data.rows);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : "Could not load your timetable.");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  return (
    <TpCard className="htpo-your-tt-card">
      <header className="htpo-your-tt-head">
        <h2 className="htpo-your-tt-title">Your timetable</h2>
      </header>

      {loading ? (
        <p className="htpo-your-tt-loading">Loading your timetable…</p>
      ) : error ? (
        <p className="htpo-your-tt-empty">{error}</p>
      ) : !rows.length ? (
        <p className="htpo-your-tt-empty">No teaching slots assigned to you yet.</p>
      ) : (
        <div className="htpo-your-tt-table-wrap htpo-tt-table-scroll">
          <table className="htpo-your-tt-table">
            <thead>
              <tr>
                <th scope="col">Section</th>
                <th scope="col">Semester</th>
                <th scope="col">Subject</th>
                <th scope="col">Time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.sectionLabel}</td>
                  <td>{row.semesterLabel}</td>
                  <td className="htpo-your-tt-subject">{row.subjectName}</td>
                  <td>{row.timePeriod}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TpCard>
  );
}
