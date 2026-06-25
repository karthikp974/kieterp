import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/auth-context";
import { readApiError } from "../shared/read-api-error";
import { useToast } from "../shared/toast-context";
import type { TeacherDashboard, TeacherPortalMenu, TeacherPortalModuleKey } from "./teacher-portal-types";

type TeacherPortalContextValue = {
  dashboard: TeacherDashboard | null;
  menu: TeacherPortalMenu | null;
  loading: boolean;
  loadError: string | null;
  refreshDashboard: () => Promise<void>;
  hasModule: (key: TeacherPortalModuleKey) => boolean;
  defaultPath: string;
};

const TeacherPortalContext = createContext<TeacherPortalContextValue | null>(null);

export function TeacherPortalProvider({ children }: { children: ReactNode }) {
  const { authFetch, user } = useAuth();
  const { showToast } = useToast();
  const [dashboard, setDashboard] = useState<TeacherDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const toastShownRef = useRef(false);

  const loadDashboard = useCallback(async () => {
    const response = await authFetch("/api/portals/teacher/dashboard");
    if (!response.ok) {
      const fallback =
        response.status === 404
          ? user?.type === "ADMIN"
            ? "This admin account has no teacher profile. Sign in with a teacher employee code to use the teacher portal."
            : "Teacher profile not found for this account."
          : "Unable to load teacher dashboard.";
      throw new Error(await readApiError(response, fallback));
    }
    const data = (await response.json()) as TeacherDashboard;
    setDashboard(data);
    setLoadError(null);
  }, [authFetch, user?.type]);

  useEffect(() => {
    let alive = true;
    toastShownRef.current = false;
    setLoading(true);
    void loadDashboard()
      .catch((error) => {
        if (!alive) return;
        const message = error instanceof Error ? error.message : "Unable to load teacher workspace";
        setLoadError(message);
        setDashboard(null);
        if (!toastShownRef.current) {
          toastShownRef.current = true;
          showToast(message, "error");
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [loadDashboard, showToast]);

  const refreshDashboard = useCallback(async () => {
    setLoading(true);
    try {
      await loadDashboard();
      showToast("Dashboard refreshed.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to refresh dashboard";
      setLoadError(message);
      showToast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [loadDashboard, showToast]);

  const menu = dashboard?.menu ?? null;

  const hasModule = useCallback(
    (key: TeacherPortalModuleKey) => Boolean(menu?.modules.some((item) => item.key === key)),
    [menu]
  );

  const defaultPath = menu?.modules[0]?.path ?? "/teacher";

  const value = useMemo(
    () => ({ dashboard, menu, loading, loadError, refreshDashboard, hasModule, defaultPath }),
    [dashboard, menu, loading, loadError, refreshDashboard, hasModule, defaultPath]
  );

  return <TeacherPortalContext.Provider value={value}>{children}</TeacherPortalContext.Provider>;
}

export function useTeacherPortal() {
  const ctx = useContext(TeacherPortalContext);
  if (!ctx) throw new Error("useTeacherPortal must be used inside TeacherPortalProvider");
  return ctx;
}
