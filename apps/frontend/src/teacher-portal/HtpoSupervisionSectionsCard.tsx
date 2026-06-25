import { useNavigate } from "react-router-dom";
import type { HtpoSupervisionSection } from "./teacher-portal-types";
import { TpCard, TpCardHead } from "./teacher-portal-ui";

export function HtpoSupervisionSectionsCard({
  sections,
  returnTo = "/teacher"
}: {
  sections: HtpoSupervisionSection[];
  returnTo?: string;
}) {
  const navigate = useNavigate();

  return (
    <TpCard className="htpo-sections-card">
      <TpCardHead title="Sections under your supervision" />
      {sections.length ? (
        <div className="htpo-sections-table-wrap htpo-tt-table-scroll">
          <table className="htpo-sections-table">
            <thead>
              <tr>
                <th>Section</th>
                <th>Students</th>
                <th>Class teacher</th>
                <th>Latest attendance</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {sections.map((row) => (
                <tr key={row.id}>
                  <td className="htpo-sections-table__primary">{row.label}</td>
                  <td>{row.studentCount}</td>
                  <td className="htpo-sections-table__muted">{row.classTeacherName}</td>
                  <td className="htpo-sections-table__primary">
                    {row.latestAttendance
                      ? `${row.latestAttendance.percentage}% (${row.latestAttendance.present}/${row.latestAttendance.total})`
                      : "—"}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="htpo-sections-view-btn"
                      onClick={() => navigate(`/teacher/sections/${row.id}`, { state: { from: returnTo } })}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="db-empty">No active sections in your HTPO scope yet.</p>
      )}
    </TpCard>
  );
}
