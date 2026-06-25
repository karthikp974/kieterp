import { FormSelect, type FormSelectOption } from "../shared/FormSelect";
import { toFormSelectOptions } from "../shared/select-options";
import { useOptionalTeacherSectionScope } from "./TeacherSectionScopeProvider";

export function TeacherSectionScopeFilter({ className = "" }: { className?: string }) {
  const scope = useOptionalTeacherSectionScope();
  if (!scope?.setup) return null;

  const { setup, sectionId, setSectionId, activeSectionId } = scope;
  const activeLabel = setup.sections.find((section) => section.id === activeSectionId)?.label;

  if (!setup.showSectionFilter) {
    if (!activeLabel) return null;
    return (
      <div className={`htpo-engage-section-filter htpo-engage-section-filter--fixed ${className}`.trim()}>
        <span className="htpo-engage-section-filter-label">Section</span>
        <span className="htpo-engage-section-chip">{activeLabel}</span>
      </div>
    );
  }

  const options = toFormSelectOptions(setup.sections.map((section) => [section.id, section.label] as const)) as readonly FormSelectOption[];

  return (
    <div className={`htpo-engage-section-filter ${className}`.trim()}>
      <label className="htpo-engage-section-filter-field">
        <span className="htpo-engage-section-filter-label">Section</span>
        <FormSelect value={sectionId} options={options} onChange={setSectionId} />
      </label>
    </div>
  );
}
