import type { StudentFeeYearBreakdown } from "./student-fees-types";
import { StudentFeeYearBreakdownCard } from "./StudentFeeYearBreakdownCard";

type Props = {
  breakdown: StudentFeeYearBreakdown;
};

export function StudentFeeDetailsSection({ breakdown }: Props) {
  const previousYears = [...(breakdown.completedYears ?? [])].reverse();

  return (
    <section className="sp-fee-details" aria-labelledby="sp-fee-details-title">
      <h2 id="sp-fee-details-title" className="sp-fee-panel-title">
        Fee details
      </h2>

      <div className="sp-fee-details-current">
        <StudentFeeYearBreakdownCard year={breakdown.ongoingYear} />
      </div>

      {previousYears.length > 0 ? (
        <div className="sp-fee-details-previous">
          <h3 className="sp-fee-details-previous-title">Previous years</h3>
          <div className="sp-fee-details-year-list">
            {previousYears.map((year) => (
              <StudentFeeYearBreakdownCard key={year.yearNumber} year={year} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
