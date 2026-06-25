import { ChevronDown, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { usePortalConfirm } from "../shared/PortalConfirmDialog";
import { readApiErrorMessage } from "../shared/api-error";
import { SectionTimetableGridView } from "../shared/SectionTimetableGridView";
import { useToast } from "../shared/toast-context";
import { TeacherSectionScopeFilter } from "./TeacherSectionScopeFilter";
import { useTeacherSectionScope } from "./TeacherSectionScopeProvider";
import type { SectionTimetableGridRow, SectionTimetableOccupiedCell } from "../shared/section-timetable-grid.types";
import type { HtpoSectionTimetableGrid } from "./htpo-section-timetable-types";
import { TpCard } from "./teacher-portal-ui";

function rowHasOccupiedSlots(row: SectionTimetableGridRow) {
  return row.cells.some((cell) => cell.kind === "occupied");
}

function periodKey(row: Pick<SectionTimetableGridRow, "startTime" | "endTime">) {
  return `${row.startTime}\u0000${row.endTime}`;
}

export function HtpoSectionTimetableCard() {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const { confirm, dialog: confirmDialog } = usePortalConfirm();
  const navigate = useNavigate();
  const { setup, loading: scopeLoading, loadError: scopeError, sectionId, setSectionId, activeSectionId, refreshSetup } =
    useTeacherSectionScope();

  const sections = useMemo(
    () => setup?.sections.map((section) => ({ id: section.id, label: section.label })) ?? [],
    [setup?.sections]
  );
  const showSectionFilter = setup?.showSectionFilter ?? true;
  const resolvedSectionId = showSectionFilter ? sectionId : activeSectionId;

  const [grid, setGrid] = useState<HtpoSectionTimetableGrid | null>(null);
  const [loading, setLoading] = useState(true);
  const [archivingSlotId, setArchivingSlotId] = useState<string | null>(null);
  const [archivingPeriodKey, setArchivingPeriodKey] = useState<string | null>(null);

  const selectedSection = useMemo(
    () => sections.find((section) => section.id === resolvedSectionId) ?? sections[0],
    [resolvedSectionId, sections]
  );

  const loadGrid = useCallback(async () => {
    if (!resolvedSectionId) {
      setGrid(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await authFetch(`/api/portals/teacher/timetable/sections/${resolvedSectionId}`);
      if (!res.ok) throw new Error("Could not load section timetable.");
      const data = (await res.json()) as HtpoSectionTimetableGrid;
      setGrid(data);
    } catch (error) {
      setGrid(null);
      showToast(error instanceof Error ? error.message : "Could not load timetable.", "error");
    } finally {
      setLoading(false);
    }
  }, [authFetch, resolvedSectionId, showToast]);

  useEffect(() => {
    void loadGrid();
  }, [loadGrid]);

  const canEdit = grid?.canEdit ?? false;

  const archiveSlot = useCallback(
    async (cell: SectionTimetableOccupiedCell) => {
      if (!resolvedSectionId) return;
      const confirmed = await confirm({
        title: "Remove timetable slot?",
        message: "This removes the slot from the section timetable.",
        itemName: `${cell.subjectName} · ${cell.dayLabel}`,
        confirmLabel: "Remove slot"
      });
      if (!confirmed) return;

      setArchivingSlotId(cell.slotId);
      try {
        const res = await authFetch(
          `/api/portals/teacher/timetable/sections/${resolvedSectionId}/slots/${cell.slotId}/archive`,
          { method: "POST", headers: { "Content-Type": "application/json" } }
        );
        if (!res.ok) {
          throw new Error(await readApiErrorMessage(res, "Could not remove slot."));
        }
        showToast("Timetable slot removed.", "success");
        void loadGrid();
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Could not remove slot.", "error");
      } finally {
        setArchivingSlotId(null);
      }
    },
    [authFetch, confirm, loadGrid, resolvedSectionId, showToast]
  );

  const archivePeriod = useCallback(
    async (row: SectionTimetableGridRow) => {
      if (!resolvedSectionId || !rowHasOccupiedSlots(row)) return;
      const confirmed = await confirm({
        title: "Remove this time period?",
        message: "This removes every slot in this row across all days.",
        itemName: row.label,
        confirmLabel: "Remove period"
      });
      if (!confirmed) return;

      const key = periodKey(row);
      setArchivingPeriodKey(key);
      try {
        const res = await authFetch(`/api/portals/teacher/timetable/sections/${resolvedSectionId}/periods/archive`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startTime: row.startTime, endTime: row.endTime })
        });
        if (!res.ok) {
          throw new Error(await readApiErrorMessage(res, "Could not remove time period."));
        }
        const result = (await res.json()) as { archivedCount?: number };
        showToast(`Removed ${result.archivedCount ?? "all"} slot(s) for ${row.label}.`, "success");
        void loadGrid();
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Could not remove time period.", "error");
      } finally {
        setArchivingPeriodKey(null);
      }
    },
    [authFetch, confirm, loadGrid, resolvedSectionId, showToast]
  );

  if (scopeLoading) {
    return <p className="htpo-section-tt-loading">Loading section scope…</p>;
  }

  if (scopeError) {
    return (
      <TpCard className="htpo-section-tt-card">
        <p className="htpo-section-tt-empty">{scopeError}</p>
        <button type="button" className="db-wf-btn mt-3" onClick={() => void refreshSetup()}>
          Retry
        </button>
      </TpCard>
    );
  }

  return (
    <TpCard className="htpo-section-tt-card">
      <header className="htpo-section-tt-head">
        <h2 className="htpo-section-tt-title">Section timetable</h2>
        <div className="htpo-section-tt-head-actions">
          {showSectionFilter ? (
            <label className="htpo-section-tt-select-wrap">
              <select
                className="htpo-section-tt-select"
                value={sectionId}
                onChange={(event) => setSectionId(event.target.value)}
                disabled={!sections.length}
              >
                {sections.length ? (
                  sections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.label}
                    </option>
                  ))
                ) : (
                  <option value="">No sections</option>
                )}
              </select>
              <ChevronDown size={16} className="htpo-section-tt-select-icon" aria-hidden />
            </label>
          ) : (
            <TeacherSectionScopeFilter />
          )}
          {canEdit ? (
            <button
              type="button"
              className="htpo-section-tt-edit-btn"
              onClick={() => void navigate(`/teacher/timetable/edit?sectionId=${encodeURIComponent(resolvedSectionId)}`)}
            >
              <Plus size={14} aria-hidden />
              Edit timetable
            </button>
          ) : null}
        </div>
      </header>

      {loading ? (
        <p className="htpo-section-tt-loading">Loading timetable…</p>
      ) : !grid || !grid.rows.length ? (
        <p className="htpo-section-tt-empty">No timetable published for {selectedSection?.label ?? "this section"} yet.</p>
      ) : (
        <SectionTimetableGridView
          days={grid.days}
          rows={grid.rows}
          canEdit={canEdit}
          archivingSlotId={archivingSlotId}
          archivingPeriodKey={archivingPeriodKey}
          onDeleteSlot={(cell) => void archiveSlot(cell)}
          onDeletePeriod={(row) => void archivePeriod(row)}
        />
      )}

      {confirmDialog}
    </TpCard>
  );
}
