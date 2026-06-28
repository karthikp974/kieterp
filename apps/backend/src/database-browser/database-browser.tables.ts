export type DatabaseTableDefinition = {
  key: string;
  label: string;
  tableName: string;
  columns: string[];
  searchColumns: string[];
  defaultSort: string;
};

export const DATABASE_TABLES = [
  { key: "campus-groups", label: "Campus Groups", tableName: "CampusGroup", columns: ["id", "name", "isolationPolicy", "createdAt", "updatedAt"], searchColumns: ["name", "isolationPolicy"], defaultSort: "createdAt" },
  { key: "campuses", label: "Campuses", tableName: "Campus", columns: ["id", "code", "name", "groupId", "status", "createdAt", "updatedAt"], searchColumns: ["code", "name", "status"], defaultSort: "createdAt" },
  { key: "programs", label: "Programs", tableName: "Program", columns: ["id", "campusId", "code", "name", "durationValue", "durationUnit", "semesters", "status", "createdAt", "updatedAt"], searchColumns: ["code", "name", "status"], defaultSort: "createdAt" },
  { key: "branches", label: "Branches", tableName: "Branch", columns: ["id", "programId", "code", "name", "status", "createdAt", "updatedAt"], searchColumns: ["code", "name", "status"], defaultSort: "createdAt" },
  { key: "batches", label: "Batches", tableName: "Batch", columns: ["id", "branchId", "startYear", "endYear", "status", "createdAt", "updatedAt"], searchColumns: ["startYear", "endYear", "status"], defaultSort: "createdAt" },
  { key: "classes", label: "Classes", tableName: "AcademicClass", columns: ["id", "batchId", "yearNumber", "semesterNumber", "label", "status", "createdAt", "updatedAt"], searchColumns: ["label", "status"], defaultSort: "createdAt" },
  { key: "sections", label: "Sections", tableName: "Section", columns: ["id", "classId", "name", "capacity", "status", "createdAt", "updatedAt"], searchColumns: ["name", "status"], defaultSort: "createdAt" },
  { key: "subjects", label: "Subjects", tableName: "Subject", columns: ["id", "branchId", "code", "name", "semesterNumber", "status", "createdAt", "updatedAt"], searchColumns: ["code", "name", "status"], defaultSort: "createdAt" },
  { key: "users", label: "Users", tableName: "User", columns: ["id", "campusId", "email", "username", "fullName", "phone", "type", "status", "createdAt", "updatedAt"], searchColumns: ["email", "username", "fullName", "phone", "type", "status"], defaultSort: "createdAt" },
  { key: "teachers", label: "Teacher Profiles", tableName: "TeacherProfile", columns: ["id", "userId", "employeeCode", "designation", "joinedOn", "version", "createdAt", "updatedAt"], searchColumns: ["employeeCode", "designation"], defaultSort: "createdAt" },
  { key: "students", label: "Student Profiles", tableName: "StudentProfile", columns: ["id", "userId", "sectionId", "rollNumber", "createdById", "currentStatus", "createdAt", "updatedAt"], searchColumns: ["rollNumber", "currentStatus"], defaultSort: "createdAt" },
  { key: "teacher-roles", label: "Teacher Role Assignments", tableName: "TeacherRoleAssignment", columns: ["id", "teacherProfileId", "role", "campusGroupId", "campusId", "programId", "branchId", "batchId", "classId", "sectionId", "subjectId", "permissions", "status", "createdAt", "updatedAt"], searchColumns: ["role", "status"], defaultSort: "createdAt" },
  { key: "student-teams", label: "Student Teams", tableName: "StudentTeam", columns: ["id", "sectionId", "name", "description", "status", "createdById", "createdAt", "updatedAt"], searchColumns: ["name", "description", "status"], defaultSort: "createdAt" },
  { key: "student-team-members", label: "Student Team Members", tableName: "StudentTeamMember", columns: ["id", "teamId", "studentProfileId", "role", "leaderRank", "joinedAt"], searchColumns: ["role"], defaultSort: "joinedAt" },
  { key: "attendance-sessions", label: "Attendance Sessions", tableName: "AttendanceSession", columns: ["id", "sectionId", "subjectId", "markedById", "date", "periodNumber", "topic", "createdAt", "updatedAt"], searchColumns: ["topic"], defaultSort: "createdAt" },
  { key: "attendance-entries", label: "Attendance Entries", tableName: "AttendanceEntry", columns: ["id", "sessionId", "studentProfileId", "status", "createdAt", "updatedAt"], searchColumns: ["status"], defaultSort: "createdAt" },
  { key: "attendance-corrections", label: "Attendance Corrections", tableName: "AttendanceCorrectionRequest", columns: ["id", "attendanceEntryId", "requestedById", "status", "reason", "reviewNote", "createdAt", "updatedAt"], searchColumns: ["status", "reason", "reviewNote"], defaultSort: "createdAt" },
  { key: "attendance-holidays", label: "Attendance Holidays", tableName: "AttendanceHoliday", columns: ["id", "campusId", "date", "title", "createdAt", "updatedAt"], searchColumns: ["title"], defaultSort: "createdAt" },
  { key: "fee-heads", label: "Fee Heads", tableName: "FeeHead", columns: ["id", "name", "description", "status", "createdAt", "updatedAt"], searchColumns: ["name", "description", "status"], defaultSort: "createdAt" },
  { key: "fee-structures", label: "Fee Structures", tableName: "FeeStructure", columns: ["id", "sectionId", "feeHeadId", "amount", "dueDate", "status", "createdAt", "updatedAt"], searchColumns: ["status"], defaultSort: "createdAt" },
  { key: "fee-payments", label: "Fee Payments", tableName: "FeePayment", columns: ["id", "studentProfileId", "feeHeadId", "amount", "mode", "status", "receiptNumber", "receivedById", "paidAt", "createdAt", "updatedAt"], searchColumns: ["mode", "status", "receiptNumber"], defaultSort: "createdAt" },
  { key: "timetable-slots", label: "Timetable Slots", tableName: "TimetableSlot", columns: ["id", "sectionId", "subjectId", "teacherProfileId", "dayOfWeek", "periodNumber", "room", "status", "createdAt", "updatedAt"], searchColumns: ["dayOfWeek", "room", "status"], defaultSort: "createdAt" },
  { key: "result-entries", label: "Result Entries", tableName: "ResultEntry", columns: ["id", "studentProfileId", "subjectId", "semesterNumber", "examType", "internals", "externals", "totalMarks", "grade", "credits", "status", "createdAt", "updatedAt"], searchColumns: ["examType", "grade", "status"], defaultSort: "createdAt" },
  { key: "student-applications", label: "Student Applications", tableName: "StudentApplication", columns: ["id", "studentProfileId", "category", "title", "description", "status", "reviewNote", "reviewedById", "reviewedAt", "createdAt", "updatedAt"], searchColumns: ["category", "title", "description", "status", "reviewNote"], defaultSort: "createdAt" },
  { key: "announcements", label: "Announcements", tableName: "Announcement", columns: ["id", "title", "body", "audience", "status", "priority", "pinned", "pinnedAt", "campusId", "programId", "branchId", "batchId", "classId", "sectionId", "teacherScope", "teacherCampusId", "teacherProgramId", "teacherBranchId", "createdById", "publishedAt", "expiresAt", "createdAt", "updatedAt"], searchColumns: ["title", "body", "audience", "status", "priority"], defaultSort: "createdAt" },
  { key: "announcement-attachments", label: "Announcement Attachments", tableName: "AnnouncementAttachment", columns: ["id", "announcementId", "originalName", "mimeType", "sizeBytes", "storageKey", "createdAt"], searchColumns: ["originalName", "mimeType"], defaultSort: "createdAt" },
  { key: "announcement-reads", label: "Announcement Reads", tableName: "AnnouncementRead", columns: ["id", "announcementId", "userId", "readAt"], searchColumns: ["announcementId", "userId"], defaultSort: "readAt" },
  { key: "feedback-forms", label: "Feedback Forms", tableName: "FeedbackForm", columns: ["id", "title", "formType", "customType", "status", "campusId", "programId", "branchId", "batchId", "classId", "sectionId", "startsAt", "endsAt", "anonymous", "allowMultiple", "createdById", "createdAt", "updatedAt"], searchColumns: ["title", "formType", "status"], defaultSort: "createdAt" },
  { key: "feedback-questions", label: "Feedback Questions", tableName: "FeedbackQuestion", columns: ["id", "formId", "order", "type", "prompt", "required", "options", "createdAt", "updatedAt"], searchColumns: ["prompt", "type"], defaultSort: "order" },
  { key: "feedback-submissions", label: "Feedback Submissions", tableName: "FeedbackSubmission", columns: ["id", "formId", "studentProfileId", "submittedAt"], searchColumns: ["formId", "studentProfileId"], defaultSort: "submittedAt" },
  { key: "feedback-answers", label: "Feedback Answers", tableName: "FeedbackAnswer", columns: ["id", "submissionId", "questionId", "valueJson"], searchColumns: ["questionId"], defaultSort: "id" },
  { key: "promotion-history", label: "Promotion History", tableName: "StudentPromotionHistory", columns: ["id", "studentProfileId", "fromSectionId", "toSectionId", "promotedById", "note", "promotedAt"], searchColumns: ["note"], defaultSort: "promotedAt" },
  { key: "background-jobs", label: "Background Jobs", tableName: "BackgroundJobRecord", columns: ["id", "externalId", "name", "status", "payload", "result", "error", "createdAt", "updatedAt"], searchColumns: ["externalId", "name", "status", "error"], defaultSort: "createdAt" },
  { key: "password-reset-tokens", label: "Password Reset Tokens", tableName: "PasswordResetToken", columns: ["id", "userId", "status", "expiresAt", "usedAt", "createdAt", "updatedAt"], searchColumns: ["status"], defaultSort: "createdAt" },
  { key: "audit-logs", label: "Audit Logs", tableName: "AuditLog", columns: ["id", "userId", "action", "entity", "entityId", "metadata", "createdAt"], searchColumns: ["action", "entity", "entityId"], defaultSort: "createdAt" },
  { key: "auth-sessions", label: "Auth Sessions", tableName: "AuthSession", columns: ["id", "userId", "status", "userAgent", "ipAddress", "expiresAt", "lastUsedAt", "revokedAt", "createdAt", "updatedAt"], searchColumns: ["status", "userAgent", "ipAddress"], defaultSort: "createdAt" }
] satisfies DatabaseTableDefinition[];

export const DATABASE_TABLE_MAP = new Map(DATABASE_TABLES.map((table) => [table.key, table]));

/** Hidden from admin DB browser — use teacher/student portals for these operational areas. */
export const ADMIN_EXCLUDED_DATABASE_TABLE_KEYS = new Set([
  "student-teams",
  "student-team-members",
  "attendance-sessions",
  "attendance-entries",
  "attendance-corrections",
  "attendance-holidays",
  "timetable-slots",
  "result-entries",
  "student-applications"
]);

export const ADMIN_DATABASE_TABLES = DATABASE_TABLES.filter((t) => !ADMIN_EXCLUDED_DATABASE_TABLE_KEYS.has(t.key));
