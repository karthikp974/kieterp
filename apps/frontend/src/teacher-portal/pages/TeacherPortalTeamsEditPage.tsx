import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { readApiError } from "../../shared/read-api-error";
import { useToast } from "../../shared/toast-context";
import { HtpoTeamMembersEditor } from "../HtpoTeamMembersEditor";
import type { HtpoTeamCard, HtpoTeamMemberDraft } from "../htpo-teams-types";
import { teamMemberRanksAreValid } from "../htpo-teams-validation";
import { RequireTeacherModule } from "../RequireTeacherModule";

export function TeacherPortalTeamsEditPage() {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { teamId = "" } = useParams();

  const [team, setTeam] = useState<HtpoTeamCard | null>(null);
  const [members, setMembers] = useState<HtpoTeamMemberDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadTeam() {
      if (!teamId) return;
      setLoading(true);
      try {
        const res = await authFetch(`/api/portals/teacher/teams/${teamId}`);
        if (!res.ok) throw new Error(await readApiError(res, "Could not load team."));
        const data = (await res.json()) as { team: HtpoTeamCard };
        setTeam(data.team);
        setMembers(
          data.team.members.map((member) => ({
            studentProfileId: member.studentProfileId,
            fullName: member.fullName,
            label: member.fullName,
            leaderRank: member.leaderRank,
          }))
        );
      } catch (error) {
        setTeam(null);
        showToast(error instanceof Error ? error.message : "Could not load team.", "error");
      } finally {
        setLoading(false);
      }
    }
    void loadTeam();
  }, [authFetch, showToast, teamId]);

  const formReady = teamMemberRanksAreValid(members);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!teamId || !formReady) {
      showToast("Add at least one member with valid ranks.", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch(`/api/portals/teacher/teams/${teamId}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          members: members.map((member) => ({
            studentProfileId: member.studentProfileId,
            leaderRank: member.leaderRank
          }))
        })
      });
      if (!res.ok) throw new Error(await readApiError(res, "Could not update members."));
      showToast("Team members updated.", "success");
      void navigate("/teacher/teams");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not update members.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <RequireTeacherModule moduleKey="teams">
        <p className="htpo-teams-empty">Loading team…</p>
      </RequireTeacherModule>
    );
  }

  if (!team) {
    return (
      <RequireTeacherModule moduleKey="teams">
        <p className="htpo-teams-empty">Team not found.</p>
      </RequireTeacherModule>
    );
  }

  return (
    <RequireTeacherModule moduleKey="teams">
      <form className="htpo-teams-form-page" onSubmit={(event) => void onSubmit(event)}>
        <header className="htpo-teams-form-head">
          <h1>Edit members</h1>
          <p>{team.metaLabel}</p>
        </header>

        <fieldset className="htpo-teams-members-fieldset">
          <legend className="htpo-teams-field-label">Team members *</legend>
          <HtpoTeamMembersEditor
            authFetch={authFetch}
            sectionId={team.section.id}
            excludeTeamId={team.id}
            members={members}
            onChange={setMembers}
          />
        </fieldset>

        <div className="htpo-teams-form-actions htpo-teams-form-actions--stack">
          <button type="submit" className="htpo-teams-action-btn htpo-teams-action-btn--block" disabled={saving || !formReady}>
                {saving ? "Saving…" : "Save members"}
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
