import { IST_TIMEZONE } from "../../shared/ist-time";

/** ERP-style date/time display (no browser date picker). Always IST. */
export function formatFeedbackDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: IST_TIMEZONE
    });
  } catch {
    return iso;
  }
}

export function formatFeedbackFormType(formType: string, customType: string | null) {
  const labels: Record<string, string> = {
    GUEST_LECTURE: "Guest lecture",
    SEMESTER_EXAM: "Semester exam",
    WORKSHOP: "Workshop",
    SEMINAR: "Seminar",
    ACADEMIC_EVENT: "Academic event",
    OTHER: customType?.trim() || "Other"
  };
  return labels[formType] ?? formType.replace(/_/g, " ");
}
