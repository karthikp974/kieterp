import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/auth-context";
import { readApiError } from "../shared/read-api-error";
import type { TeacherSectionScopeSetup } from "./teacher-section-scope-types";

type TeacherSectionScopeContextValue = {
  setup: TeacherSectionScopeSetup | null;
  loading: boolean;
  loadError: string | null;
  sectionId: string;
  setSectionId: (id: string) => void;
  activeSectionId: string;
  refreshSetup: () => Promise<void>;
};

const TeacherSectionScopeContext = createContext<TeacherSectionScopeContextValue | null>(null);

export function TeacherSectionScopeProvider({
  children,
  setupPath
}: {
  children: ReactNode;
  setupPath: string;
}) {
  const { authFetch } = useAuth();
  const [setup, setSetup] = useState<TeacherSectionScopeSetup | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sectionId, setSectionId] = useState("");

  const refreshSetup = useCallback(async () => {
    const response = await authFetch(setupPath);
    if (!response.ok) {
      throw new Error(await readApiError(response, "Unable to load section scope."));
    }
    const data = (await response.json()) as TeacherSectionScopeSetup;
    setSetup(data);
    setLoadError(null);
    const defaultSection = data.showSectionFilter
      ? data.sections[0]?.id ?? ""
      : data.fixedSectionId ?? data.sections[0]?.id ?? "";
    setSectionId((current) => {
      if (current && data.sections.some((section) => section.id === current)) return current;
      return defaultSection;
    });
  }, [authFetch, setupPath]);

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

  return <TeacherSectionScopeContext.Provider value={value}>{children}</TeacherSectionScopeContext.Provider>;
}

export function useTeacherSectionScope() {
  const ctx = useContext(TeacherSectionScopeContext);
  if (!ctx) throw new Error("useTeacherSectionScope must be used within TeacherSectionScopeProvider.");
  return ctx;
}

export function useOptionalTeacherSectionScope() {
  return useContext(TeacherSectionScopeContext);
}
