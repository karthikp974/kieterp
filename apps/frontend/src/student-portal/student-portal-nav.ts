import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BookOpen,
  CalendarDays,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  MessageSquare,
  Receipt,
  User,
  WalletCards
} from "lucide-react";

export type StudentNavItem = { to: string; label: string; end?: boolean; icon: LucideIcon };

export type StudentNavSection = { sectionLabel: string; items: StudentNavItem[] };

export const STUDENT_PORTAL_NAV: StudentNavSection[] = [
  {
    sectionLabel: "Overview",
    items: [{ to: "/student", label: "Dashboard", end: true, icon: LayoutDashboard }]
  },
  {
    sectionLabel: "Academics",
    items: [
      { to: "/student/academics/timetable", label: "Timetable", icon: CalendarDays },
      { to: "/student/academics/attendance", label: "Attendance", icon: ClipboardList },
      { to: "/student/academics/marks", label: "Marks & Grades", icon: GraduationCap },
      { to: "/student/academics/subjects", label: "My Subjects", icon: BookOpen }
    ]
  },
  {
    sectionLabel: "Fee & payments",
    items: [
      { to: "/student/fees/status", label: "Fee Status", icon: WalletCards },
      { to: "/student/fees/receipts", label: "Receipts", icon: Receipt }
    ]
  },
  {
    sectionLabel: "Engage",
    items: [
      { to: "/student/engage/announcements", label: "Announcements", icon: Bell },
      { to: "/student/engage/applications", label: "Applications", icon: ClipboardList },
      { to: "/student/feedback", label: "Feedback", icon: MessageSquare },
      { to: "/student/engage/profile", label: "Profile", icon: User }
    ]
  }
];

export function studentPortalPageTitle(pathname: string): string {
  const p = pathname.replace(/\/$/, "") || "/student";
  if (p === "/student") return "Dashboard";

  const map: Record<string, string> = {
    "/student/academics/timetable": "Timetable",
    "/student/academics/attendance": "Attendance",
    "/student/academics/marks": "Marks & Grades",
    "/student/academics/subjects": "My Subjects",
    "/student/fees/status": "Fee Status",
    "/student/fees/receipts": "Receipts",
    "/student/engage/announcements": "Announcements",
    "/student/engage/applications": "Applications",
    "/student/feedback": "Feedback",
    "/student/engage/profile": "Profile",
    "/student/notifications": "Notifications"
  };

  if (map[p]) return map[p]!;
  if (p.startsWith("/student/feedback/")) return "Feedback";

  return "Student Portal";
}

/** Dashboard only — logo + KIET ERP. All other routes: menu + page title (same as teacher portal). */
export function studentPortalShowBrandedHeader(pathname: string): boolean {
  const p = pathname.replace(/\/$/, "") || "/student";
  return p === "/student";
}

export function studentPortalSubPageBackHref(pathname: string): string | undefined {
  const p = pathname.replace(/\/$/, "") || "/student";
  if (/^\/student\/feedback\/[^/]+$/.test(p) && p !== "/student/feedback") {
    return "/student/feedback";
  }
  return undefined;
}
