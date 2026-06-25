import { Plus, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/auth-context";
import { readApiErrorMessage } from "../shared/api-error";
import { readPortalTheme, useOptionalPortalTheme } from "../shared/portal-theme";
import { useToast } from "../shared/toast-context";
import { useTeacherPortalSheetLock } from "./use-teacher-portal-sheet-lock";

type SheetTopic = {
  key: string;
  topicTitle: string;
};

type SheetUnit = {
  key: string;
  unitTitle: string;
  topics: SheetTopic[];
};

function newTopic(): SheetTopic {
  return { key: `topic-${Math.random().toString(36).slice(2)}`, topicTitle: "" };
}

function newUnit(): SheetUnit {
  return { key: `unit-${Math.random().toString(36).slice(2)}`, unitTitle: "", topics: [] };
}

export function TeacherSyllabusCreateSheet({
  open,
  subjectId,
  subjectLabel,
  onClose,
  onSaved
}: {
  open: boolean;
  subjectId: string;
  subjectLabel: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const portalTheme = useOptionalPortalTheme();
  const themeMode = portalTheme?.mode ?? readPortalTheme();

  const [units, setUnits] = useState<SheetUnit[]>([newUnit()]);
  const [saving, setSaving] = useState(false);

  useTeacherPortalSheetLock(open, onClose);

  useEffect(() => {
    if (open) setUnits([newUnit()]);
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  function updateUnitTitle(unitKey: string, unitTitle: string) {
    setUnits((current) => current.map((row) => (row.key === unitKey ? { ...row, unitTitle } : row)));
  }

  function updateTopicTitle(unitKey: string, topicKey: string, topicTitle: string) {
    setUnits((current) =>
      current.map((row) =>
        row.key === unitKey
          ? { ...row, topics: row.topics.map((topic) => (topic.key === topicKey ? { ...topic, topicTitle } : topic)) }
          : row
      )
    );
  }

  function addTopic(unitKey: string) {
    setUnits((current) =>
      current.map((row) => (row.key === unitKey ? { ...row, topics: [...row.topics, newTopic()] } : row))
    );
  }

  function deleteTopic(unitKey: string, topicKey: string) {
    setUnits((current) =>
      current.map((row) =>
        row.key === unitKey ? { ...row, topics: row.topics.filter((topic) => topic.key !== topicKey) } : row
      )
    );
  }

  function deleteUnit(unitKey: string) {
    setUnits((current) => (current.length <= 1 ? current : current.filter((row) => row.key !== unitKey)));
  }

  function addUnit() {
    setUnits((current) => [...current, newUnit()]);
  }

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
        const unitTitle = unit.unitTitle.trim();
        if (!unitTitle) throw new Error(`Unit ${index + 1} name is required.`);
        const unitRes = await authFetch(`/api/portals/teacher/syllabus/subjects/${subjectId}/units`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ unitTitle })
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
      onSaved();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not create syllabus.", "error");
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void createAllUnits();
  }

  return createPortal(
    <div
      className="portal-root teacher-portal-root tp-portal-sheet-overlay"
      data-portal-theme={themeMode}
      role="presentation"
      onClick={onClose}
    >
      <section
        className="tp-portal-sheet tp-syllabus-create-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tp-syllabus-create-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tp-portal-sheet-head">
          <div>
            <h2 id="tp-syllabus-create-title">Create syllabus</h2>
            <p className="tp-syllabus-sheet-sub">{subjectLabel}</p>
          </div>
          <button type="button" className="tp-portal-sheet-close" aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <form className="tp-portal-sheet-body tp-syllabus-create-body" onSubmit={handleSubmit}>
          <div className="tp-syllabus-create-units">
            {units.map((unit, unitIndex) => (
              <article key={unit.key} className="tp-syllabus-create-unit">
                <div className="tp-syllabus-create-unit-head">
                  <label className="db-field tp-syllabus-create-field">
                    <span>Unit {unitIndex + 1}</span>
                    <input
                      className="db-input"
                      value={unit.unitTitle}
                      placeholder={`Name unit ${unitIndex + 1}`}
                      onChange={(event) => updateUnitTitle(unit.key, event.target.value)}
                      required={unitIndex === 0}
                    />
                  </label>
                  {units.length > 1 ? (
                    <button
                      type="button"
                      className="tp-subjects-glass-btn tp-subjects-glass-btn--danger tp-syllabus-create-delete-unit"
                      disabled={saving}
                      onClick={() => deleteUnit(unit.key)}
                    >
                      Delete unit
                    </button>
                  ) : null}
                </div>

                <ul className="tp-syllabus-create-topics">
                  {unit.topics.map((topic, topicIndex) => (
                    <li key={topic.key} className="tp-syllabus-create-topic-row">
                      <label className="db-field tp-syllabus-create-field">
                        <span>Topic {topicIndex + 1}</span>
                        <input
                          className="db-input"
                          value={topic.topicTitle}
                          placeholder={`Name topic ${topicIndex + 1}`}
                          onChange={(event) => updateTopicTitle(unit.key, topic.key, event.target.value)}
                        />
                      </label>
                      <div className="tp-syllabus-create-topic-actions">
                        <button
                          type="button"
                          className="tp-subjects-glass-btn tp-subjects-glass-btn--danger tp-syllabus-create-action-btn"
                          disabled={saving}
                          onClick={() => deleteTopic(unit.key, topic.key)}
                        >
                          Delete
                        </button>
                        {topicIndex === unit.topics.length - 1 ? (
                          <button
                            type="button"
                            className="db-wf-btn db-wf-btn--primary tp-syllabus-create-add-btn"
                            disabled={saving}
                            aria-label="Add topic"
                            onClick={() => addTopic(unit.key)}
                          >
                            <Plus size={18} strokeWidth={2.5} />
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}

                  {unit.topics.length === 0 ? (
                    <li className="tp-syllabus-create-topic-row tp-syllabus-create-topic-row--add-only">
                      <span className="tp-syllabus-muted">No topics yet.</span>
                      <button
                        type="button"
                        className="db-wf-btn db-wf-btn--primary tp-syllabus-create-add-btn"
                        disabled={saving}
                        aria-label="Add topic"
                        onClick={() => addTopic(unit.key)}
                      >
                        <Plus size={18} strokeWidth={2.5} />
                      </button>
                    </li>
                  ) : null}
                </ul>
              </article>
            ))}
          </div>

          <button type="button" className="db-wf-btn tp-syllabus-create-add-unit" disabled={saving} onClick={addUnit}>
            + Add unit
          </button>

          <div className="tp-portal-sheet-actions">
            <button type="button" className="db-wf-btn" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="db-wf-btn db-wf-btn--primary" disabled={saving}>
              {saving ? "Please wait…" : "Create syllabus"}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body
  );
}
