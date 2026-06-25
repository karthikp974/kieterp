import { useCallback, useEffect, useMemo, useState } from "react";
import { FormSelect } from "../shared/FormSelect";
import { readApiError } from "../shared/read-api-error";
import { useToast } from "../shared/toast-context";
import type { HtpoTeamMemberDraft, HtpoTeamStudentOption } from "./htpo-teams-types";

type HtpoTeamMembersEditorProps = {
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  sectionId: string;
  excludeTeamId?: string;
  members: HtpoTeamMemberDraft[];
  onChange: (members: HtpoTeamMemberDraft[]) => void;
};

export function HtpoTeamMembersEditor({ authFetch, sectionId, excludeTeamId, members, onChange }: HtpoTeamMembersEditorProps) {
  const { showToast } = useToast();
  const [studentSearch, setStudentSearch] = useState("");
  const [studentOptions, setStudentOptions] = useState<HtpoTeamStudentOption[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!sectionId || studentSearch.trim().length < 1) {
      setStudentOptions([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ search: studentSearch.trim() });
        if (excludeTeamId) params.set("excludeTeamId", excludeTeamId);
        const res = await authFetch(`/api/portals/teacher/teams/sections/${sectionId}/students?${params.toString()}`);
        if (!res.ok) throw new Error(await readApiError(res, "Could not search students."));
        const data = (await res.json()) as { students: HtpoTeamStudentOption[] };
        const picked = new Set(members.map((member) => member.studentProfileId));
        setStudentOptions(data.students.filter((student) => !picked.has(student.id)));
      } catch (error) {
        setStudentOptions([]);
        showToast(error instanceof Error ? error.message : "Student search failed.", "error");
      } finally {
        setSearching(false);
      }
    }, 280);
    return () => window.clearTimeout(timer);
  }, [authFetch, excludeTeamId, members, sectionId, showToast, studentSearch]);

  const rankOptions = useMemo(() => {
    const count = Math.max(members.length, 1);
    return Array.from({ length: count }, (_, index) => [String(index + 1), `L${index + 1}`] as const);
  }, [members.length]);

  const addStudent = useCallback(
    (student: HtpoTeamStudentOption) => {
      const nextRank = members.length + 1;
      onChange([
        ...members,
        {
          studentProfileId: student.id,
          fullName: student.fullName,
          label: student.label,
          leaderRank: nextRank
        }
      ]);
      setStudentSearch("");
      setStudentOptions([]);
    },
    [members, onChange]
  );

  function removeMember(studentProfileId: string) {
    const next = members
      .filter((member) => member.studentProfileId !== studentProfileId)
      .map((member, index) => ({ ...member, leaderRank: index + 1 }));
    onChange(next);
  }

  function updateRank(studentProfileId: string, leaderRank: number) {
    const current = members.find((member) => member.studentProfileId === studentProfileId);
    if (!current) return;
    const swap = members.find((member) => member.leaderRank === leaderRank);
    onChange(
      members.map((member) => {
        if (member.studentProfileId === studentProfileId) return { ...member, leaderRank };
        if (swap && member.studentProfileId === swap.studentProfileId) return { ...member, leaderRank: current.leaderRank };
        return member;
      })
    );
  }

  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => a.leaderRank - b.leaderRank),
    [members]
  );

  return (
    <div className="htpo-teams-members-editor">
      <label className="htpo-teams-field htpo-teams-field--search">
        <span className="htpo-teams-field-label">Search students</span>
        <input
          className="db-input"
          placeholder="Name or roll number"
          value={studentSearch}
          onChange={(event) => setStudentSearch(event.target.value)}
          disabled={!sectionId}
        />
        {searching ? <span className="htpo-teams-search-hint">Searching…</span> : null}
        {studentOptions.length ? (
          <ul className="htpo-teams-student-list" role="listbox">
            {studentOptions.map((student) => (
              <li key={student.id}>
                <button type="button" onClick={() => addStudent(student)}>
                  {student.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </label>

      <div className="htpo-teams-selected-members">
        <div className="htpo-teams-selected-head">
          <strong>Selected members</strong>
          <span>{members.length} selected</span>
        </div>
        {sortedMembers.map((member) => (
          <div key={member.studentProfileId} className="htpo-teams-selected-row">
            <span className="htpo-teams-selected-name">{member.label}</span>
            <label className="htpo-teams-rank-select">
              <span className="htpo-teams-rank-label">Rank</span>
              <FormSelect
                value={String(member.leaderRank)}
                options={rankOptions}
                required
                onChange={(value) => updateRank(member.studentProfileId, Number(value))}
                aria-label={`Leader rank for ${member.fullName}`}
              />
            </label>
            <button type="button" className="htpo-teams-remove-btn" onClick={() => removeMember(member.studentProfileId)}>
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
