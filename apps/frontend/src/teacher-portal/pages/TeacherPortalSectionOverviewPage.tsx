import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/auth-context";
import { FormSelect } from "../../shared/FormSelect";
import { useToast } from "../../shared/toast-context";
import { downloadAuthenticatedExport } from "../../shared/download-authenticated-export";
import { RequireTeacherModule } from "../RequireTeacherModule";
import { TEACHER_MODULE_SUBTITLES } from "../teacher-portal-module-copy";
import { TeacherPortalExportButton } from "../TeacherPortalExportDialog";
import { TeacherPortalModuleShell, TeacherPortalPanelWrap } from "../TeacherPortalModuleShell";
import { TpBadge, TpCard, TpCardHead } from "../teacher-portal-ui";

type View = "personal" | "fee" | "academic" | "marks";
type Student = { id: string; rollNumber: string; fullName: string; isOverdue: boolean; data: Record<string, unknown> };
type Team = { teamId: string; teamName: string; students: Student[] };
type Overview = { view: View; total: number; teams: Team[] };

const VIEWS: [string, string][] = [["personal", "Personal Details"], ["fee", "Fee Details"], ["academic", "Academic Details"], ["marks", "Marks"]];

function inr(n: unknown) {
  return `₹${Number(n ?? 0).toLocaleString("en-IN")}`;
}
function s(v: unknown) {
  return v == null || v === "" ? "—" : String(v);
}

function SectionOverview() {
  const { authFetch, accessToken } = useAuth();
  const { showToast } = useToast();
  const [sections, setSections] = useState<{ id: string; label: string }[]>([]);
  const [sectionId, setSectionId] = useState("");
  const [view, setView] = useState<View>("personal");
  const [data, setData] = useState<Overview | null>(null);

  const api = useCallback(async (path: string) => {
    const res = await authFetch(path);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new Error(body?.message ?? "Request failed.");
    }
    return res.json();
  }, [authFetch]);

  useEffect(() => {
    void api("/api/portals/teacher/section-overview/setup")
      .then((d: { sections: { id: string; label: string }[] }) => {
        setSections(d.sections);
        setSectionId((cur) => cur || d.sections[0]?.id || "");
      })
      .catch((e) => showToast(e instanceof Error ? e.message : "Could not load sections", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (!sectionId) return;
    const d = (await api(`/api/portals/teacher/section-overview?sectionId=${sectionId}&view=${view}&pageSize=100`)) as Overview;
    setData(d);
  }, [api, sectionId, view]);

  useEffect(() => {
    void load().catch((e) => showToast(e instanceof Error ? e.message : "Could not load overview", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId, view]);

  const sectionLabel = sections.find((sec) => sec.id === sectionId)?.label ?? "Section";
  const viewLabel = VIEWS.find(([v]) => v === view)?.[1] ?? view;

  function header(): string[] {
    if (view === "personal") return ["Roll", "Name", "Phone", "Father", "Guardian", "Address", "DOB", "Status"];
    if (view === "academic") return ["Roll", "Name", "Email", "Username", "Status"];
    if (view === "fee") return ["Roll", "Name", "Assigned", "Paid", "Balance", "Status"];
    return ["Roll", "Name", "Subject", "Sem", "Int", "Ext", "Total", "Grade", "Status"];
  }

  function renderStudentRows(st: Student) {
    const d = st.data;
    // Overdue red applies only in the Fee and Marks views — not Personal/Academic.
    const overdueCls = (view === "fee" || view === "marks") && st.isOverdue ? "tp-overdue-row" : undefined;
    if (view === "personal") return [<tr key={st.id} className={overdueCls}><td>{st.rollNumber}</td><td>{st.fullName}</td><td>{s(d.phone)}</td><td>{s(d.fatherName)}</td><td>{s(d.guardianName)}</td><td>{s(d.address)}</td><td>{s(d.dateOfBirth)}</td><td>{s(d.status)}</td></tr>];
    if (view === "academic") return [<tr key={st.id} className={overdueCls}><td>{st.rollNumber}</td><td>{st.fullName}</td><td>{s(d.email)}</td><td>{s(d.username)}</td><td>{s(d.status)}</td></tr>];
    if (view === "fee") return [<tr key={st.id} className={overdueCls}><td>{st.rollNumber}</td><td>{st.fullName}</td><td>{inr(d.assigned)}</td><td>{inr(d.paid)}</td><td>{inr(d.balance)}</td><td className={st.isOverdue ? "tp-overdue" : undefined}>{st.isOverdue ? `Overdue (${s(d.daysOverdue)}d)` : s(d.status)}</td></tr>];
    const marks = (d.marks as { subject: string; semesterNumber: number; internals: number | null; externals: number | null; totalMarks: number | null; grade: string | null; status: string }[]) ?? [];
    if (!marks.length) return [<tr key={st.id} className={overdueCls}><td>{st.rollNumber}</td><td>{st.fullName}</td><td colSpan={7} style={{ color: "var(--t3)" }}>No marks</td></tr>];
    return marks.map((m, i) => (
      <tr key={`${st.id}-${i}`} className={overdueCls}>
        <td>{i === 0 ? st.rollNumber : ""}</td><td>{i === 0 ? st.fullName : ""}</td>
        <td>{m.subject}</td><td>{m.semesterNumber}</td><td>{s(m.internals)}</td><td>{s(m.externals)}</td><td>{s(m.totalMarks)}</td><td>{s(m.grade)}</td><td>{m.status}</td>
      </tr>
    ));
  }

  const cols = header();

  return (
    <TeacherPortalModuleShell title="Section Overview" subtitle={TEACHER_MODULE_SUBTITLES.section_overview}>
      <TeacherPortalPanelWrap>
        <TpCard>
          <TpCardHead
            title="Select"
            actions={
              <TeacherPortalExportButton
                title="Export section overview"
                leadPrimary={sectionLabel}
                leadSecondary={viewLabel}
                onExport={async (format) => {
                  if (!sectionId || !accessToken) {
                    showToast("Sign in again to export.", "error");
                    return;
                  }
                  downloadAuthenticatedExport(accessToken, "/api/portals/teacher/section-overview/export", { sectionId, view, format });
                  showToast("Export started — check your downloads.");
                }}
              />
            }
          />
          <div className="tp-student-toolbar">
            <FormSelect value={sectionId} options={sections.map((sec) => [sec.id, sec.label])} onChange={setSectionId} aria-label="Section" />
            <FormSelect value={view} options={VIEWS} onChange={(v) => setView(v as View)} aria-label="View type" />
          </div>
        </TpCard>

        {data?.teams.length ? data.teams.map((team) => (
          <TpCard key={team.teamId}>
            <TpCardHead title={team.teamName} actions={<TpBadge variant="muted">{team.students.length}</TpBadge>} />
            <div className="db-table-wrap">
              <table className="db-table">
                <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>{team.students.flatMap((st) => renderStudentRows(st))}</tbody>
              </table>
            </div>
          </TpCard>
        )) : <TpCard><p style={{ color: "var(--t3)", padding: "8px 0" }}>No students in this section.</p></TpCard>}
      </TeacherPortalPanelWrap>
    </TeacherPortalModuleShell>
  );
}

export function TeacherPortalSectionOverviewPage() {
  return (
    <RequireTeacherModule moduleKey="section_overview">
      <SectionOverview />
    </RequireTeacherModule>
  );
}
