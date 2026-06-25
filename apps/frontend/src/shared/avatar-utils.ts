import type { UserType } from "../auth/auth-types";

export type AvatarRole = UserType;

/** Stable initials from display name (e.g. Pavan Karthik → PK). */
export function initialsFromName(fullName?: string | null, fallback = "U") {
  const parts = fullName?.split(/\s+/).filter(Boolean) ?? [];
  if (!parts.length) return fallback;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Prefer stable user identifiers for gradient assignment. */
export function avatarSeedFromIdentity(options: {
  id?: string | null;
  email?: string | null;
  username?: string | null;
  fullName?: string | null;
}) {
  return options.id?.trim() || options.email?.trim() || options.username?.trim() || options.fullName?.trim() || "anonymous";
}
