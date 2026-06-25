import { FormEvent, useCallback, useEffect, useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { readApiErrorMessage } from "../../shared/api-error";
import { FormSelect } from "../../shared/FormSelect";
import { FormTimeSelect } from "../../shared/FormTimeSelect";
import { isValid24hTime } from "../../shared/time-select";
import { usePortalConfirm } from "../../shared/PortalConfirmDialog";
import { safeRandomId } from "../../shared/safe-random-id";
import { useToast } from "../../shared/toast-context";
import { RequireTeacherModule } from "../RequireTeacherModule";
import type { HtpoSectionTimetableGrid, HtpoTimetableSectionOption } from "../htpo-section-timetable-types";

type SlotType = "LECTURE" | "LAB" | "EXAM";

type EntryRow = {
  id: string;
  slotId?: string;
  startTime: string;
  endTime: string;
  subjectId: string;
  slotType: SlotType;
};

const DAY_OPTIONS: [string, string][] = [
  ["all", "All days"],
  ["1", "Monday"],
  ["2", "Tuesday"],
  ["3", "Wednesday"],
  ["4", "Thursday"],
  ["5", "Friday"],
  ["6", "Saturday"],
  ["7", "Sunday"]
];

const TYPE_OPTIONS: [SlotType, string][] = [
  ["LECTURE", "Theory"],
  ["LAB", "Lab"],
  ["EXAM", "Exam"]
];

function newRow(subjects: HtpoSectionTimetableGrid["subjects"]): EntryRow {
  return {
    id: safeRandomId("tt-row"),
    startTime: "",
    endTime: "",
    subjectId: subjects[0]?.id ?? "",
    slotType: "LECTURE"
  };
}

function rowsFromGrid(data: HtpoSectionTimetableGrid, day: string): EntryRow[] {
  if (day === "all") return [newRow(data.subjects)];

  const dayNum = Number(day);
  const existing: EntryRow[] = [];

  for (const row of data.rows) {
    const cell = row.cells.find((item) => item.dayOfWeek === dayNum && item.kind === "occupied");
    if (cell && cell.kind === "occupied") {
      existing.push({
        id: cell.slotId,
        slotId: cell.slotId,
        startTime: row.startTime,
        endTime: row.endTime,
        subjectId: cell.subjectId ?? data.subjects[0]?.id ?? "",
        slotType: cell.slotType
      });
    }
  }

  return existing.length ? existing : [newRow(data.subjects)];
}

export function TeacherPortalEditTimetablePage() {
  const formId = useId();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const { confirm, dialog: confirmDialog } = usePortalConfirm();

  const [sections, setSections] = useState<HtpoTimetableSectionOption[]>([]);
  const [sectionId, setSectionId] = useState(searchParams.get("sectionId") ?? "");
  const [day, setDay] = useState("1");
  const [rows, setRows] = useState<EntryRow[]>(() => [newRow([])]);
  const [subjects, setSubjects] = useState<HtpoSectionTimetableGrid["subjects"]>([]);
  const [sectionGrid, setSectionGrid] = useState<HtpoSectionTimetableGrid | null>(null);
  const [loadingSections, setLoadingSections] = useState(true);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [saving, setSaving] = useState(false);
  const [archivingSlotId, setArchivingSlotId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoadingSections(true);
    void authFetch("/api/portals/teacher/timetable/sections")
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load sections.");
        return (await res.json()) as { sections: HtpoTimetableSectionOption[] };
      })
      .then((data) => {
        if (!alive) return;
        setSections(data.sections);
        const fromQuery = searchParams.get("sectionId");
        const initial = fromQuery && data.sections.some((s) => s.id === fromQuery) ? fromQuery : data.sections[0]?.id ?? "";
        setSectionId(initial);
      })
      .catch((error) => showToast(error instanceof Error ? error.message : "Could not load sections.", "error"))
      .finally(() => {
        if (alive) setLoadingSections(false);
      });
    return () => {
      alive = false;
    };
  }, [authFetch, searchParams, showToast]);

  const loadSubjects = useCallback(
    async (targetSectionId: string) => {
      if (!targetSectionId) {
        setSubjects([]);
        setRows([]);
        return;
      }
      setLoadingSubjects(true);
      try {
        const res = await authFetch(`/api/portals/teacher/timetable/sections/${targetSectionId}`);
        if (!res.ok) throw new Error("Could not load section subjects.");
        const data = (await res.json()) as HtpoSectionTimetableGrid;
        if (!data.canEdit) {
          showToast("You cannot edit timetable for this section.", "error");
          void navigate("/teacher/timetable", { replace: true });
          return;
        }
        setSubjects(data.subjects);
        setSectionGrid(data);
        setRows(rowsFromGrid(data, day));
      } catch (error) {
        setSubjects([]);
        setSectionGrid(null);
        setRows([newRow([])]);
        showToast(error instanceof Error ? error.message : "Could not load subjects.", "error");
      } finally {
        setLoadingSubjects(false);
      }
    },
    [authFetch, navigate, showToast]
  );

  useEffect(() => {
    if (!sectionId || loadingSections) return;
    void loadSubjects(sectionId);
  }, [sectionId, loadingSections, loadSubjects]);

  useEffect(() => {
    if (!sectionGrid) return;
    setRows(rowsFromGrid(sectionGrid, day));
  }, [day, sectionGrid]);

  function addRow() {
    setRows((current) => [...current, newRow(subjects)]);
  }

  function updateRow(id: string, patch: Partial<EntryRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  async function removeRow(row: EntryRow) {
    if (row.slotId) {
      const dayLabel = DAY_OPTIONS.find(([value]) => value === day)?.[1] ?? "this day";
      const confirmed = await confirm({
        title: "Remove timetable slot?",
        message: "This removes the slot from the section timetable.",
        itemName: `${subjects.find((s) => s.id === row.subjectId)?.name ?? "Slot"} · ${dayLabel}`,
        confirmLabel: "Remove slot"
      });
      if (!confirmed) return;

      setArchivingSlotId(row.slotId);
      try {
        const res = await authFetch(
          `/api/portals/teacher/timetable/sections/${sectionId}/slots/${row.slotId}/archive`,
          { method: "POST", headers: { "Content-Type": "application/json" } }
        );
        if (!res.ok) {
          throw new Error(await readApiErrorMessage(res, "Could not remove slot."));
        }
        showToast("Timetable slot removed.", "success");
        await loadSubjects(sectionId);
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Could not remove slot.", "error");
      } finally {
        setArchivingSlotId(null);
      }
      return;
    }

    setRows((current) => {
      if (current.length <= 1) return current;
      return current.filter((item) => item.id !== row.id);
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!sectionId) {
      showToast("Select a section.", "error");
      return;
    }
    if (!day) {
      showToast("Select a day.", "error");
      return;
    }
    if (!subjects.length) {
      showToast("No subjects found for this section.", "error");
      return;
    }
    const newRows = rows.filter((row) => !row.slotId);
    if (!newRows.length) {
      showToast("Add at least one new time slot to save.", "error");
      return;
    }

    for (const row of newRows) {
      if (!row.subjectId) {
        showToast("Select a subject for every time slot.", "error");
        return;
      }
      if (!row.slotType) {
        showToast("Select a type for every time slot.", "error");
        return;
      }
      if (!isValid24hTime(row.startTime) || !isValid24hTime(row.endTime)) {
        showToast("Set start and end time (24-hour HH:mm) for every new slot.", "error");
        return;
      }
      if (row.startTime >= row.endTime) {
        showToast("End time must be after start time for every slot.", "error");
        return;
      }
    }

    setSaving(true);
    try {
      const res = await authFetch(`/api/portals/teacher/timetable/sections/${sectionId}/slots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allDays: day === "all",
          dayOfWeek: day === "all" ? undefined : Number(day),
          entries: newRows.map((row) => ({
            startTime: row.startTime,
            endTime: row.endTime,
            subjectId: row.subjectId,
            slotType: row.slotType
          }))
        })
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Could not add timetable slots.");
      }
      const result = (await res.json()) as { createdCount: number; errors?: string[] };
      if (result.errors?.length) {
        showToast(`Added ${result.createdCount} slot(s). Some slots failed.`, "error");
      } else {
        showToast(`Added ${result.createdCount} slot(s).`, "success");
      }
      void navigate("/teacher/timetable", { replace: true });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not add slots.", "error");
    } finally {
      setSaving(false);
    }
  }

  function canDeleteRow(row: EntryRow) {
    if (row.slotId) return day !== "all";
    return rows.length > 1;
  }

  const sectionOptions = sections.map((s) => [s.id, s.label] as [string, string]);
  const subjectOptions = subjects.map((s) => [s.id, `${s.name} (${s.code})`] as [string, string]);

  return (
    <RequireTeacherModule moduleKey="timetable">
      <div className="htpo-edit-tt-page-wrap">
      <form
        id={`${formId}-form`}
        className="htpo-edit-tt-page"
        onSubmit={(e) => void submit(e)}
        aria-labelledby={`${formId}-title`}
      >
        <label className="htpo-edit-tt-field">
          <span className="htpo-edit-tt-label">Section</span>
          <FormSelect
            value={sectionId}
            options={sectionOptions}
            onChange={setSectionId}
            disabled={loadingSections || !sections.length}
            required
          />
        </label>

        <label className="htpo-edit-tt-field">
          <span className="htpo-edit-tt-label">Day</span>
          <FormSelect value={day} options={DAY_OPTIONS} onChange={setDay} required />
        </label>

        <div className="htpo-edit-tt-rows">
          {loadingSubjects ? <p className="htpo-edit-tt-loading">Loading time slots…</p> : null}
          {rows.map((row, index) => {
            const isLast = index === rows.length - 1;
            const showDelete = canDeleteRow(row);

            return (
            <div key={row.id} className="htpo-edit-tt-row">
              <div className="htpo-edit-tt-row-head">
                <span className="htpo-edit-tt-row-title">
                  {row.slotId ? `Existing slot ${index + 1}` : `Time slot ${index + 1}`}
                </span>
                <div className="htpo-edit-tt-row-actions">
                  {showDelete ? (
                    <button
                      type="button"
                      className="htpo-edit-tt-row-delete"
                      aria-label={`Remove time slot ${index + 1}`}
                      disabled={Boolean(archivingSlotId) || saving}
                      onClick={() => void removeRow(row)}
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  ) : null}
                  {isLast ? (
                    <button type="button" className="htpo-edit-tt-add-row" onClick={addRow} aria-label="Add another slot">
                      <Plus size={16} aria-hidden />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="htpo-edit-tt-time-row">
                <label className="htpo-edit-tt-field">
                  <span className="htpo-edit-tt-label">Starting time</span>
                  <FormTimeSelect
                    aria-label="Starting time"
                    value={row.startTime}
                    disabled={Boolean(row.slotId)}
                    required={!row.slotId}
                    onChange={(startTime) => updateRow(row.id, { startTime })}
                  />
                </label>
                <label className="htpo-edit-tt-field">
                  <span className="htpo-edit-tt-label">Ending time</span>
                  <FormTimeSelect
                    aria-label="Ending time"
                    value={row.endTime}
                    disabled={Boolean(row.slotId)}
                    required={!row.slotId}
                    onChange={(endTime) => updateRow(row.id, { endTime })}
                  />
                </label>
              </div>

              <label className="htpo-edit-tt-field">
                <span className="htpo-edit-tt-label">Subject</span>
                <FormSelect
                  value={row.subjectId}
                  options={subjectOptions}
                  onChange={(value) => updateRow(row.id, { subjectId: value })}
                  disabled={loadingSubjects || !subjectOptions.length || Boolean(row.slotId)}
                  required={!row.slotId}
                />
              </label>

              <label className="htpo-edit-tt-field">
                <span className="htpo-edit-tt-label">Type</span>
                <FormSelect
                  value={row.slotType}
                  options={TYPE_OPTIONS}
                  onChange={(value) => updateRow(row.id, { slotType: value as SlotType })}
                  disabled={Boolean(row.slotId)}
                  required={!row.slotId}
                />
              </label>
            </div>
            );
          })}
        </div>

        <div className="htpo-edit-tt-page-actions" role="group" aria-label="Timetable slot actions">
          <button
            type="submit"
            className="htpo-edit-tt-submit"
            disabled={saving || loadingSubjects || loadingSections || !rows.some((row) => !row.slotId)}
          >
            {saving ? "Adding…" : "Add slot"}
          </button>
          <button
            type="button"
            className="htpo-edit-tt-cancel"
            disabled={saving}
            onClick={() => void navigate("/teacher/timetable")}
          >
            Cancel
          </button>
        </div>
      </form>
      {confirmDialog}
      </div>
    </RequireTeacherModule>
  );
}
