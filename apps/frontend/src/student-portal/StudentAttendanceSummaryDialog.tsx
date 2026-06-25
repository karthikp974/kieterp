import { X } from "lucide-react";

import { useEffect, useState } from "react";

import { createPortal } from "react-dom";

import { useAuth } from "../auth/auth-context";

import { readPortalTheme, useOptionalPortalTheme } from "../shared/portal-theme";

import { useToast } from "../shared/toast-context";

import type { AttendanceSummaryResponse } from "./student-dashboard-types";

import { useStudentPortalSheetLock } from "./use-student-portal-sheet-lock";



function pctLabel(v: number | null) {

  if (v === null) return "—";

  return `${v}%`;

}



export function StudentAttendanceSummaryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {

  const { authFetch } = useAuth();

  const { showToast } = useToast();

  const [data, setData] = useState<AttendanceSummaryResponse | null>(null);

  const [loading, setLoading] = useState(false);

  const portalTheme = useOptionalPortalTheme();

  const themeMode = portalTheme?.mode ?? readPortalTheme();



  useStudentPortalSheetLock(open, onClose);



  useEffect(() => {

    if (!open) {

      setData(null);

      return;

    }

    let alive = true;

    setLoading(true);

    void authFetch("/api/portals/student/dashboard/attendance-summary?limit=90")

      .then(async (res) => {

        if (!res.ok) throw new Error("Unable to load attendance summary.");

        return (await res.json()) as AttendanceSummaryResponse;

      })

      .then((json) => {

        if (alive) setData(json);

      })

      .catch(() => {

        showToast("Could not load attendance summary.", "error");

        onClose();

      })

      .finally(() => {

        if (alive) setLoading(false);

      });

    return () => {

      alive = false;

    };

  }, [authFetch, onClose, open, showToast]);



  if (!open || typeof document === "undefined") return null;



  return createPortal(

    <div

      className="portal-root student-portal-root sp-dash-modal-overlay"

      data-portal-theme={themeMode}

      role="presentation"

      onClick={onClose}

    >

      <section

        className="sp-dash-modal"

        role="dialog"

        aria-modal="true"

        aria-labelledby="sp-attendance-summary-title"

        onClick={(e) => e.stopPropagation()}

      >

        <header className="sp-dash-modal-head">

          <h2 id="sp-attendance-summary-title">Attendance summary</h2>

          <button type="button" className="sp-dash-modal-close" aria-label="Close" onClick={onClose}>

            <X size={20} />

          </button>

        </header>

        {loading || !data ? (

          <div className="sp-dash-modal-body">

            <div className="sp-dash-modal-metrics">

              <div className="sp-dash-card-skel sp-dash-card-skel--inline">

                <span className="sp-dash-skel-pill" />

                <span className="sp-dash-skel-metric" />

              </div>

              <div className="sp-dash-card-skel sp-dash-card-skel--inline">

                <span className="sp-dash-skel-pill" />

                <span className="sp-dash-skel-metric" />

              </div>

            </div>

            <div className="sp-dash-history-skel">

              {Array.from({ length: 6 }).map((_, i) => (

                <div key={i} className="sp-dash-class-row-skel">

                  <span className="sp-dash-skel-block sp-dash-skel-time" />

                  <span className="sp-dash-skel-block sp-dash-skel-subject" />

                </div>

              ))}

            </div>

          </div>

        ) : (

          <div className="sp-dash-modal-body">

            <div className="sp-dash-modal-metrics">

              <div className="sp-dash-stat-card">

                <p className="sp-dash-stat-label">Semester (this section)</p>

                <p className="sp-dash-stat-value">{pctLabel(data.semester.percentage)}</p>

                <p className="sp-dash-stat-meta">

                  {data.semester.presentCount} present / {data.semester.recordedSessions} days recorded

                </p>

              </div>

              <div className="sp-dash-stat-card">

                <p className="sp-dash-stat-label">This month ({data.thisMonth.monthLabel})</p>

                <p className="sp-dash-stat-value">{pctLabel(data.thisMonth.percentage)}</p>

                <p className="sp-dash-stat-meta">

                  {data.thisMonth.presentCount} present / {data.thisMonth.recordedSessions} days recorded

                </p>

              </div>

            </div>

            <h3 className="sp-dash-subheading">Attendance history</h3>

            <div className="sp-dash-table-wrap">

              <table className="sp-dash-table">

                <thead>

                  <tr>

                    <th>Date</th>

                    <th>Status</th>

                  </tr>

                </thead>

                <tbody>

                  {data.history.length === 0 ? (

                    <tr>

                      <td colSpan={2} className="sp-dash-table-empty">

                        No attendance records yet for your section.

                      </td>

                    </tr>

                  ) : (

                    data.history.map((row) => (

                      <tr key={row.id}>

                        <td>{row.date}</td>

                        <td>

                          <span className={row.status === "PRESENT" ? "sp-dash-badge sp-dash-badge--ok" : "sp-dash-badge sp-dash-badge--bad"}>{row.status}</span>

                        </td>

                      </tr>

                    ))

                  )}

                </tbody>

              </table>

            </div>

          </div>

        )}

      </section>

    </div>,

    document.body

  );

}

