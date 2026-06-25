import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { FormSelect } from "../../shared/FormSelect";
import { readApiError } from "../../shared/read-api-error";
import { toFormSelectOptions, withEmptyOption } from "../../shared/select-options";
import { useConfirm } from "../../shared/ConfirmDialog";
import { useToast } from "../../shared/toast-context";
import type { HtpoTeamCard, HtpoTeamsListResponse, HtpoTeamsSetup } from "../htpo-teams-types";
import { RequireTeacherModule } from "../RequireTeacherModule";
import { TEACHER_MODULE_SUBTITLES } from "../teacher-portal-module-copy";
import { TeacherPortalModuleShell, TeacherPortalPanelWrap } from "../TeacherPortalModuleShell";

const PAGE_SIZE = 5;

function TeamsPager({ page, total, onPage }: { page: number; total: number; onPage: (page: number) => void }) {
  const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (total <= PAGE_SIZE) return null;
  return (
    <div className="htpo-teams-pagination">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span>
        Page {page} of {maxPage}
      </span>
      <button type="button" disabled={page >= maxPage} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </div>
  );
}

function TeamCard({
  team,
  canManage,
  onDelete,
  onEdit
}: {
  team: HtpoTeamCard;
  canManage: boolean;
  onDelete: (team: HtpoTeamCard) => void;
  onEdit: (team: HtpoTeamCard) => void;
}) {
  return (
    <article className="htpo-teams-card">
      <header className="htpo-teams-card-head">
        <div>
          <h2 className="htpo-teams-card-title">{team.name}</h2>
          <p className="htpo-teams-card-meta">{team.metaLabel}</p>
        </div>
        {canManage ? (
          <div className="htpo-teams-card-actions">
            <button type="button" className="htpo-teams-card-btn" onClick={() => onEdit(team)}>
              Edit members
            </button>
            <button type="button" className="htpo-teams-card-btn htpo-teams-card-btn--danger" onClick={() => onDelete(team)}>
              Delete
            </button>
          </div>
        ) : null}
      </header>
      <ul className="htpo-teams-member-list">
        {team.members.map((member) => (
          <li key={member.id} className="htpo-teams-member-row">
            <span className="htpo-teams-member-avatar" aria-hidden>
              {member.initials}
            </span>
            <span className="htpo-teams-member-name">{member.fullName}</span>
            {member.leaderLabel ? <span className="htpo-teams-leader-badge">{member.leaderLabel}</span> : null}
          </li>
        ))}
      </ul>
    </article>
  );
}

export function TeacherPortalTeamsPage() {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const { confirm, dialog } = useConfirm();
  const navigate = useNavigate();

  const [setup, setSetup] = useState<HtpoTeamsSetup | null>(null);
  const [loadingSetup, setLoadingSetup] = useState(true);
  const [sectionId, setSectionId] = useState("");
  const [page, setPage] = useState(1);
  const [list, setList] = useState<HtpoTeamsListResponse | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const loadSetup = useCallback(async () => {
    setLoadingSetup(true);
    try {
      const res = await authFetch("/api/portals/teacher/teams/setup");
      if (!res.ok) throw new Error(await readApiError(res, "Could not load teams setup."));
      const data = (await res.json()) as HtpoTeamsSetup;
      setSetup(data);
      setSectionId(data.showAllSections ? "" : data.fixedSectionId ?? data.sections[0]?.id ?? "");
    } catch (error) {
      setSetup(null);
      showToast(error instanceof Error ? error.message : "Could not load teams.", "error");
    } finally {
      setLoadingSetup(false);
    }
  }, [authFetch, showToast]);

  const loadTeams = useCallback(async () => {
    if (!setup) return;
    setLoadingList(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (sectionId) params.set("sectionId", sectionId);
      const res = await authFetch(`/api/portals/teacher/teams?${params.toString()}`);
      if (!res.ok) throw new Error(await readApiError(res, "Could not load teams."));
      setList((await res.json()) as HtpoTeamsListResponse);
    } catch (error) {
      setList(null);
      showToast(error instanceof Error ? error.message : "Could not load teams.", "error");
    } finally {
      setLoadingList(false);
    }
  }, [authFetch, page, sectionId, setup, showToast]);

  useEffect(() => {
    void loadSetup();
  }, [loadSetup]);

  useEffect(() => {
    void loadTeams();
  }, [loadTeams]);

  useEffect(() => {
    setPage(1);
  }, [sectionId]);

  const sectionOptions = useMemo(() => {
    if (!setup) return [] as const;
    const base: [string, string][] = setup.sections.map((section) => [section.id, section.label]);
    if (setup.showAllSections) return toFormSelectOptions(withEmptyOption(base, "All sections"));
    return toFormSelectOptions(base);
  }, [setup]);

  const subtitle = useMemo(() => {
    if (!list) return TEACHER_MODULE_SUBTITLES.teams;
    if (!sectionId && list.sectionCount > 1) {
      return `${list.total} team${list.total === 1 ? "" : "s"} across ${list.sectionCount} sections`;
    }
    return `${list.total} team${list.total === 1 ? "" : "s"}`;
  }, [list, sectionId]);

  async function handleDelete(team: HtpoTeamCard) {
    const ok = await confirm({
      title: "Delete team?",
      message: "This archives the team. Students can join another team afterward.",
      itemName: team.name,
      confirmLabel: "Delete team"
    });
    if (!ok) return;
    setArchivingId(team.id);
    try {
      const res = await authFetch(`/api/portals/teacher/teams/${team.id}/archive`, { method: "POST" });
      if (!res.ok) throw new Error(await readApiError(res, "Could not delete team."));
      showToast("Team deleted.", "success");
      void loadTeams();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not delete team.", "error");
    } finally {
      setArchivingId(null);
    }
  }

  return (
    <RequireTeacherModule moduleKey="teams">
      <TeacherPortalModuleShell subtitle={subtitle}>
        <TeacherPortalPanelWrap>
          <div className="htpo-teams-page">
            {setup?.canManage ? (
              <button
                type="button"
                className="htpo-teams-create-btn"
                onClick={() => void navigate("/teacher/teams/create")}
              >
                + Create team
              </button>
            ) : null}

            {setup && sectionOptions.length ? (
              <label className="htpo-teams-section-filter">
                <span className="htpo-teams-field-label">Section</span>
                <FormSelect
                  value={sectionId}
                  options={sectionOptions}
                  onChange={(value) => setSectionId(value)}
                  disabled={!setup.showAllSections && sectionOptions.length <= 1}
                />
              </label>
            ) : null}

            {loadingSetup || loadingList ? <p className="htpo-teams-empty">Loading teams…</p> : null}

            {!loadingSetup && !loadingList && list?.items.length === 0 ? (
              <p className="htpo-teams-empty">No teams yet{setup?.canManage ? ". Create one to get started." : "."}</p>
            ) : null}

            {!loadingList && list?.items.length ? (
              <div className="htpo-teams-card-stack">
                {list.items.map((team) => (
                  <TeamCard
                    key={team.id}
                    team={team}
                    canManage={Boolean(setup?.canManage)}
                    onDelete={(item) => void handleDelete(item)}
                    onEdit={(item) => void navigate(`/teacher/teams/${item.id}/edit`)}
                  />
                ))}
                <TeamsPager page={list.page} total={list.total} onPage={setPage} />
              </div>
            ) : null}
          </div>
          {dialog}
          {archivingId ? <span className="sr-only" aria-live="polite">Deleting team…</span> : null}
        </TeacherPortalPanelWrap>
      </TeacherPortalModuleShell>
    </RequireTeacherModule>
  );
}
