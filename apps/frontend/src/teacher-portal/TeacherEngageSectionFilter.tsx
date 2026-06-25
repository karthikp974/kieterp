import { FormSelect, type FormSelectOption } from "../shared/FormSelect";
import { toFormSelectOptions } from "../shared/select-options";
import { useOptionalTeacherEngage } from "./TeacherEngageScopeProvider";

export function TeacherEngageSectionFilter({ className = "" }: { className?: string }) {
  const engage = useOptionalTeacherEngage();
  if (!engage?.setup) return null;

  const { setup, sectionId, setSectionId, activeSectionId } = engage;
  const activeLabel = setup.sections.find((s) => s.id === activeSectionId)?.label;

  if (!setup.showSectionFilter) {
    if (!activeLabel) return null;
    return (
      <div className={`htpo-engage-section-filter htpo-engage-section-filter--fixed ${className}`.trim()}>
        <span className="htpo-engage-section-filter-label">Section</span>
        <span className="htpo-engage-section-chip">{activeLabel}</span>
      </div>
    );
  }

  const options = toFormSelectOptions(setup.sections.map((s) => [s.id, s.label] as const)) as readonly FormSelectOption[];

  return (
    <div className={`htpo-engage-section-filter ${className}`.trim()}>
      <label className="htpo-engage-section-filter-field">
        <span className="htpo-engage-section-filter-label">Section</span>
        <FormSelect
          value={sectionId}
          options={options}
          onChange={(id) => {
            setSectionId(id);
          }}
        />
      </label>
    </div>
  );
}
