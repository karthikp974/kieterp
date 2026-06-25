import { AuthUser } from "../auth/auth.types";

/** Chairman / institution-wide admins have no campus boundary on the JWT. */
export function isInstitutionWideAdmin(user?: AuthUser | null): boolean {
  return Boolean(user?.type === "ADMIN" && !user.campusId && !user.campusGroupId);
}
