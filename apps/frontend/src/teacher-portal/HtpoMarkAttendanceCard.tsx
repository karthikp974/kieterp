import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FormSelect } from "../shared/FormSelect";
import { TeacherSectionScopeFilter } from "./TeacherSectionScopeFilter";
import { useOptionalTeacherSectionScope } from "./TeacherSectionScopeProvider";
import type { HtpoSupervisionSection } from "./teacher-portal-types";
import { TpCard, TpCardHead } from "./teacher-portal-ui";

export function HtpoMarkAttendanceCard({ sections }: { sections: HtpoSupervisionSection[] }) {
  const navigate = useNavigate();
  const scope = useOptionalTeacherSectionScope();
  const showSectionFilter = scope?.setup?.showSectionFilter ?? true;
  const fixedSectionId = scope?.setup?.fixedSectionId ?? null;
  const [sectionId, setSectionId] = useState("");

  useEffect(() => {
    if (!showSectionFilter && fixedSectionId) {
      setSectionId(fixedSectionId);
      return;
    }
    if (scope?.activeSectionId) {
      setSectionId(scope.activeSectionId);
    }
  }, [fixedSectionId, scope?.activeSectionId, showSectionFilter]);

  const options: [string, string][] = [
    ["", "Select section"],
    ...sections.map((row) => [row.id, row.label] as [string, string])
  ];

  const activeSectionId = showSectionFilter ? sectionId : fixedSectionId ?? sections[0]?.id ?? "";

  return (
    <TpCard className="htpo-mark-att-card">
      <TpCardHead title="Mark attendance" />
      <div className="htpo-mark-att-card__row">
        {showSectionFilter ? (
          <FormSelect
            aria-label="Section under supervision"
            value={sectionId}
            options={options}
            onChange={setSectionId}
            required
          />
        ) : (
          <TeacherSectionScopeFilter className="htpo-mark-att-card__fixed-section" />
        )}
        <button
          type="button"
          className="db-wf-btn db-wf-btn--primary htpo-mark-att-card__btn"
          disabled={!activeSectionId}
          onClick={() => navigate(`/teacher/attendance/mark/${activeSectionId}`)}
        >
          Mark
        </button>
      </div>
    </TpCard>
  );
}
