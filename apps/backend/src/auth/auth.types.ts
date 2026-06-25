import { TeacherRoleKind, UserType } from "@prisma/client";

export type ScopeRef = {
  campusGroupId?: string;
  campusId?: string;
  programId?: string;
  branchId?: string;
  batchId?: string;
  classId?: string;
  sectionId?: string;
  subjectId?: string;
};

export type TeacherAssignmentContext = ScopeRef & {
  id: string;
  role: TeacherRoleKind;
  permissions: string[];
};

export type AuthUser = {
  id: string;
  sessionId: string;
  type: UserType;
  campusId?: string | null;
  campusGroupId?: string | null;
  email: string;
  username?: string | null;
  fullName: string;
  avatarUrl?: string | null;
  assignments: TeacherAssignmentContext[];
  /** User id written to AuditLog.userId (admin when owner / master login). */
  auditUserId: string;
};

export type JwtAccessPayload = {
  sub: string;
  sid: string;
  type: UserType;
  campusId?: string | null;
  campusGroupId?: string | null;
};
