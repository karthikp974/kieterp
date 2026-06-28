export type TeacherPortalModuleKey =
  | "dashboard"
  | "attendance"
  | "timetable"
  | "results"
  | "teams"
  | "students"
  | "student_search"
  | "section_overview"
  | "subjects"
  | "syllabus"
  | "syllabus_progress"
  | "finance"
  | "announcements"
  | "feedback"
  | "reports"
  | "applications";

export type TeacherPortalMenuItem = {
  key: TeacherPortalModuleKey;
  label: string;
  path: string;
};

export type TeacherPortalMenu = {
  modules: TeacherPortalMenuItem[];
  roles: string[];
};

export type TeacherAssignment = {
  id: string;
  role: "STPO" | "CTPO" | "HTPO";
  scopeLabel: string;
  campus?: { code: string; name: string } | null;
  department?: { code: string; name: string } | null;
  branch?: { code: string; name: string } | null;
  batch?: { startYear: number; endYear: number } | null;
  class?: { label: string; semesterNumber: number } | null;
  section?: { name: string } | null;
  subject?: { code: string; name: string } | null;
  modules: TeacherPortalModuleKey[];
};

export type HtpoSupervisionSection = {
  id: string;
  label: string;
  studentCount: number;
  classTeacherName: string;
  latestAttendance: { percentage: number; present: number; total: number } | null;
};

export type HtpoAttendancePeriodPreset =
  | "custom"
  | "this_month"
  | "last_2_months"
  | "this_semester"
  | "last_semester";

export type HtpoAttendanceYearOption = {
  year: number;
  label: string;
  isOngoing: boolean;
};

export type HtpoSectionStudentAttendance = {
  studentProfileId: string;
  rollNumber: string;
  fullName: string;
  percentage: number | null;
  presentDays: number;
  workingDays: number;
  daysLabel: string;
};

export type HtpoSectionAttendanceDetail = {
  section: { id: string; label: string; name: string; semesterNumber: number };
  period: {
    preset: HtpoAttendancePeriodPreset;
    label: string;
    from: string | null;
    to: string | null;
    workingDays: number;
  };
  yearOptions: HtpoAttendanceYearOption[];
  students: { studentProfileId: string; rollNumber: string; fullName: string }[];
  attendanceOverview: HtpoSectionStudentAttendance[];
  below75Percent: HtpoSectionStudentAttendance[];
};

export type HtpoStudentAttendanceDetail = {
  section: { id: string; label: string; name: string; semesterNumber: number };
  student: { studentProfileId: string; rollNumber: string; fullName: string; email: string };
  period: HtpoSectionAttendanceDetail["period"];
  yearOptions: HtpoAttendanceYearOption[];
  summary: {
    percentage: number | null;
    presentDays: number;
    workingDays: number;
    absentDays: number;
    daysLabel: string;
  };
  bySubject: { subject: string; present: number; total: number; percentage: number | null }[];
  sessions: {
    id: string;
    date: string;
    subject: string;
    status: "PRESENT" | "ABSENT";
    markedBy: string;
  }[];
};

export type HtpoDashboardOverview = {
  departmentLabel: string;
  sectionCount: number;
  totalStudents: number;
  avgAttendancePercent: number | null;
  feePendingCount: number;
  openFeedbackCount: number;
  supervisionSections: HtpoSupervisionSection[];
};

export type TeacherDashboard = {
  teacher: { id: string; fullName: string; employeeCode: string; email: string };
  assignments: TeacherAssignment[];
  counts: {
    students: number;
    pendingApplications: number;
    teams: number;
    resultIssues: number;
    todayClasses: number;
    announcements: number;
  };
  htpoOverview: HtpoDashboardOverview | null;
  todayTimetable: {
    id: string;
    time: string;
    room?: string | null;
    structure: { branch: string; semester: number; section: string; subject: string };
  }[];
  announcements: { id: string; title: string; audience: string; publishedAt?: string | null }[];
  menu: TeacherPortalMenu;
};
