import type { TeacherPortalModuleKey } from "./teacher-portal-types";

/** One-line guidance shown under each module title — keeps teachers oriented. */
export const TEACHER_MODULE_SUBTITLES: Record<TeacherPortalModuleKey, string> = {
  dashboard: "Your assignments and quick overview.",
  attendance: "HTPO: supervise sections and mark from the list below. CTPO / STPO: pick your assignment and submit once per session.",
  timetable: "HTPO: section grids and STPO assignments. Everyone: your personal teaching slots below.",
  results: "Upload PDFs or enter marks for students in your assigned subjects and sections.",
  teams: "Create class teams and assign students within your scope.",
  students: "Add students in your branch or section scope. Each record stores who enrolled them.",
  student_search: "Find a student in your sections and view or edit their full profile, fees, and marks.",
  section_overview: "Browse a section's students team-wise by personal, fee, academic, or marks view.",
  subjects: "Add, edit, or remove subjects for your assigned section.",
  syllabus: "Add, edit, or delete syllabus units and topics for your subjects.",
  syllabus_progress: "Mark how many syllabus topics are covered for your sections.",
  finance: "Fee status and payments for students in your branch or section scope.",
  announcements: "Publish scoped notices for campuses, batches, or sections you manage.",
  feedback: "Create forms, collect responses, and read reports for your audience.",
  applications: "Review, approve, or reject student requests in your scope.",
  reports: "Export attendance, finance, and results summaries for your scope."
};
