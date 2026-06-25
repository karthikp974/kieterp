export const FEEDBACK_EXPORT_FORMATS = [
  {
    id: "responses",
    label: "Responses CSV",
    description: "All submitted answers with question prompts and student details (when not anonymous)."
  },
  {
    id: "completion",
    label: "Completion roster CSV",
    description: "Roll, name, section, and submitted vs pending status for every targeted student."
  }
] as const;

export type FeedbackExportVariant = (typeof FEEDBACK_EXPORT_FORMATS)[number]["id"];

export async function downloadFeedbackExport(
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  formId: string,
  variant: FeedbackExportVariant,
  fallbackTitle: string
) {
  const params = new URLSearchParams({ variant });
  const response = await authFetch(`/api/feedback/forms/${formId}/export?${params.toString()}`);
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
    const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
    throw new Error(message || "Export failed");
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/i.exec(disposition);
  const slug =
    fallbackTitle
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80) || "feedback";
  const filename = match?.[1] ?? `${slug}-${variant}.csv`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
