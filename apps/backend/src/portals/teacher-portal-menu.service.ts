import { Injectable } from "@nestjs/common";
import { TeacherRoleKind } from "@prisma/client";
import { mergeTeacherPortalModules, type TeacherPortalModuleKey } from "../permissions/teacher-portal-modules";
import { TeacherPortalMenuDto, TeacherPortalMenuItemDto } from "./teacher-portal-menu.dto";

const MODULE_DEFS: Record<TeacherPortalModuleKey, Omit<TeacherPortalMenuItemDto, "key">> = {
  dashboard: { label: "Dashboard", path: "/teacher" },
  attendance: { label: "Attendance", path: "/teacher/attendance" },
  timetable: { label: "Timetable", path: "/teacher/timetable" },
  results: { label: "Results", path: "/teacher/results" },
  teams: { label: "Teams", path: "/teacher/teams" },
  students: { label: "Add Student", path: "/teacher/students" },
  student_search: { label: "Search Student", path: "/teacher/student-search" },
  section_overview: { label: "Section Overview", path: "/teacher/section-overview" },
  subjects: { label: "Subjects", path: "/teacher/subjects" },
  syllabus: { label: "Syllabus", path: "/teacher/syllabus" },
  syllabus_progress: { label: "Update Syllabus", path: "/teacher/syllabus/progress" },
  finance: { label: "Finance", path: "/teacher/finance" },
  announcements: { label: "Announcements", path: "/teacher/announcements" },
  feedback: { label: "Feedback", path: "/teacher/feedback" },
  reports: { label: "Reports", path: "/teacher/reports" },
  applications: { label: "Applications", path: "/teacher/applications" }
};

@Injectable()
export class TeacherPortalMenuService {
  buildMenu(roles: Iterable<TeacherRoleKind | string>): TeacherPortalMenuDto {
    const roleList = [...new Set([...roles].map((role) => String(role)))];
    const modules = mergeTeacherPortalModules(roleList).map((key) => ({
      key,
      ...MODULE_DEFS[key]
    }));
    return { modules, roles: roleList };
  }
}
