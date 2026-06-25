import type { StudentReceiptsYearGroup } from "./student-receipts-types";
import { StudentReceiptRowsTable } from "./StudentReceiptRowsTable";

type Props = {
  group: StudentReceiptsYearGroup;
};

export function StudentReceiptYearSection({ group }: Props) {
  const titleId = `sp-rcpt-title-${group.yearNumber}`;

  return (
    <section className="sp-rcpt-sem" aria-labelledby={titleId}>
      <header className="sp-rcpt-sem-head">
        <div>
          <div className="sp-rcpt-sem-title-row">
            <h2 id={titleId} className="sp-rcpt-sem-title">
              {group.yearLabel}
            </h2>
            {group.isCurrentYear ? <span className="sp-rcpt-year-tag">Current year</span> : null}
          </div>
          <p className="sp-rcpt-sem-sub">
            {group.receipts.length} receipt{group.receipts.length === 1 ? "" : "s"}
          </p>
        </div>
      </header>
      <StudentReceiptRowsTable rows={group.receipts} yearLabel={group.yearLabel} />
    </section>
  );
}
