import { X } from "lucide-react";

import { useEffect, useState } from "react";

import { createPortal } from "react-dom";

import { useAuth } from "../auth/auth-context";

import { readPortalTheme, useOptionalPortalTheme } from "../shared/portal-theme";

import { useToast } from "../shared/toast-context";

import type { FeeSummaryResponse } from "./student-dashboard-types";

import { useStudentPortalSheetLock } from "./use-student-portal-sheet-lock";



function formatInr(n: number) {

  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);

}



export function StudentFeeSummaryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {

  const { authFetch } = useAuth();

  const { showToast } = useToast();

  const [data, setData] = useState<FeeSummaryResponse | null>(null);

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

    void authFetch("/api/portals/student/dashboard/fee-summary")

      .then(async (res) => {

        if (!res.ok) throw new Error("Unable to load fee summary.");

        return (await res.json()) as FeeSummaryResponse;

      })

      .then((json) => {

        if (alive) setData(json);

      })

      .catch(() => {

        showToast("Could not load fee summary.", "error");

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

        className="sp-dash-modal sp-dash-modal--wide"

        role="dialog"

        aria-modal="true"

        aria-labelledby="sp-fee-summary-title"

        onClick={(e) => e.stopPropagation()}

      >

        <header className="sp-dash-modal-head">

          <h2 id="sp-fee-summary-title">Fee summary</h2>

          <button type="button" className="sp-dash-modal-close" aria-label="Close" onClick={onClose}>

            <X size={20} />

          </button>

        </header>

        {loading || !data ? (

          <div className="sp-dash-modal-body">

            <div className="sp-dash-card-skel sp-dash-card-skel--banner">

              <span className="sp-dash-skel-pill" />

              <span className="sp-dash-skel-metric sp-dash-skel-metric--wide" />

            </div>

            <div className="sp-dash-history-skel">

              {Array.from({ length: 5 }).map((_, i) => (

                <div key={i} className="sp-dash-class-row-skel">

                  <span className="sp-dash-skel-block sp-dash-skel-subject sp-dash-skel-stretch" />

                  <span className="sp-dash-skel-block sp-dash-skel-time" />

                </div>

              ))}

            </div>

          </div>

        ) : (

          <div className="sp-dash-modal-body">

            <div className="sp-dash-fee-total">

              <p className="sp-dash-fee-total-label">Total outstanding</p>

              <p className="sp-dash-fee-total-value">{formatInr(data.totalOutstandingRupees)}</p>

            </div>

            <div className="sp-dash-table-wrap">

              <table className="sp-dash-table">

                <thead>

                  <tr>

                    <th>Fee</th>

                    <th>Due</th>

                    <th>Paid</th>

                    <th>Balance</th>

                    <th>Status</th>

                  </tr>

                </thead>

                <tbody>

                  {data.assignments.length === 0 ? (

                    <tr>

                      <td colSpan={5} className="sp-dash-table-empty">

                        No fee assignments on your account.

                      </td>

                    </tr>

                  ) : (

                    data.assignments.map((row) => (

                      <tr key={row.assignmentId}>

                        <td>{row.feeHeadName}</td>

                        <td>{formatInr(row.dueRupees)}</td>

                        <td>{formatInr(row.paidRupees)}</td>

                        <td className={row.balanceRupees > 0 ? "sp-dash-num-warn" : ""}>{formatInr(row.balanceRupees)}</td>

                        <td>{row.paymentStatus}</td>

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

