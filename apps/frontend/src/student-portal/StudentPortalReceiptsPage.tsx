import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/auth-context";
import { useToast } from "../shared/toast-context";
import { StudentPortalReceiptsSkeleton } from "./receipts/StudentPortalReceiptsSkeleton";
import { StudentReceiptYearSection } from "./receipts/StudentReceiptYearSection";
import type { StudentReceiptsResponse } from "./receipts/student-receipts-types";

async function readError(response: Response) {
  const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
  const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
  return new Error(message || "Request failed.");
}

export function StudentPortalReceiptsPage() {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const [data, setData] = useState<StudentReceiptsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/portals/student/fees/receipts");
      if (!res.ok) throw await readError(res);
      setData((await res.json()) as StudentReceiptsResponse);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not load receipts.", "error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [authFetch, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return <StudentPortalReceiptsSkeleton />;
  }

  if (!data) {
    return <p className="sp-dash-error">Receipts could not be loaded.</p>;
  }

  const branchLine = `${data.branch.code} — ${data.branch.name}`;

  return (
    <div className="sp-rcpt">
      <header className="sp-rcpt-head">
        <p className="sp-rcpt-page-sub">
          <strong>{data.student.fullName}</strong> · Roll {data.student.rollNumber}
        </p>
        <p className="sp-rcpt-page-meta">
          {branchLine} · Current year {data.currentYearLabel} · {data.totalReceipts} payment
          {data.totalReceipts === 1 ? "" : "s"}
        </p>
      </header>

      {data.years.length === 0 ? (
        <p className="sp-rcpt-empty">No payment receipts recorded yet.</p>
      ) : (
        data.years.map((group) => <StudentReceiptYearSection key={group.yearNumber} group={group} />)
      )}
    </div>
  );
}
