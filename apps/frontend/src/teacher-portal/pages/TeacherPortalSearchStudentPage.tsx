import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { useToast } from "../../shared/toast-context";
import { RequireTeacherModule } from "../RequireTeacherModule";
import { TEACHER_MODULE_SUBTITLES } from "../teacher-portal-module-copy";
import { TeacherPortalModuleShell, TeacherPortalPanelWrap } from "../TeacherPortalModuleShell";
import { TpCard, TpCardHead } from "../teacher-portal-ui";

type SearchRow = { id: string; rollNumber: string; fullName: string; status: string; sectionLabel: string };

function SearchStudent() {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<SearchRow[]>([]);

  const runSearch = useCallback(async () => {
    const res = await authFetch(`/api/portals/teacher/student-search?search=${encodeURIComponent(term.trim())}&pageSize=25`);
    if (!res.ok) {
      const b = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new Error(b?.message ?? "Search failed.");
    }
    const data = (await res.json()) as { items: SearchRow[] };
    setResults(data.items);
  }, [authFetch, term]);

  useEffect(() => {
    if (!term.trim()) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void runSearch().catch((e) => showToast(e instanceof Error ? e.message : "Search failed", "error"));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [runSearch, showToast, term]);

  return (
    <TeacherPortalModuleShell title="Search Student" subtitle={TEACHER_MODULE_SUBTITLES.student_search}>
      <TeacherPortalPanelWrap>
        <TpCard>
          <TpCardHead title="Find a student" />
          <div className="tp-student-toolbar">
            <input className="db-input" placeholder="Search by name or roll number (your sections only)" value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void runSearch().catch(() => undefined); }} />
            <button type="button" className="erp-btn erp-btn--secondary erp-btn--sm" onClick={() => void runSearch().catch((e) => showToast(e instanceof Error ? e.message : "Search failed", "error"))}>Search</button>
          </div>
          <div className="db-table-wrap">
            <table className="db-table">
              <thead><tr><th>Roll</th><th>Name</th><th>Section</th><th></th></tr></thead>
              <tbody>
                {results.length ? results.map((r) => (
                  <tr key={r.id}>
                    <td>{r.rollNumber}</td><td>{r.fullName}</td><td>{r.sectionLabel}</td>
                    <td><button type="button" className="erp-btn erp-btn--secondary erp-btn--sm" onClick={() => navigate(`/teacher/student-search/${r.id}`)}>Open</button></td>
                  </tr>
                )) : <tr><td colSpan={4} style={{ textAlign: "center", padding: "18px 0", color: "var(--t3)" }}>{term.trim() ? "No students found." : "Type a name or roll number to search."}</td></tr>}
              </tbody>
            </table>
          </div>
        </TpCard>
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
