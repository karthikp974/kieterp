export function parseReceiptFilename(cd: string | null, fallback: string) {
  if (!cd) return fallback;
  const m = /filename\*?=(?:UTF-8'')?["']?([^"';]+)/i.exec(cd);
  return (m?.[1] ?? fallback).replace(/["']/g, "").trim() || fallback;
}

export const RECEIPT_PDF_PATH = (paymentId: string) =>
  `/api/portals/student/fees/payments/${encodeURIComponent(paymentId)}/receipt/pdf`;
