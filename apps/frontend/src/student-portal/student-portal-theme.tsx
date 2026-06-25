import type { ReactNode } from "react";
import { PortalThemeProvider, usePortalTheme, type PortalThemeMode } from "../shared/portal-theme";

export type StudentPortalThemeMode = PortalThemeMode;

export function StudentPortalThemeProvider({ children }: { children: ReactNode }) {
  return <PortalThemeProvider rootClassName="student-portal-root">{children}</PortalThemeProvider>;
}

export function useStudentPortalTheme() {
  return usePortalTheme();
}
