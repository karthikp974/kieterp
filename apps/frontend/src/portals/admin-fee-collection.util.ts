export type FeeCollectionDayRow = {
  paymentDate: string;
  collectedAmount: number;
  paymentCount: number;
};

export type FeeCollectionDayPayment = {
  id: string;
  studentName: string;
  rollNumber: string;
  batchYear: string;
  classLabel: string;
  sectionName: string;
  amount: number;
  paidAt: string;
};

export function formatFeeInr(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

export function formatFeeDisplayDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

export function formatDashboardFeeCompact(amount: number) {
  const value = Math.max(0, amount);
  const trim = (n: number) => String(Number(n.toFixed(2)));

  if (value >= 10_000_000) {
    return `₹${trim(value / 10_000_000)}Cr`;
  }
  if (value >= 100_000) {
    return `₹${trim(value / 100_000)}L`;
  }
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

export async function readApiError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
  const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
  return new Error(message || fallback);
}
