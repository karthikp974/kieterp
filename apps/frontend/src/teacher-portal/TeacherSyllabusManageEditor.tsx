import { FormEvent, useCallback, useEffect, useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useAuth } from "../auth/auth-context";
import { readApiErrorMessage } from "../shared/api-error";
import { usePortalConfirm } from "../shared/PortalConfirmDialog";
import { useToast } from "../shared/toast-context";
import { TpCard, TpCardHead } from "./teacher-portal-ui";
import type { TeacherSyllabusUnit } from "./teacher-syllabus-types";

type EditorTopic = {
  key: string;
  id?: string;
  topicTitle: string;
  editing: boolean;
};

type EditorUnit = {
  key: string;
  id?: string;
  unitTitle: string;
  editing: boolean;
  topics: EditorTopic[];
};

function newTopic(title = ""): EditorTopic {
  return { key: `topic-${Math.random().toString(36).slice(2)}`, topicTitle: title, editing: false };
}

function newUnit(title = "Unit 1", withTopic = true): EditorUnit {
  return {
    key: `unit-${Math.random().toString(36).slice(2)}`,
    unitTitle: title,
    editing: false,
    topics: withTopic ? [newTopic("Topic 1")] : []
  };
}

function unitsFromApi(units: TeacherSyllabusUnit[]): EditorUnit[] {
  return units.map((unit, unitIndex) => ({
    key: unit.id,
    id: unit.id,
    unitTitle: unit.unitTitle,
    editing: false,
    topics: unit.topics.map((topic, topicIndex) => ({
      key: topic.id,
      id: topic.id,
      topicTitle: topic.topicTitle || `Topic ${topicIndex + 1}`,
      editing: false
    }))
  }));
}

export function TeacherSyllabusManageEditor({
  mode,
  subjectId,
  subjectLabel,
  initialUnits,
  onDone
}: {
  mode: "create" | "edit";
  subjectId: string;
  subjectLabel: string;
  initialUnits: TeacherSyllabusUnit[];
  onDone: () => void;
}) {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const { confirm, dialog: confirmDialog } = usePortalConfirm();

  const [units, setUnits] = useState<EditorUnit[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [pendingAddTopicUnitKey, setPendingAddTopicUnitKey] = useState<string | null>(null);
  const [pendingTopicTitle, setPendingTopicTitle] = useState("");

  useEffect(() => {
    if (mode === "create") {
      setUnits([newUnit("Unit 1", false)]);
    } else {
      setUnits(initialUnits.length ? unitsFromApi(initialUnits) : [newUnit("Unit 1", false)]);
    }
    setDrafts({});
    setPendingAddTopicUnitKey(null);
    setPendingTopicTitle("");
  }, [mode, initialUnits]);

  const setDraft = (key: string, value: string) => setDrafts((current) => ({ ...current, [key]: value }));

  async function createAllUnits() {
    setSaving(true);
    try {
      const first = units[0];
      if (!first?.unitTitle.trim()) throw new Error("Unit 1 name is required.");

      const createRes = await authFetch(`/api/portals/teacher/syllabus/subjects/${subjectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initialUnitTitle: first.unitTitle.trim() })
      });
      if (!createRes.ok) throw new Error(await readApiErrorMessage(createRes, "Could not create syllabus."));
      const created = (await createRes.json()) as { syllabus: { units: { id: string }[] } };
      const firstUnitId = created.syllabus.units[0]?.id;
      if (!firstUnitId) throw new Error("Could not create the first unit.");

      for (const topic of first.topics) {
        const title = topic.topicTitle.trim();
        if (!title) continue;
        const topicRes = await authFetch(`/api/portals/teacher/syllabus/units/${firstUnitId}/topics`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topicTitle: title })
        });
        if (!topicRes.ok) throw new Error(await readApiErrorMessage(topicRes, "Could not add topic."));
      }

      for (let index = 1; index < units.length; index++) {
        const unit = units[index]!;
        const unitRes = await authFetch(`/api/portals/teacher/syllabus/subjects/${subjectId}/units`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ unitTitle: unit.unitTitle.trim() || `Unit ${index + 1}` })
        });
        if (!unitRes.ok) throw new Error(await readApiErrorMessage(unitRes, "Could not add unit."));
        const unitData = (await unitRes.json()) as { unit: { id: string } };
        for (const topic of unit.topics) {
          const title = topic.topicTitle.trim();
          if (!title) continue;
          const topicRes = await authFetch(`/api/portals/teacher/syllabus/units/${unitData.unit.id}/topics`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ topicTitle: title })
          });
          if (!topicRes.ok) throw new Error(await readApiErrorMessage(topicRes, "Could not add topic."));
        }
      }

      showToast("Syllabus created.");
      onDone();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not create syllabus.", "error");
    } finally {
      setSaving(false);
    }
  }

  const saveUnitTitle = useCallback(
    async (unit: EditorUnit) => {
      const title = (drafts[unit.key] ?? unit.unitTitle).trim();
      if (!title) return;
      if (mode === "create" || !unit.id) {
        setUnits((current) =>
          current.map((row) => (row.key === unit.key ? { ...row, unitTitle: title, editing: false } : row))
        );
        return;
      }
      setSaving(true);
      try {
        const res = await authFetch(`/api/portals/teacher/syllabus/units/${unit.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ unitTitle: title })
        });
        if (!res.ok) throw new Error(await readApiErrorMessage(res, "Could not update unit."));
        setUnits((current) =>
          current.map((row) => (row.key === unit.key ? { ...row, unitTitle: title, editing: false } : row))
        );
        showToast("Unit updated.");
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Could not update unit.", "error");
      } finally {
        setSaving(false);
      }
    },
    [authFetch, drafts, mode, showToast]
  );

  const saveTopicTitle = useCallback(
    async (unit: EditorUnit, topic: EditorTopic) => {
      const title = (drafts[topic.key] ?? topic.topicTitle).trim();
      if (!title) return;
      if (mode === "create" || !topic.id || !unit.id) {
        setUnits((current) =>
          current.map((row) =>
            row.key === unit.key
              ? {
                  ...row,
                  topics: row.topics.map((t) => (t.key === topic.key ? { ...t, topicTitle: title, editing: false } : t))
                }
              : row
          )
        );
        return;
      }
      setSaving(true);
      try {
        const res = await authFetch(`/api/portals/teacher/syllabus/topics/${topic.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topicTitle: title })
        });
        if (!res.ok) throw new Error(await readApiErrorMessage(res, "Could not update topic."));
        setUnits((current) =>
          current.map((row) =>
            row.key === unit.key
              ? {
                  ...row,
                  topics: row.topics.map((t) => (t.key === topic.key ? { ...t, topicTitle: title, editing: false } : t))
                }
              : row
          )
        );
        showToast("Topic updated.");
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Could not update topic.", "error");
      } finally {
        setSaving(false);
      }
    },
    [authFetch, drafts, mode, showToast]
  );

  async function deleteUnit(unit: EditorUnit) {
    if (mode === "create" || !unit.id) {
      setUnits((current) => (current.length <= 1 ? current : current.filter((row) => row.key !== unit.key)));
      return;
    }
    const ok = await confirm({
      title: "Delete unit?",
      message: "This unit and all its topics will be removed.",
      itemName: unit.unitTitle,
      confirmLabel: "Delete"
    });
    if (!ok) return;
    setSaving(true);
    try {
      const res = await authFetch(`/api/portals/teacher/syllabus/units/${unit.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readApiErrorMessage(res, "Could not delete unit."));
      setUnits((current) => current.filter((row) => row.key !== unit.key));
      showToast("Unit removed.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not delete unit.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTopic(unit: EditorUnit, topic: EditorTopic) {
    if (mode === "create" || !topic.id) {
      setUnits((current) =>
        current.map((row) =>
          row.key === unit.key ? { ...row, topics: row.topics.filter((t) => t.key !== topic.key) } : row
        )
      );
      return;
    }
    const ok = await confirm({
      title: "Delete topic?",
      message: "This topic will be removed from the unit.",
      itemName: topic.topicTitle,
      confirmLabel: "Delete"
    });
    if (!ok) return;
    setSaving(true);
    try {
      const res = await authFetch(`/api/portals/teacher/syllabus/topics/${topic.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readApiErrorMessage(res, "Could not delete topic."));
      setUnits((current) =>
        current.map((row) =>
          row.key === unit.key ? { ...row, topics: row.topics.filter((t) => t.key !== topic.key) } : row
        )
      );
      showToast("Topic removed.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not delete topic.", "error");
    } finally {
      setSaving(false);
    }
  }

  function startAddTopic(unit: EditorUnit) {
    setPendingAddTopicUnitKey(unit.key);
    setPendingTopicTitle("");
  }

  function cancelAddTopic() {
    setPendingAddTopicUnitKey(null);
    setPendingTopicTitle("");
  }

  async function confirmAddTopic(unit: EditorUnit) {
    const title = pendingTopicTitle.trim();
    if (!title) {
      showToast("Enter a topic name.", "error");
      return;
    }
    await addTopicToUnit(unit, title);
    cancelAddTopic();
  }

  async function addTopicToUnit(unit: EditorUnit, title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;
    if (mode === "create" || !unit.id) {
      setUnits((current) =>
        current.map((row) => (row.key === unit.key ? { ...row, topics: [...row.topics, newTopic(trimmed)] } : row))
      );
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch(`/api/portals/teacher/syllabus/units/${unit.id}/topics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicTitle: trimmed })
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res, "Could not add topic."));
      const data = (await res.json()) as { topic: { id: string; topicTitle: string } };
      setUnits((current) =>
        current.map((row) =>
          row.key === unit.key
            ? {
                ...row,
                topics: [...row.topics, { key: data.topic.id, id: data.topic.id, topicTitle: data.topic.topicTitle, editing: false }]
              }
            : row
        )
      );
      showToast("Topic added.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not add topic.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function addUnit() {
    const nextIndex = units.length + 1;
    const title = `Unit ${nextIndex}`;
    if (mode === "create") {
      setUnits((current) => [...current, newUnit(title, false)]);
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch(`/api/portals/teacher/syllabus/subjects/${subjectId}/units`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitTitle: title })
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res, "Could not add unit."));
      const data = (await res.json()) as { unit: { id: string; unitTitle: string } };
      setUnits((current) => [
        ...current,
        { key: data.unit.id, id: data.unit.id, unitTitle: data.unit.unitTitle, editing: false, topics: [] }
      ]);
      showToast("Unit added.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not add unit.", "error");
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (mode === "create") void createAllUnits();
    else onDone();
  }

  return (
    <>
      <form className="teacher-portal-module-stack tp-syllabus-manage-page" onSubmit={handleSubmit}>
        <TpCard className="tp-syllabus-card">
          <TpCardHead title={mode === "create" ? "Create syllabus" : "Manage syllabus"} />
          <p className="tp-syllabus-manage-sub">{subjectLabel}</p>
        </TpCard>

        <div className="tp-syllabus-manage-units">
          {units.map((unit, unitIndex) => (
            <TpCard key={unit.key} className="tp-syllabus-card tp-syllabus-manage-unit-card">
              <div className="tp-syllabus-manage-unit-head">
                {unit.editing ? (
                  <input
                    className="db-input"
                    value={drafts[unit.key] ?? unit.unitTitle}
                    onChange={(event) => setDraft(unit.key, event.target.value)}
                    placeholder={`Unit ${unitIndex + 1} name`}
                    autoFocus
                  />
                ) : (
                  <h3>
                    Unit {unitIndex + 1} — {unit.unitTitle}
                  </h3>
                )}
                <div className="tp-syllabus-manage-actions">
                  <button
                    type="button"
                    className="tp-syllabus-sheet-icon-btn"
                    disabled={saving}
                    aria-label={unit.editing ? "Save unit" : "Edit unit"}
                    onClick={() => {
                      if (unit.editing) void saveUnitTitle(unit);
                      else {
                        setDraft(unit.key, unit.unitTitle);
                        setUnits((current) =>
                          current.map((row) => (row.key === unit.key ? { ...row, editing: true } : row))
                        );
                      }
                    }}
                  >
                    {unit.editing ? <Check size={16} aria-hidden /> : <Pencil size={16} aria-hidden />}
                  </button>
                  <button
                    type="button"
                    className="tp-syllabus-sheet-icon-btn tp-syllabus-sheet-icon-btn--danger"
                    disabled={saving || (units.length <= 1 && mode === "create")}
                    aria-label="Delete unit"
                    onClick={() => void deleteUnit(unit)}
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </div>
              </div>

              <ul className="tp-syllabus-manage-topics">
                {unit.topics.map((topic, topicIndex) => (
                  <li key={topic.key} className="tp-syllabus-manage-topic-row">
                    {topic.editing ? (
                      <input
                        className="db-input"
                        value={drafts[topic.key] ?? topic.topicTitle}
                        onChange={(event) => setDraft(topic.key, event.target.value)}
                        placeholder={`Name topic ${topicIndex + 1}`}
                        autoFocus
                      />
                    ) : (
                      <span>
                        <span className="tp-syllabus-topic-no">Topic {topicIndex + 1}</span> {topic.topicTitle}
                      </span>
                    )}
                    <div className="tp-syllabus-manage-actions">
                      <button
                        type="button"
                        className="tp-syllabus-sheet-icon-btn"
                        disabled={saving}
                        aria-label={topic.editing ? "Save topic" : "Edit topic"}
                        onClick={() => {
                          if (topic.editing) void saveTopicTitle(unit, topic);
                          else {
                            setDraft(topic.key, topic.topicTitle);
                            setUnits((current) =>
                              current.map((row) =>
                                row.key === unit.key
                                  ? {
                                      ...row,
                                      topics: row.topics.map((t) =>
                                        t.key === topic.key ? { ...t, editing: true } : t
                                      )
                                    }
                                  : row
                              )
                            );
                          }
                        }}
                      >
                        {topic.editing ? <Check size={16} aria-hidden /> : <Pencil size={16} aria-hidden />}
                      </button>
                      <button
                        type="button"
                        className="tp-syllabus-sheet-icon-btn tp-syllabus-sheet-icon-btn--danger"
                        disabled={saving}
                        aria-label="Delete topic"
                        onClick={() => void deleteTopic(unit, topic)}
                      >
                        <Trash2 size={16} aria-hidden />
                      </button>
                      {topicIndex === unit.topics.length - 1 && pendingAddTopicUnitKey !== unit.key ? (
                        <button
                          type="button"
                          className="tp-syllabus-sheet-icon-btn tp-syllabus-sheet-icon-btn--add"
                          disabled={saving}
                          aria-label="Add topic"
                          onClick={() => startAddTopic(unit)}
                        >
                          <Plus size={18} strokeWidth={2.5} aria-hidden />
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}

                {pendingAddTopicUnitKey === unit.key ? (
                  <li className="tp-syllabus-manage-topic-row tp-syllabus-manage-topic-row--pending">
                    <input
                      className="db-input"
                      value={pendingTopicTitle}
                      onChange={(event) => setPendingTopicTitle(event.target.value)}
                      placeholder="Topic name"
                      autoFocus
                      disabled={saving}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void confirmAddTopic(unit);
                        }
                        if (event.key === "Escape") cancelAddTopic();
                      }}
                    />
                    <div className="tp-syllabus-manage-actions">
                      <button
                        type="button"
                        className="tp-syllabus-sheet-icon-btn tp-syllabus-sheet-icon-btn--add"
                        disabled={saving}
                        aria-label="Add topic"
                        onClick={() => void confirmAddTopic(unit)}
                      >
                        <Check size={16} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="tp-syllabus-sheet-icon-btn"
                        disabled={saving}
                        aria-label="Cancel"
                        onClick={cancelAddTopic}
                      >
                        <X size={16} aria-hidden />
                      </button>
                    </div>
                  </li>
                ) : null}

                {unit.topics.length === 0 && pendingAddTopicUnitKey !== unit.key ? (
                  <li className="tp-syllabus-manage-topic-row tp-syllabus-manage-topic-row--add-only">
                    <span className="tp-syllabus-muted">No topics yet.</span>
                    <button
                      type="button"
                      className="tp-syllabus-sheet-icon-btn tp-syllabus-sheet-icon-btn--add"
                      disabled={saving}
                      aria-label="Add topic"
                      onClick={() => startAddTopic(unit)}
                    >
                      <Plus size={18} strokeWidth={2.5} aria-hidden />
                    </button>
                  </li>
                ) : null}
              </ul>
            </TpCard>
          ))}
        </div>

        <button type="button" className="db-wf-btn db-wf-btn--primary tp-syllabus-manage-add-unit" disabled={saving} onClick={() => void addUnit()}>
          + Add unit
        </button>

        <div className="tp-syllabus-manage-footer">
          <button type="button" className="db-wf-btn" onClick={onDone} disabled={saving}>
            {mode === "edit" ? "Back" : "Cancel"}
          </button>
          {mode === "create" ? (
            <button type="submit" className="db-wf-btn db-wf-btn--primary" disabled={saving}>
              {saving ? "Please wait…" : "Create syllabus"}
            </button>
          ) : null}
        </div>
      </form>
      {confirmDialog}
    </>
  );
}
