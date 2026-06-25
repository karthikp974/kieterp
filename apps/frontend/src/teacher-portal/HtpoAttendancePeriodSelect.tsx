import { useMemo, useState } from "react";
import { parseIsoDate } from "../shared/calendar-days";
import { FormSelect } from "../shared/FormSelect";
import {
  isPortalCustomRangeValid,
  PortalCustomDateRangeModal,
  type PortalCustomDateRangeDraft
} from "../shared/PortalCustomDateRangeModal";
import {
  buildHtpoAttendanceQuery,
  HTPO_ATTENDANCE_PERIOD_OPTIONS,
  type HtpoAttendancePeriodState
} from "./htpo-attendance-period";
import type { HtpoAttendanceYearOption } from "./teacher-portal-types";

type Props = {
  value: HtpoAttendancePeriodState;
  yearOptions: HtpoAttendanceYearOption[];
  onChange: (next: HtpoAttendancePeriodState) => void;
};

export function HtpoAttendancePeriodSelect({ value, yearOptions, onChange }: Props) {
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState<PortalCustomDateRangeDraft>({
    dateFrom: value.dateFrom,
    dateTo: value.dateTo,
    year: value.year,
    month: value.month
  });

  const portalYearOptions = useMemo(
    () => yearOptions.map((row) => ({ year: row.year, label: row.label, isOngoing: row.isOngoing })),
    [yearOptions]
  );

  function handlePresetChange(nextPeriod: string) {
    if (nextPeriod === "custom") {
      const ongoing = yearOptions.find((row) => row.isOngoing)?.year ?? yearOptions[0]?.year;
      setDraft({
        year: value.year ?? ongoing,
        month: value.month,
        dateFrom: value.dateFrom,
        dateTo: value.dateTo
      });
      setCustomOpen(true);
      return;
    }
    onChange({ period: nextPeriod as HtpoAttendancePeriodState["period"] });
  }

  function applyCustom() {
    if (!isPortalCustomRangeValid(draft)) return;
    onChange({
      period: "custom",
      year: parseIsoDate(draft.dateFrom)?.year,
      dateFrom: draft.dateFrom,
      dateTo: draft.dateTo
    });
    setCustomOpen(false);
  }

  return (
    <>
      <div className="htpo-att-period-controls">
        <FormSelect
          aria-label="Attendance period"
          className="htpo-att-period-select"
          value={value.period}
          options={HTPO_ATTENDANCE_PERIOD_OPTIONS.map(([id, label]) => [id, label] as [string, string])}
          onChange={handlePresetChange}
        />
        {value.period === "custom" ? (
          <button
            type="button"
            className="htpo-att-period-edit"
            onClick={() => {
              setDraft({
                year: value.year,
                month: value.month,
                dateFrom: value.dateFrom,
                dateTo: value.dateTo
              });
              setCustomOpen(true);
            }}
          >
            Edit dates
          </button>
        ) : null}
      </div>

      <PortalCustomDateRangeModal
        open={customOpen}
        draft={draft}
        yearOptions={portalYearOptions}
        onDraftChange={setDraft}
        onClose={() => setCustomOpen(false)}
        onApply={applyCustom}
        applyDisabled={!isPortalCustomRangeValid(draft)}
      />
    </>
  );
}

export function htpoAttendanceQueryString(state: HtpoAttendancePeriodState, search?: string) {
  return buildHtpoAttendanceQuery(state, search);
}

export function formatWorkingDaysMeta(workingDays: number) {
  return `${workingDays} working day${workingDays === 1 ? "" : "s"}`;
}
