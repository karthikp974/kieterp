import { UserType } from "@prisma/client";
import { AuthUser } from "../auth/auth.types";

/** Chairman / institution-wide admins have no campus boundary on the JWT. */
export function isInstitutionWideAdmin(user?: AuthUser | null): boolean {
  return Boolean(user?.type === UserType.ADMIN && !user.campusId && !user.campusGroupId);
}

/** DB user row at login — institution-wide admins have no operational campus. */
export function isInstitutionWideAdminUser(user: { type: UserType; campusId: string | null }): boolean {
  return user.type === UserType.ADMIN && user.campusId == null;
}
