import type { FeeBreakdownView, StudentFeeYearBlock } from "./student-fees-types";
import { formatFeeDueDate } from "./format-fee-due-date";
import {
  StudentFeeBreakdownAmount,
  StudentFeeBreakdownRowActions,
  StudentFeeBreakdownStatusBadge
} from "./StudentFeeBreakdownRowActions";

type Props = {
  year: StudentFeeYearBlock;
  view?: FeeBreakdownView;
};

export function StudentFeeYearBreakdownCard({ year, view = "total" }: Props) {
  return (
    <section className="sp-fee-sem-card" aria-labelledby={`sp-fee-year-${year.yearNumber}`}>
      <header className="sp-fee-sem-card-head">
        <h3 id={`sp-fee-year-${year.yearNumber}`}>{year.yearLabel}</h3>
        {year.isOngoing ? <span className="sp-fee-sem-tag">Current year</span> : <span className="sp-fee-sem-tag sp-fee-sem-tag--done">Completed</span>}
      </header>
      <div className="sp-fee-sem-table-wrap">
        <table className="sp-fee-table sp-fee-table--breakdown">
          <thead>
            <tr>
              <th>Fee head</th>
              <th>Amount</th>
              <th>Due date</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {year.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="sp-fee-table-empty">
                  No fee assignments for this year.
                </td>
              </tr>
            ) : (
              year.items.map((item) => (
                <tr key={item.id}>
                  <td className="sp-fee-td-head">{item.feeHead}</td>
                  <td>
                    <StudentFeeBreakdownAmount item={item} />
                  </td>
                  <td className="sp-fee-td-date">{formatFeeDueDate(item.dueDate)}</td>
                  <td>
                    <StudentFeeBreakdownStatusBadge item={item} />
                  </td>
                  <td>
                    <StudentFeeBreakdownRowActions item={item} view={view} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}