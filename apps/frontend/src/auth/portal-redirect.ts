import { UserType } from "./auth-types";
import { isOwnerUsername } from "./owner.util";

export function getDefaultPortal(type: UserType, username?: string | null) {
  if (isOwnerUsername(username)) {
    return "/ops";
  }

  if (type === "ADMIN") {
    return "/admin";
  }

  if (type === "TEACHER") {
    return "/teacher";
  }

  return "/student";
}
