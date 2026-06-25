import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { FormSelect } from "../../shared/FormSelect";
import { readApiError } from "../../shared/read-api-error";
import { useToast } from "../../shared/toast-context";
import { HtpoTeamMembersEditor } from "../HtpoTeamMembersEditor";
import type { HtpoTeamMemberDraft, HtpoTeamsSetup } from "../htpo-teams-types";
import { isCreateTeamFormReady } from "../htpo-teams-validation";
import { RequireTeacherModule } from "../RequireTeacherModule";

export function TeacherPortalTeamsCreatePage() {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [setup, setSetup] = useState<HtpoTeamsSetup | null>(null);
  const [loadingSetup, setLoadingSetup] = useState(true);
  const [name, setName] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [members, setMembers] = useState<HtpoTeamMemberDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [membersTouched, setMembersTouched] = useState(false);

  useEffect(() => {
    async function loadSetup() {
      setLoadingSetup(true);
      try {
        const res = await authFetch("/api/portals/teacher/teams/setup");
        if (!res.ok) throw new Error(await readApiError(res, "Could not load teams setup."));
        const data = (await res.json()) as HtpoTeamsSetup;
        setSetup(data);
        setSectionId(data.fixedSectionId ?? data.sections[0]?.id ?? "");
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Could not load setup.", "error");
      } finally {
        setLoadingSetup(false);
      }
    }
    void loadSetup();
  }, [authFetch, showToast]);

  const sectionOptions = useMemo(
    () => setup?.sections.map((section) => [section.id, section.label] as const) ?? [],
    [setup]
  );

  const formReady = isCreateTeamFormReady(name, sectionId, members);
  const showMembersError = membersTouched && members.length === 0;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setMembersTouched(true);
    if (!formReady) {
      if (!name.trim()) showToast("Team name is required.", "error");
      else if (!sectionId) showToast("Section is required.", "error");
      else if (!members.length) showToast("Add at least one team member.", "error");
      else showToast("Assign a unique rank (L1, L2, …) to every member.", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch("/api/portals/teacher/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId,
          name: name.trim(),
          members: members.map((member) => ({
            studentProfileId: member.studentProfileId,
            leaderRank: member.leaderRank
          }))
        })
      });
      if (!res.ok) throw new Error(await readApiError(res, "Could not create team."));
      showToast("Team created.", "success");
      void navigate("/teacher/teams");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not create team.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loadingSetup) {
    return (
      <RequireTeacherModule moduleKey="teams">
        <p className="htpo-teams-empty">Loading form…</p>
      </RequireTeacherModule>
    );
  }

  if (!setup?.canManage) {
    return (
      <RequireTeacherModule moduleKey="teams">
        <p className="htpo-teams-empty">You do not have permission to create teams.</p>
      </RequireTeacherModule>
    );
  }

  if (!setup.sections.length) {
    return (
      <RequireTeacherModule moduleKey="teams">
        <p className="htpo-teams-empty">No sections are available for team creation.</p>
      </RequireTeacherModule>
    );
  }

  return (
    <RequireTeacherModule moduleKey="teams">
      <form className="htpo-teams-form-page" onSubmit={(event) => void onSubmit(event)} noValidate>
        <header className="htpo-teams-form-head">
          <h1>Create team</h1>
        </header>

        <label className="htpo-teams-field">
          <span className="htpo-teams-field-label">Team name *</span>
          <input
            className="db-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            minLength={2}
            required
            autoComplete="off"
          />
        </label>

        <label className="htpo-teams-field">
          <span className="htpo-teams-field-label">Section *</span>
          <FormSelect
            value={sectionId}
            options={sectionOptions}
            required
            disabled={sectionOptions.length <= 1}
            onChange={(value) => {
              setSectionId(value);
              setMembers([]);
              setMembersTouched(false);
            }}
          />
        </label>

        <fieldset className="htpo-teams-members-fieldset">
          <legend className="htpo-teams-field-label">Team members *</legend>
          <HtpoTeamMembersEditor
            authFetch={authFetch}
            sectionId={sectionId}
            members={members}
            onChange={(next) => {
              setMembers(next);
              if (next.length) setMembersTouched(true);
            }}
          />
          {showMembersError ? <p className="htpo-teams-field-error">Add at least one student.</p> : null}
        </fieldset>

        <div className="htpo-teams-form-actions htpo-teams-form-actions--stack">
          {!formReady && !saving ? (
            <p className="htpo-teams-form-hint">Fill team name, section, and add at least one member with ranks to create.</p>
          ) : null}
          <button
            type="submit"
            className="htpo-teams-action-btn htpo-teams-action-btn--block"
            disabled={saving}
          >
            {saving ? "Creating…" : "Create team"}
          </button>
          <button
            type="button"
            className="htpo-teams-action-btn htpo-teams-action-btn--ghost htpo-teams-action-btn--block"
            disabled={saving}
            onClick={() => void navigate("/teacher/teams")}
          >
            Cancel
          </button>
        </div>
      </form>
    </RequireTeacherModule>
  );
}
