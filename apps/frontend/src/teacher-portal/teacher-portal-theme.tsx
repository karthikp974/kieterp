import type { ReactNode } from "react";
import { PortalThemeProvider, usePortalTheme, type PortalThemeMode } from "../shared/portal-theme";

export type TeacherPortalThemeMode = PortalThemeMode;

export function TeacherPortalThemeProvider({ children }: { children: ReactNode }) {
  return <PortalThemeProvider rootClassName="teacher-portal-root">{children}</PortalThemeProvider>;
}

export function useTeacherPortalTheme() {
  return usePortalTheme();
}
