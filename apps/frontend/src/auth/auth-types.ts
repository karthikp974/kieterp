export type UserType = "ADMIN" | "TEACHER" | "STUDENT";

export type AuthUser = {
  id: string;
  sessionId: string;
  email: string;
  username?: string | null;
  fullName: string;
  type: UserType;
  campusId?: string | null;
  campusGroupId?: string | null;
  avatarUrl?: string | null;
  assignments: {
    id: string;
    role: "STPO" | "CTPO" | "HTPO";
    campusGroupId?: string | null;
    campusId?: string | null;
    programId?: string | null;
    branchId?: string | null;
    batchId?: string | null;
    classId?: string | null;
    sectionId?: string | null;
    subjectId?: string | null;
    permissions: string[];
  }[];
};

export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
};
