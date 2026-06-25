export function isOwnerUsername(username: string | null | undefined) {
  return username?.trim().toLowerCase() === "kar974";
}

export function portalFromPath(pathname: string) {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/teacher")) return "teacher";
  if (pathname.startsWith("/student")) return "student";
  if (pathname.startsWith("/ops")) return "ops";
  return "app";
}
