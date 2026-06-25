import { Megaphone, CalendarClock, IndianRupee, ClipboardList } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { useToast } from "../shared/toast-context";
import { formatIstLocaleDate } from "../shared/ist-time";
import type { StudentDashboardResponse } from "./student-dashboard-types";
import { StudentPortalDashboardSkeleton } from "./StudentPortalDashboardSkeleton";

const AttendanceSummaryDialog = lazy(() =>
  import("./StudentAttendanceSummaryDialog").then((m) => ({ default: m.StudentAttendanceSummaryDialog }))
);
const FeeSummaryDialog = lazy(() => import("./StudentFeeSummaryDialog").then((m) => ({ default: m.StudentFeeSummaryDialog })));

function formatInr(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

function pctDisplay(v: number | null) {
  if (v === null) return "—";
  return `${v}%`;
}

function ModalRouteFallback() {
  return (
    <div className="sp-dash-modal-overlay" aria-busy="true">
      <div className="sp-dash-modal">
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
        </div>
      </div>
    </div>
  );
}

const quickRows: { to: string; label: string }[][] = [
  [
    { to: "/student/academics/timetable", label: "Timetable" },
    { to: "/student/academics/attendance", label: "Attendance" }
  ],
  [
    { to: "/student/academics/marks", label: "My Marks" },
    { to: "/student/academics/subjects", label: "My Subjects" }
  ],
  [
    { to: "/student/fees/status", label: "Pay Fees" },
    { to: "/student/engage/announcements", label: "Announcements" }
  ]
];

export function StudentPortalDashboardPage() {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const [data, setData] = useState<StudentDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [feeOpen, setFeeOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void authFetch("/api/portals/student/dashboard")
      .then(async (res) => {
        if (!res.ok) throw new Error("Unable to load dashboard.");
        return (await res.json()) as StudentDashboardResponse;
      })
      .then((json) => {
        if (alive) setData(json);
      })
      .catch(() => {
        showToast("Could not load dashboard.", "error");
        if (alive) setData(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [authFetch, showToast]);

  if (loading || !data) {
    return loading ? <StudentPortalDashboardSkeleton /> : <p className="sp-dash-error">Dashboard could not be loaded.</p>;
  }

  const subline = `${data.section.campusName} · ${data.section.departmentName} · ${data.section.branchName} · ${data.section.batchCode} · ${data.section.classLabel} · ${data.section.code ?? data.section.name}`;

  return (
    <div className="sp-dash">
      <header className="sp-dash-welcome">
        <p className="sp-dash-welcome-label">Welcome,</p>
        <h2 className="sp-dash-welcome-name">{data.student.fullName}</h2>
        <p className="sp-dash-welcome-meta">
          Roll <strong>{data.student.rollNumber}</strong>
          <span className="sp-dash-welcome-dot" aria-hidden>
            ·
          </span>
          <span>{subline}</span>
        </p>
      </header>

      <div className="sp-dash-top-grid">
        <button type="button" className="sp-dash-top-card sp-dash-top-card--click" onClick={() => setAttendanceOpen(true)}>
          <div className="sp-dash-top-card-head">
            <span className="sp-dash-top-card-icon" aria-hidden>
              <ClipboardList size={20} />
            </span>
            <span className="sp-dash-top-card-title">Attendance</span>
          </div>
          <p className="sp-dash-top-card-metric">{pctDisplay(data.attendance.thisMonthPercentage)}</p>
          <p className="sp-dash-top-card-sub">This month · tap for details</p>
        </button>

        <button type="button" className="sp-dash-top-card sp-dash-top-card--click" onClick={() => setFeeOpen(true)}>
          <div className="sp-dash-top-card-head">
            <span className="sp-dash-top-card-icon" aria-hidden>
              <IndianRupee size={20} />
            </span>
            <span className="sp-dash-top-card-title">Outstanding fees</span>
          </div>
          <p className="sp-dash-top-card-metric">{formatInr(data.fees.outstandingRupees)}</p>
          <p className="sp-dash-top-card-sub">Pending balance · tap for summary</p>
        </button>
      </div>

      <section className="sp-dash-section" aria-labelledby="sp-today-classes">
        <div className="sp-dash-section-head">
          <CalendarClock size={20} className="sp-dash-section-icon" aria-hidden />
          <h3 id="sp-today-classes" className="sp-dash-section-title">
            Today&apos;s classes
          </h3>
        </div>
        {data.todayClasses.length === 0 ? (
          <p className="sp-dash-empty">No timetable slots for your section today.</p>
        ) : (
          <ul className="sp-dash-class-list">
            {data.todayClasses.map((slot) => (
              <li key={slot.id} className="sp-dash-class-row">
                <div className="sp-dash-class-time">
                  {slot.startTime} – {slot.endTime}
                </div>
                <div className="sp-dash-class-main">
                  <p className="sp-dash-class-subject">{slot.subjectName}</p>
                  <p className="sp-dash-class-meta">
                    {slot.teacherName ? <span>{slot.teacherName}</span> : null}
                    {slot.room ? (
                      <>
                        {slot.teacherName ? <span className="sp-dash-welcome-dot"> · </span> : null}
                        <span>Room {slot.room}</span>
                      </>
                    ) : null}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="sp-dash-section" aria-labelledby="sp-quick-actions">
        <h3 id="sp-quick-actions" className="sp-dash-section-title sp-dash-section-title--plain">
          Quick actions
        </h3>
        <div className="sp-dash-quick-wrap">
          {quickRows.map((row, ri) => (
            <div key={ri} className="sp-dash-quick-row">
              {row.map((item) => (
                <Link key={item.to} to={item.to} className="sp-dash-quick-btn">
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="sp-dash-section" aria-labelledby="sp-recent-announcements">
        <div className="sp-dash-section-head">
          <Megaphone size={20} className="sp-dash-section-icon" aria-hidden />
          <h3 id="sp-recent-announcements" className="sp-dash-section-title">
            Recent announcements
          </h3>
        </div>
        {data.announcements.length === 0 ? (
          <p className="sp-dash-empty">No announcements for your scope right now.</p>
        ) : (
          <div className="sp-dash-announce-cards">
            {data.announcements.map((a) => (
              <article key={a.id} className="sp-dash-announce-card">
                <div className="sp-dash-announce-card-top">
                  <h4 className="sp-dash-announce-title">{a.title}</h4>
                  {a.pinned ? <span className="sp-dash-pin">Pinned</span> : null}
                </div>
                <p className="sp-dash-announce-body">{a.bodyPreview}</p>
                <p className="sp-dash-announce-meta">
                  {a.createdBy}
                  {a.publishedAt ? (
                    <>
                      {" "}
                      · {formatIstLocaleDate(a.publishedAt)}
                    </>
                  ) : null}
                </p>
              </article>
            ))}
          </div>
        )}
        <Link to="/student/engage/announcements" className="sp-dash-link-all">
          View all announcements →
        </Link>
      </section>

      {attendanceOpen ? (
        <Suspense fallback={<ModalRouteFallback />}>
          <AttendanceSummaryDialog open={attendanceOpen} onClose={() => setAttendanceOpen(false)} />
        </Suspense>
      ) : null}
      {feeOpen ? (
        <Suspense fallback={<ModalRouteFallback />}>
          <FeeSummaryDialog open={feeOpen} onClose={() => setFeeOpen(false)} />
        </Suspense>
      ) : null}
    </div>
  );
}
