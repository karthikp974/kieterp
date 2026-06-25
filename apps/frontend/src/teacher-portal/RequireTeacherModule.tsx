import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useTeacherPortal } from "./teacher-portal-context";
import type { TeacherPortalModuleKey } from "./teacher-portal-types";

export function RequireTeacherModule({ children, moduleKey }: { children: ReactNode; moduleKey: TeacherPortalModuleKey }) {
  const { menu, hasModule, defaultPath } = useTeacherPortal();

  if (!menu) {
    return <p className="db-empty">Loading teacher workspace…</p>;
  }

  if (!hasModule(moduleKey)) {
    return <Navigate to={defaultPath} replace />;
  }

  return <div className="portal-module-page">{children}</div>;
}
