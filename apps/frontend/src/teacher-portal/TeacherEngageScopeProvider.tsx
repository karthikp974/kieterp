import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/auth-context";
import { readApiError } from "../shared/read-api-error";
import type { TeacherEngageSetup } from "./teacher-engage-types";

type TeacherEngageContextValue = {
  setup: TeacherEngageSetup | null;
  loading: boolean;
  loadError: string | null;
  sectionId: string;
  setSectionId: (id: string) => void;
  activeSectionId: string;
  refreshSetup: () => Promise<void>;
};

const TeacherEngageContext = createContext<TeacherEngageContextValue | null>(null);

export function TeacherEngageScopeProvider({ children }: { children: ReactNode }) {
  const { authFetch } = useAuth();
  const [setup, setSetup] = useState<TeacherEngageSetup | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sectionId, setSectionId] = useState("");

  const refreshSetup = useCallback(async () => {
    const response = await authFetch("/api/portals/teacher/engage/setup");
    if (!response.ok) {
      throw new Error(await readApiError(response, "Unable to load section scope."));
    }
    const data = (await response.json()) as TeacherEngageSetup;
    setSetup(data);
    setLoadError(null);
    const defaultSection = data.showSectionFilter
      ? data.sections[0]?.id ?? ""
      : data.fixedSectionId ?? data.sections[0]?.id ?? "";
    setSectionId((current) => {
      if (current && data.sections.some((s) => s.id === current)) return current;
      return defaultSection;
    });
  }, [authFetch]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void refreshSetup()
      .catch((error) => {
        if (!alive) return;
        setLoadError(error instanceof Error ? error.message : "Unable to load section scope.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [refreshSetup]);

  const activeSectionId = useMemo(() => {
    if (!setup) return sectionId;
    if (setup.showSectionFilter) return sectionId;
    return setup.fixedSectionId ?? setup.sections[0]?.id ?? "";
  }, [setup, sectionId]);

  const value = useMemo(
    () => ({
      setup,
      loading,
      loadError,
      sectionId,
      setSectionId,
      activeSectionId,
      refreshSetup
    }),
    [setup, loading, loadError, sectionId, activeSectionId, refreshSetup]
  );

  return <TeacherEngageContext.Provider value={value}>{children}</TeacherEngageContext.Provider>;
}

export function useTeacherEngage() {
  const ctx = useContext(TeacherEngageContext);
  if (!ctx) throw new Error("useTeacherEngage must be used within TeacherEngageScopeProvider.");
  return ctx;
}

export function useOptionalTeacherEngage() {
  return useContext(TeacherEngageContext);
}
