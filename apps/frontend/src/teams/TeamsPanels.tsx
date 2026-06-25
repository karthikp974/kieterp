import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/auth-context";
import { SafeActionButton } from "../shared/SafeActionButton";
import { SearchableSelect } from "../shared/SearchableSelect";
import { useToast } from "../shared/toast-context";
import { PaginatedResponse } from "../structure/structure-types";

type TeamSection = { id: string; name: string; label: string };
type TeamStudent = { id: string; rollNumber: string; fullName: string; sectionId: string };
type StudentTeam = {
  id: string;
  name: string;
  description?: string | null;
  status: "ACTIVE" | "ARCHIVED";
  section: TeamSection;
  createdBy: string;
  members: { id: string; role: "LEADER" | "MEMBER"; student: { id: string; rollNumber: string; fullName: string } }[];
};
type TeamOptions = { sections: TeamSection[]; students: TeamStudent[] };

const inputClass = "db-input";

function useApi() {
  const { authFetch } = useAuth();

  async function fetchJson<T>(path: string) {
    const response = await authFetch(path);
    if (!response.ok) throw new Error(`Request failed: ${path}`);
    return (await response.json()) as T;
  }

  async function sendJson<T>(path: string, body: unknown) {
    const response = await authFetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(payload?.message ?? "Team action failed.");
    }
    return (await response.json().catch(() => ({}))) as T;
  }

  return { fetchJson, sendJson };
}

export function AdminTeamsPanel() {
  return <TeamsManager title="Teams Management" description="Create and archive student teams inside sections." />;
}

export function TeacherTeamsPanel() {
  return <TeamsManager title="Scoped Teams" description="Create and manage teams for your assigned section scope." teacherScoped />;
}

function TeamsManager({ title, description, teacherScoped = false }: { title: string; description: string; teacherScoped?: boolean }) {
  const { fetchJson, sendJson } = useApi();
  const { showToast } = useToast();
  const [teams, setTeams] = useState<StudentTeam[]>([]);
  const [options, setOptions] = useState<TeamOptions>({ sections: [], students: [] });
  const [form, setForm] = useState({ sectionId: "", name: "", description: "", leaderStudentProfileId: "", memberIds: [] as string[] });
  const filteredStudents = useMemo(() => options.students.filter((student) => student.sectionId === form.sectionId), [form.sectionId, options.students]);

  async function load() {
    const optionData = await fetchJson<TeamOptions>("/api/teams/options");
    const teamParams = new URLSearchParams({ pageSize: "25" });
    if (teacherScoped) {
      const sectionId = optionData.sections[0]?.id ?? "";
      if (sectionId) teamParams.set("sectionId", sectionId);
    }
    const teamPage = await fetchJson<PaginatedResponse<StudentTeam>>(`/api/teams?${teamParams.toString()}`).catch(() => ({
      items: [],
      total: 0,
      page: 1,
      pageSize: 25
    }));
    setOptions(optionData);
    setTeams(teamPage.items);
    setForm((current) => ({ ...current, sectionId: current.sectionId || optionData.sections[0]?.id || "" }));
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((error) => showToast(error instanceof Error ? error.message : "Unable to load teams", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendJson("/api/teams", {
      sectionId: form.sectionId,
      name: form.name,
      description: form.description || undefined,
      leaderStudentProfileId: form.leaderStudentProfileId || undefined,
      memberStudentProfileIds: form.memberIds
    });
    setForm({ sectionId: form.sectionId, name: "", description: "", leaderStudentProfileId: "", memberIds: [] });
    await load();
    showToast("Team created");
  }

  async function archiveTeam(id: string) {
    await sendJson(`/api/teams/${id}/archive`, {});
    await load();
    showToast("Team archived");
  }

  function toggleMember(id: string) {
    setForm((current) => ({
      ...current,
      memberIds: current.memberIds.includes(id) ? current.memberIds.filter((item) => item !== id) : [...current.memberIds, id],
      leaderStudentProfileId: current.leaderStudentProfileId === id && current.memberIds.includes(id) ? "" : current.leaderStudentProfileId
    }));
  }

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-950">{title}</h2>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
        <SafeActionButton run={() => load().then(() => showToast("Teams refreshed"))}>Refresh</SafeActionButton>
      </div>
      <form className="grid gap-3 rounded-xl border bg-slate-50 p-4 md:grid-cols-4" onSubmit={(event) => void createTeam(event)}>
        <SearchableSelect value={form.sectionId} options={options.sections.map((section) => [section.id, section.label])} onChange={(sectionId) => setForm({ ...form, sectionId, memberIds: [], leaderStudentProfileId: "" })} required searchable={false} />
        <input className={inputClass} placeholder="Team name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        <input className={inputClass} placeholder="Description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        <SearchableSelect value={form.leaderStudentProfileId} options={[{ value: "", label: "No leader" }, ...filteredStudents.filter((student) => form.memberIds.includes(student.id)).map((student) => ({ value: student.id, label: `${student.rollNumber} - ${student.fullName}` }))]} onChange={(leaderStudentProfileId) => setForm({ ...form, leaderStudentProfileId })} required={false} clearable searchable={false} />
        <div className="max-h-48 overflow-y-auto rounded-lg border bg-white md:col-span-3">
          {filteredStudents.map((student) => (
            <label key={student.id} className="flex items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0">
              <input type="checkbox" checked={form.memberIds.includes(student.id)} onChange={() => toggleMember(student.id)} />
              <span className="font-semibold">{student.rollNumber}</span>
              <span>{student.fullName}</span>
            </label>
          ))}
          {filteredStudents.length === 0 ? <p className="p-3 text-sm text-slate-500">No students found for this section.</p> : null}
        </div>
        <button className="erp-panel-submit">Create Team</button>
      </form>
      <TeamList teams={teams} onArchive={archiveTeam} />
    </section>
  );
}

export function StudentTeamsPanel() {
  const { fetchJson } = useApi();
  const { showToast } = useToast();
  const [teams, setTeams] = useState<StudentTeam[]>([]);

  async function load() {
    const result = await fetchJson<{ items: StudentTeam[] }>("/api/teams/me");
    setTeams(result.items);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((error) => showToast(error instanceof Error ? error.message : "Unable to load teams", "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-950">My Teams</h2>
          <p className="text-sm text-slate-500">Teams you are currently assigned to.</p>
        </div>
        <SafeActionButton run={() => load().then(() => showToast("Teams refreshed"))}>Refresh</SafeActionButton>
      </div>
      <TeamList teams={teams} />
    </section>
  );
}

function TeamList({ teams, onArchive }: { teams: StudentTeam[]; onArchive?: (id: string) => Promise<void> }) {
  return (
    <div className="mt-4 grid gap-3">
      {teams.map((team) => (
        <article key={team.id} className="rounded-xl border bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-slate-950">{team.name}</h3>
              <p className="text-xs text-slate-500">{team.section.label} - Created by {team.createdBy}</p>
            </div>
            {onArchive ? <SafeActionButton run={() => onArchive(team.id)} className="bg-slate-800 hover:bg-slate-900">Archive</SafeActionButton> : null}
          </div>
          {team.description ? <p className="mt-2 text-sm text-slate-600">{team.description}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {team.members.map((member) => (
              <span key={member.id} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                {member.student.rollNumber} - {member.student.fullName}{member.role === "LEADER" ? " (Leader)" : ""}
              </span>
            ))}
          </div>
        </article>
      ))}
      {teams.length === 0 ? <p className="rounded-xl border bg-slate-50 p-4 text-sm text-slate-500">No teams found.</p> : null}
    </div>
  );
}
