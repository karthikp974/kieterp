import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { readApiError } from "../shared/read-api-error";
import { usePortalConfirm } from "../shared/PortalConfirmDialog";
import { useToast } from "../shared/toast-context";
import type { HtpoSubjectTeacherList } from "./htpo-timetable-assign-types";
import { TpCard } from "./teacher-portal-ui";

export function HtpoAssignTeachersCard({ enabled = true }: { enabled?: boolean }) {
  const { authFetch } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirm, dialog: confirmDialog } = usePortalConfirm();
  const [rows, setRows] = useState<HtpoSubjectTeacherList["rows"]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadRows = useCallback(async () => {
    if (!enabled) {
      setRows([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await authFetch("/api/portals/teacher/timetable/subject-teachers");
      if (!res.ok) {
        throw new Error(await readApiError(res, "Could not load subject teachers."));
      }
      const data = (await res.json()) as HtpoSubjectTeacherList;
      setRows(data.rows);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : "Could not load subject teachers.");
    } finally {
      setLoading(false);
    }
  }, [authFetch, enabled]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  function openAssign(row?: HtpoSubjectTeacherList["rows"][number]) {
    const params = new URLSearchParams();
    if (row?.subjectId) params.set("pickSubjectId", row.subjectId);
    if (row?.sectionId) params.set("pickSectionId", row.sectionId);
    if (row?.stpoTeacherId) params.set("teacherProfileId", row.stpoTeacherId);
    const query = params.toString();
    void navigate(query ? `/teacher/timetable/assign-teacher?${query}` : "/teacher/timetable/assign-teacher");
  }

  async function removeAssignment(row: HtpoSubjectTeacherList["rows"][number]) {
    if (!row.stpoTeacherId) return;
    const confirmed = await confirm({
      title: "Remove teacher assignment?",
      message: "This unassigns the STPO from this subject for the section.",
      itemName: `${row.subjectName} · ${row.sectionLabel}`,
      confirmLabel: "Remove assignment"
    });
    if (!confirmed) return;

    setRemovingId(row.id);
    try {
      const res = await authFetch("/api/portals/teacher/timetable/subject-teachers/unassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId: row.sectionId, subjectId: row.subjectId })
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, "Could not remove assignment."));
      }
      showToast("Teacher assignment removed.", "success");
      void loadRows();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not remove assignment.", "error");
    } finally {
      setRemovingId(null);
    }
  }

  if (!enabled) return null;

  return (
    <TpCard className="htpo-assign-teachers-card">
      <header className="htpo-assign-teachers-head">
        <h2 className="htpo-assign-teachers-title">Assign teachers to subjects</h2>
        <button type="button" className="htpo-assign-teachers-add-btn" onClick={() => openAssign()}>
          <Plus size={14} aria-hidden />
          Assign teacher
        </button>
      </header>

      {loading ? (
        <p className="htpo-assign-teachers-loading">Loading subject teachers…</p>
      ) : error ? (
        <p className="htpo-assign-teachers-empty">{error}</p>
      ) : !rows.length ? (
        <p className="htpo-assign-teachers-empty">No section subjects found in your HTPO scope yet.</p>
      ) : (
        <div className="htpo-assign-teachers-table-wrap htpo-tt-table-scroll">
          <table className="htpo-assign-teachers-table">
            <thead>
              <tr>
                <th scope="col">Subject</th>
                <th scope="col">Code</th>
                <th scope="col">Section</th>
                <th scope="col">STPO assigned</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="htpo-assign-teachers-subject">{row.subjectName}</td>
                  <td>
                    <span className="htpo-assign-teachers-code">{row.subjectCode}</span>
                  </td>
                  <td>{row.sectionLabel}</td>
                  <td className={row.stpoTeacherName ? "" : "htpo-assign-teachers-unassigned"}>
                    {row.stpoTeacherName ?? "Unassigned"}
                  </td>
                  <td>
                    <div className="htpo-assign-teachers-actions">
                      <button type="button" className="htpo-assign-teachers-action" onClick={() => openAssign(row)}>
                        {row.stpoTeacherName ? "Change" : "Assign"}
                      </button>
                      {row.stpoTeacherName ? (
                        <button
                          type="button"
                          className="htpo-assign-teachers-delete"
                          aria-label={`Remove assignment for ${row.subjectName}`}
                          disabled={removingId === row.id}
                          onClick={() => void removeAssignment(row)}
                        >
                          <Trash2 size={14} aria-hidden />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmDialog}
    </TpCard>
  );
}
