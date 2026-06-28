import { useCallback, useEffect, useState } from "react";
import { Pencil, Check, X, FileDown } from "lucide-react";
import { useAuth } from "../../auth/auth-context";
import { FormSelect } from "../../shared/FormSelect";
import { useToast } from "../../shared/toast-context";
import { downloadAuthenticatedExport } from "../../shared/download-authenticated-export";
import { RequireTeacherModule } from "../RequireTeacherModule";
import { TEACHER_MODULE_SUBTITLES } from "../teacher-portal-module-copy";
import { TeacherPortalModuleShell, TeacherPortalPanelWrap } from "../TeacherPortalModuleShell";
import { TpBadge, TpCard, TpCardHead } from "../teacher-portal-ui";

type SearchRow = { id: string; rollNumber: string; fullName: string; status: string; sectionLabel: string };
type FeeItem = { assignmentId: string; feeHead: string; amount: number; paid: number; balance: number; dueDate: string | null; status: "paid" | "pending" | "overdue"; daysOverdue: number };
type MarkItem = { id: string; subjectId: string; subject: string; semesterNumber: number; examType: string; internals: number | null; externals: number | null; totalMarks: number | null; grade: string | null; status: string };
type Profile = {
  id: string;
  personal: { fullName: string; rollNumber: string; email: string | null; username: string | null; phone: string | null; dateOfBirth: string | null; fatherName: string | null; guardianName: string | null; address: string | null; status: string };
  academic: { campus: { code: string; name: string }; program: { code: string; name: string }; branch: { code: string; name: string }; batchId: string; batch: { startYear: number; endYear: number }; semester: number; section: { id: string; name: string } };
  fees: { items: FeeItem[]; totals: { assigned: number; paid: number; balance: number } };
  marks: MarkItem[];
};

const PAY_MODES: [string, string][] = [["CASH", "Cash"], ["UPI", "UPI"], ["CARD", "Card"], ["BANK_TRANSFER", "Bank transfer"], ["CHEQUE", "Cheque"], ["OTHER", "Other"]];
const PERSONAL_FIELDS: { key: keyof Profile["personal"]; label: string }[] = [
  { key: "fullName", label: "Name" },
  { key: "rollNumber", label: "Roll Number" },
  { key: "email", label: "Login Email" },
  { key: "username", label: "Username" },
  { key: "phone", label: "Phone" },
  { key: "dateOfBirth", label: "Date of Birth" },
  { key: "fatherName", label: "Father Name" },
  { key: "guardianName", label: "Guardian Name" },
  { key: "address", label: "Address" }
];

function inr(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

function SearchStudent() {
  const { authFetch, accessToken } = useAuth();
  const { showToast } = useToast();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<SearchRow[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pay, setPay] = useState<{ assignmentId: string; amount: string; mode: string } | null>(null);
  const [markDraft, setMarkDraft] = useState<Record<string, { internals: string; externals: string; totalMarks: string; grade: string }>>({});

  const api = useCallback(
    async (path: string, init?: RequestInit) => {
      const res = await authFetch(path, init);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
        throw new Error(Array.isArray(body?.message) ? body!.message.join(", ") : body?.message ?? "Request failed.");
      }
      return res.json();
    },
    [authFetch]
  );

  const runSearch = useCallback(async () => {
    const data = (await api(`/api/portals/teacher/student-search?search=${encodeURIComponent(term.trim())}&pageSize=25`)) as { items: SearchRow[] };
    setResults(data.items);
  }, [api, term]);

  useEffect(() => {
    void runSearch().catch((e) => showToast(e instanceof Error ? e.message : "Search failed", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openProfile = useCallback(
    async (id: string) => {
      try {
        const p = (await api(`/api/portals/teacher/student-search/${id}`)) as Profile;
        setProfile(p);
        setEditingField(null);
        setPay(null);
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Could not load student", "error");
      }
    },
    [api, showToast]
  );

  async function saveField(key: string) {
    if (!profile) return;
    try {
      const updated = (await api(`/api/portals/teacher/student-search/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: draft })
      })) as Profile;
      setProfile(updated);
      setEditingField(null);
      showToast("Saved");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Save failed", "error");
    }
  }

  async function submitPayment() {
    if (!profile || !pay) return;
    const amount = Number(pay.amount);
    if (!amount || amount <= 0) {
      showToast("Enter a valid amount", "error");
      return;
    }
    try {
      await api("/api/payments/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentProfileId: profile.id,
          batchId: profile.academic.batchId,
          feeLineKind: "ASSIGNMENT",
          studentFeeAssignmentId: pay.assignmentId,
          amount,
          paymentMode: pay.mode,
          idempotencyKey: crypto.randomUUID()
        })
      });
      showToast("Payment recorded");
      setPay(null);
      await openProfile(profile.id);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Payment failed", "error");
    }
  }

  async function saveMark(m: MarkItem) {
    if (!profile) return;
    const d = markDraft[m.id];
    if (!d) return;
    try {
      await api("/api/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentProfileId: profile.id,
          subjectId: m.subjectId,
          semesterNumber: m.semesterNumber,
          examType: m.examType,
          internals: d.internals === "" ? undefined : Number(d.internals),
          externals: d.externals === "" ? undefined : Number(d.externals),
          totalMarks: d.totalMarks === "" ? undefined : Number(d.totalMarks),
          grade: d.grade || undefined,
          status: m.status
        })
      });
      setMarkDraft((prev) => { const next = { ...prev }; delete next[m.id]; return next; });
      showToast("Marks saved");
      await openProfile(profile.id);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Marks save failed", "error");
    }
  }

  function exportProfile(format: "pdf" | "excel") {
    if (!profile || !accessToken) return;
    void downloadAuthenticatedExport(accessToken, `/api/portals/teacher/student-search/${profile.id}/export`, { format });
  }

  return (
    <TeacherPortalModuleShell title="Search Student" subtitle={TEACHER_MODULE_SUBTITLES.student_search}>
      <TeacherPortalPanelWrap>
        <TpCard>
          <TpCardHead title="Find a student" />
          <div className="tp-student-toolbar">
            <input className="db-input" placeholder="Search by name or roll number" value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void runSearch(); }} />
            <button type="button" className="erp-btn erp-btn--secondary erp-btn--sm" onClick={() => void runSearch()}>Search</button>
          </div>
          <div className="db-table-wrap">
            <table className="db-table">
              <thead><tr><th>Roll</th><th>Name</th><th>Section</th><th></th></tr></thead>
              <tbody>
                {results.length ? results.map((r) => (
                  <tr key={r.id}>
                    <td>{r.rollNumber}</td><td>{r.fullName}</td><td>{r.sectionLabel}</td>
                    <td><button type="button" className="erp-btn erp-btn--secondary erp-btn--sm" onClick={() => void openProfile(r.id)}>Open</button></td>
                  </tr>
                )) : <tr><td colSpan={4} style={{ textAlign: "center", padding: "18px 0", color: "var(--t3)" }}>No students found.</td></tr>}
              </tbody>
            </table>
          </div>
        </TpCard>

        {profile ? (
          <>
            <TpCard>
              <TpCardHead title={`${profile.personal.fullName} · ${profile.personal.rollNumber}`} actions={
                <div className="db-inline-actions">
                  <button type="button" className="erp-btn erp-btn--secondary erp-btn--sm" onClick={() => exportProfile("excel")}><FileDown size={14} /> Excel</button>
                  <button type="button" className="erp-btn erp-btn--secondary erp-btn--sm" onClick={() => exportProfile("pdf")}><FileDown size={14} /> PDF</button>
                </div>
              } />
              <h4 className="tp-section-label">Personal details</h4>
              <div className="tp-detail-list">
                {PERSONAL_FIELDS.map((f) => {
                  const value = profile.personal[f.key];
                  const editing = editingField === f.key;
                  return (
                    <div className="tp-detail-row" key={f.key}>
                      <span className="tp-detail-label">{f.label}</span>
                      {editing ? (
                        <span className="tp-detail-edit">
                          <input className="db-input" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
                          <button type="button" className="erp-btn erp-btn--primary erp-btn--sm" onClick={() => void saveField(f.key)}><Check size={14} /></button>
                          <button type="button" className="erp-btn erp-btn--secondary erp-btn--sm" onClick={() => setEditingField(null)}><X size={14} /></button>
                        </span>
                      ) : (
                        <span className="tp-detail-value">
                          {value ?? "—"}
                          <button type="button" className="tp-edit-icon" aria-label={`Edit ${f.label}`} onClick={() => { setEditingField(f.key); setDraft(String(value ?? "")); }}><Pencil size={14} /></button>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </TpCard>

            <TpCard>
              <TpCardHead title="Academic details" />
              <div className="tp-detail-list">
                <div className="tp-detail-row"><span className="tp-detail-label">Campus</span><span>{profile.academic.campus.code}</span></div>
                <div className="tp-detail-row"><span className="tp-detail-label">Department</span><span>{profile.academic.program.code} — {profile.academic.program.name}</span></div>
                <div className="tp-detail-row"><span className="tp-detail-label">Branch</span><span>{profile.academic.branch.code}</span></div>
                <div className="tp-detail-row"><span className="tp-detail-label">Batch</span><span>{profile.academic.batch.startYear}-{profile.academic.batch.endYear}</span></div>
                <div className="tp-detail-row"><span className="tp-detail-label">Semester</span><span>{profile.academic.semester}</span></div>
                <div className="tp-detail-row"><span className="tp-detail-label">Section</span><span>{profile.academic.section.name}</span></div>
              </div>
            </TpCard>

            <TpCard>
              <TpCardHead title="Fee details" actions={<TpBadge variant="outline">Balance {inr(profile.fees.totals.balance)}</TpBadge>} />
              <div className="db-table-wrap">
                <table className="db-table">
                  <thead><tr><th>Fee Head</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Due</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {profile.fees.items.length ? profile.fees.items.map((f) => (
                      <tr key={f.assignmentId} className={f.status === "overdue" ? "tp-overdue-row" : undefined}>
                        <td>{f.feeHead}</td><td>{inr(f.amount)}</td><td>{inr(f.paid)}</td><td>{inr(f.balance)}</td><td>{f.dueDate ?? "—"}</td>
                        <td className={f.status === "overdue" ? "tp-overdue" : undefined}>{f.status === "overdue" ? `Overdue (${f.daysOverdue}d)` : f.status}</td>
                        <td>{f.balance > 0 ? <button type="button" className="erp-btn erp-btn--secondary erp-btn--sm" onClick={() => setPay({ assignmentId: f.assignmentId, amount: String(f.balance), mode: "CASH" })}>Mark payment</button> : null}</td>
                      </tr>
                    )) : <tr><td colSpan={7} style={{ textAlign: "center", padding: "14px 0", color: "var(--t3)" }}>No fees assigned.</td></tr>}
                  </tbody>
                </table>
              </div>
              {pay ? (
                <div className="tp-pay-form">
                  <input className="db-input" type="number" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} placeholder="Amount" />
                  <FormSelect value={pay.mode} options={PAY_MODES} onChange={(mode) => setPay({ ...pay, mode })} aria-label="Payment mode" />
                  <button type="button" className="erp-btn erp-btn--primary erp-btn--sm" onClick={() => void submitPayment()}>Record</button>
                  <button type="button" className="erp-btn erp-btn--secondary erp-btn--sm" onClick={() => setPay(null)}>Cancel</button>
                </div>
              ) : null}
            </TpCard>

            <TpCard>
              <TpCardHead title="Marks" />
              <div className="db-table-wrap">
                <table className="db-table">
                  <thead><tr><th>Subject</th><th>Sem</th><th>Internals</th><th>Externals</th><th>Total</th><th>Grade</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {profile.marks.length ? profile.marks.map((m) => {
                      const d = markDraft[m.id];
                      return (
                        <tr key={m.id}>
                          <td>{m.subject}</td><td>{m.semesterNumber}</td>
                          {d ? (
                            <>
                              <td><input className="db-input" type="number" value={d.internals} onChange={(e) => setMarkDraft({ ...markDraft, [m.id]: { ...d, internals: e.target.value } })} /></td>
                              <td><input className="db-input" type="number" value={d.externals} onChange={(e) => setMarkDraft({ ...markDraft, [m.id]: { ...d, externals: e.target.value } })} /></td>
                              <td><input className="db-input" type="number" value={d.totalMarks} onChange={(e) => setMarkDraft({ ...markDraft, [m.id]: { ...d, totalMarks: e.target.value } })} /></td>
                              <td><input className="db-input" value={d.grade} onChange={(e) => setMarkDraft({ ...markDraft, [m.id]: { ...d, grade: e.target.value } })} /></td>
                              <td>{m.status}</td>
                              <td><div className="db-inline-actions"><button type="button" className="erp-btn erp-btn--primary erp-btn--sm" onClick={() => void saveMark(m)}><Check size={14} /></button><button type="button" className="erp-btn erp-btn--secondary erp-btn--sm" onClick={() => setMarkDraft((p) => { const n = { ...p }; delete n[m.id]; return n; })}><X size={14} /></button></div></td>
                            </>
                          ) : (
                            <>
                              <td>{m.internals ?? "—"}</td><td>{m.externals ?? "—"}</td><td>{m.totalMarks ?? "—"}</td><td>{m.grade ?? "—"}</td><td>{m.status}</td>
                              <td><button type="button" className="tp-edit-icon" aria-label="Edit marks" onClick={() => setMarkDraft({ ...markDraft, [m.id]: { internals: String(m.internals ?? ""), externals: String(m.externals ?? ""), totalMarks: String(m.totalMarks ?? ""), grade: m.grade ?? "" } })}><Pencil size={14} /></button></td>
                            </>
                          )}
                        </tr>
                      );
                    }) : <tr><td colSpan={8} style={{ textAlign: "center", padding: "14px 0", color: "var(--t3)" }}>No marks yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </TpCard>
          </>
        ) : null}
      </TeacherPortalPanelWrap>
    </TeacherPortalModuleShell>
  );
}

export function TeacherPortalSearchStudentPage() {
  return (
    <RequireTeacherModule moduleKey="student_search">
      <SearchStudent />
    </RequireTeacherModule>
  );
}
