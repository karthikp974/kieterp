import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Pencil, Check, X, ArrowLeft } from "lucide-react";
import { useAuth } from "../../auth/auth-context";
import { useToast } from "../../shared/toast-context";
import { downloadAuthenticatedExport } from "../../shared/download-authenticated-export";
import { RequireTeacherModule } from "../RequireTeacherModule";
import { TeacherPortalModuleShell, TeacherPortalPanelWrap } from "../TeacherPortalModuleShell";
import { useTeacherPortalHeaderTitle } from "../teacher-portal-header-context";
import { TeacherPortalExportButton } from "../TeacherPortalExportDialog";
import { TpBadge, TpCard, TpCardHead } from "../teacher-portal-ui";

type FeeItem = { assignmentId: string; feeHead: string; amount: number; paid: number; balance: number; dueDate: string | null; status: "paid" | "pending" | "overdue"; daysOverdue: number };
type FeeYear = { yearNumber: number; hasOverdue: boolean; totals: { assigned: number; paid: number; balance: number }; items: FeeItem[] };
type MarkItem = {
  id: string;
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  subject: string;
  semesterNumber: number;
  examType: string;
  internals: number | null;
  externals: number | null;
  totalMarks: number | null;
  grade: string | null;
  credits: number | null;
  status: string;
};
type MarkSem = { semesterNumber: number; items: MarkItem[] };
type Profile = {
  id: string;
  personal: Record<string, string | null>;
  academic: { campus: { code: string; name: string }; program: { code: string; name: string }; branch: { code: string; name: string }; batchId: string; batch: { startYear: number; endYear: number }; semester: number; section: { id: string; name: string } };
  fees: { totals: { assigned: number; paid: number; balance: number }; years: FeeYear[] };
  marks: { semesters: MarkSem[] };
};


const PERSONAL_FIELDS: [string, string][] = [
  ["fullName", "Name"], ["rollNumber", "Roll Number"], ["email", "Login Email"], ["username", "Username"], ["phone", "Phone"],
  ["dateOfBirth", "Date of Birth"], ["fatherName", "Father Name"], ["guardianName", "Guardian Name"],
  ["village", "Village"], ["mandal", "Mandal"], ["district", "District"], ["state", "State"], ["pincode", "Pincode"], ["homeAddress", "Home Address"]
];
const inr = (n: number) => `₹${Number(n ?? 0).toLocaleString("en-IN")}`;
const fmtMark = (n: number | null) => (n == null ? "—" : String(n));

function StudentDetail() {
  const { studentProfileId = "" } = useParams();
  const navigate = useNavigate();
  const { authFetch, accessToken } = useAuth();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [markDraft, setMarkDraft] = useState<Record<string, { internals: string; externals: string; totalMarks: string; grade: string }>>({});

  useTeacherPortalHeaderTitle(profile ? String(profile.personal.fullName ?? "Student") : "Student");

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const res = await authFetch(path, init);
    if (!res.ok) {
      const b = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
      throw new Error(Array.isArray(b?.message) ? b!.message.join(", ") : b?.message ?? "Request failed.");
    }
    return res.json();
  }, [authFetch]);

  const load = useCallback(async () => {
    try {
      setProfile((await api(`/api/portals/teacher/student-search/${studentProfileId}`)) as Profile);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not load student", "error");
    }
  }, [api, studentProfileId, showToast]);

  useEffect(() => { void load(); }, [load]);

  async function saveField(key: string) {
    try {
      setProfile((await api(`/api/portals/teacher/student-search/${studentProfileId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: draft }) })) as Profile);
      setEditing(null);
      showToast("Saved");
    } catch (e) { showToast(e instanceof Error ? e.message : "Save failed", "error"); }
  }

  async function saveMark(m: MarkItem) {
    const d = markDraft[m.id];
    if (!d || !profile) return;
    try {
      await api("/api/results", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentProfileId: profile.id, subjectId: m.subjectId, semesterNumber: m.semesterNumber, examType: m.examType, internals: d.internals === "" ? undefined : Number(d.internals), externals: d.externals === "" ? undefined : Number(d.externals), totalMarks: d.totalMarks === "" ? undefined : Number(d.totalMarks), grade: d.grade || undefined, status: m.status }) });
      setMarkDraft((p) => { const n = { ...p }; delete n[m.id]; return n; });
      showToast("Marks saved"); await load();
    } catch (e) { showToast(e instanceof Error ? e.message : "Marks save failed", "error"); }
  }

  const studentLabel = profile ? `${profile.personal.fullName ?? "Student"} (${profile.personal.rollNumber ?? "—"})` : "Student";

  const ExportBtn = ({ card, cardLabel }: { card: string; cardLabel: string }) => (
    <TeacherPortalExportButton
      title="Export student profile"
      leadPrimary={studentLabel}
      leadSecondary={cardLabel}
      onExport={async (format) => {
        if (!accessToken) {
          showToast("Sign in again to export.", "error");
          return;
        }
        downloadAuthenticatedExport(accessToken, `/api/portals/teacher/student-search/${studentProfileId}/export`, { format, card });
        showToast("Export started — check your downloads.");
      }}
    />
  );

  if (!profile) {
    return <TeacherPortalModuleShell title="Student"><TeacherPortalPanelWrap><p style={{ color: "var(--t3)" }}>Loading…</p></TeacherPortalPanelWrap></TeacherPortalModuleShell>;
  }
  const p = profile;

  return (
    <TeacherPortalModuleShell title={String(p.personal.fullName ?? "Student")} subtitle={`Roll ${p.personal.rollNumber} · ${p.academic.branch.code} · Sem ${p.academic.semester} · ${p.academic.section.name}`}>
      <TeacherPortalPanelWrap>
        <div className="tp-detail-topbar">
          <button type="button" className="erp-btn erp-btn--secondary erp-btn--sm" onClick={() => navigate("/teacher/student-search")}><ArrowLeft size={14} /> Back to search</button>
          <ExportBtn card="all" cardLabel="Full profile" />
        </div>

        {/* ACADEMIC first */}
        <TpCard>
          <TpCardHead title="Academic details" actions={<ExportBtn card="academic" cardLabel="Academic details" />} />
          <div className="tp-detail-list">
            <div className="tp-detail-row"><span className="tp-detail-label">Campus</span><span>{p.academic.campus.code}</span></div>
            <div className="tp-detail-row"><span className="tp-detail-label">Department</span><span>{p.academic.program.code} — {p.academic.program.name}</span></div>
            <div className="tp-detail-row"><span className="tp-detail-label">Branch</span><span>{p.academic.branch.code}</span></div>
            <div className="tp-detail-row"><span className="tp-detail-label">Batch</span><span>{p.academic.batch.startYear}-{p.academic.batch.endYear}</span></div>
            <div className="tp-detail-row"><span className="tp-detail-label">Semester</span><span>{p.academic.semester}</span></div>
            <div className="tp-detail-row"><span className="tp-detail-label">Section</span><span>{p.academic.section.name}</span></div>
          </div>
        </TpCard>

        {/* PERSONAL (editable, address as columns) */}
        <TpCard>
          <TpCardHead title="Personal details" actions={<ExportBtn card="personal" cardLabel="Personal details" />} />
          <div className="tp-detail-list">
            {PERSONAL_FIELDS.map(([key, label]) => {
              const value = p.personal[key];
              const isEditing = editing === key;
              return (
                <div className="tp-detail-row" key={key}>
                  <span className="tp-detail-label">{label}</span>
                  {isEditing ? (
                    <span className="tp-detail-edit">
                      <input className="db-input" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
                      <button type="button" className="erp-btn erp-btn--primary erp-btn--sm" onClick={() => void saveField(key)}><Check size={14} /></button>
                      <button type="button" className="erp-btn erp-btn--secondary erp-btn--sm" onClick={() => setEditing(null)}><X size={14} /></button>
                    </span>
                  ) : (
                    <span className="tp-detail-value">{value ?? "—"}<button type="button" className="tp-edit-icon" aria-label={`Edit ${label}`} onClick={() => { setEditing(key); setDraft(String(value ?? "")); }}><Pencil size={14} /></button></span>
                  )}
                </div>
              );
            })}
          </div>
        </TpCard>

        {/* FEE — one card per year, stacked vertically; overdue row red */}
        <TpCard>
          <TpCardHead title="Fee details" actions={<><TpBadge variant="outline">Balance {inr(p.fees.totals.balance)}</TpBadge><ExportBtn card="fee" cardLabel="Fee details" /></>} />
          {p.fees.years.length ? (
            <div className="tp-carousel">
              {p.fees.years.map((yr) => (
                <div className="tp-carousel-card" key={yr.yearNumber}>
                  <div className="tp-carousel-head"><strong>Year {yr.yearNumber || "—"}</strong><span>Bal {inr(yr.totals.balance)}</span></div>
                  <div className="tp-table-wrap">
                    <table className="db-table tp-detail-table">
                      <thead><tr><th>Fee Head</th><th>Amt</th><th>Paid</th><th>Bal</th><th>Due</th><th>Status</th></tr></thead>
                      <tbody>
                        {yr.items.map((f) => (
                          <tr key={f.assignmentId} className={f.status === "overdue" ? "tp-overdue-row" : undefined}>
                            <td>{f.feeHead}</td><td>{inr(f.amount)}</td><td>{inr(f.paid)}</td><td>{inr(f.balance)}</td><td>{f.dueDate ?? "—"}</td>
                            <td className={f.status === "overdue" ? "tp-overdue" : undefined}>{f.status === "overdue" ? `Overdue ${f.daysOverdue}d` : f.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : <p style={{ color: "var(--t3)" }}>No fees assigned.</p>}
        </TpCard>

        {/* MARKS — one card per semester, stacked vertically */}
        <TpCard>
          <TpCardHead title="Marks" actions={<ExportBtn card="marks" cardLabel="Marks" />} />
          {p.marks.semesters.length ? (
            <div className="tp-carousel">
              {p.marks.semesters.map((sem) => (
                <div className="tp-carousel-card" key={sem.semesterNumber}>
                  <div className="tp-carousel-head"><strong>Semester {sem.semesterNumber}</strong></div>
                  <div className="tp-table-wrap">
                    <table className="db-table tp-detail-table">
                      <thead><tr><th>Code</th><th>Subject</th><th>Internals</th><th>Grade</th><th>Credit</th><th></th></tr></thead>
                      <tbody>
                        {sem.items.map((m) => {
                          const d = markDraft[m.id];
                          const subjectCode = m.subjectCode ?? m.subject.split(" — ")[0] ?? m.subject;
                          const subjectName = m.subjectName ?? (m.subject.split(" — ").slice(1).join(" — ") || m.subject);
                          return (
                            <tr key={m.id}>
                              <td>{subjectCode}</td>
                              <td className="tp-detail-table-subject">{subjectName}</td>
                              {d ? (
                                <>
                                  <td><input className="db-input" type="number" value={d.internals} onChange={(e) => setMarkDraft({ ...markDraft, [m.id]: { ...d, internals: e.target.value } })} /></td>
                                  <td><input className="db-input" value={d.grade} onChange={(e) => setMarkDraft({ ...markDraft, [m.id]: { ...d, grade: e.target.value } })} /></td>
                                  <td>{fmtMark(m.credits)}</td>
                                  <td><div className="db-inline-actions"><button type="button" className="erp-btn erp-btn--primary erp-btn--sm" onClick={() => void saveMark(m)}><Check size={13} /></button><button type="button" className="erp-btn erp-btn--secondary erp-btn--sm" onClick={() => setMarkDraft((pp) => { const n = { ...pp }; delete n[m.id]; return n; })}><X size={13} /></button></div></td>
                                </>
                              ) : (
                                <>
                                  <td>{fmtMark(m.internals)}</td>
                                  <td>{m.grade ?? "—"}</td>
                                  <td>{fmtMark(m.credits)}</td>
                                  <td><button type="button" className="tp-edit-icon" aria-label="Edit marks" onClick={() => setMarkDraft({ ...markDraft, [m.id]: { internals: String(m.internals ?? ""), externals: String(m.externals ?? ""), totalMarks: String(m.totalMarks ?? ""), grade: m.grade ?? "" } })}><Pencil size={14} /></button></td>
                                </>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : <p style={{ color: "var(--t3)" }}>No marks yet.</p>}
        </TpCard>
      </TeacherPortalPanelWrap>
    </TeacherPortalModuleShell>
  );
}

export function TeacherPortalStudentDetailPage() {
  return (
    <RequireTeacherModule moduleKey="student_search">
      <StudentDetail />
    </RequireTeacherModule>
  );
}
