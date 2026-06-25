import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

type HeaderContextValue = {
  detailTitle: string | null;
  setDetailTitle: (title: string | null) => void;
};

const TeacherPortalHeaderContext = createContext<HeaderContextValue | null>(null);

export function TeacherPortalHeaderProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [detailTitle, setDetailTitle] = useState<string | null>(null);

  useEffect(() => {
    setDetailTitle(null);
  }, [location.pathname]);

  const value = useMemo(() => ({ detailTitle, setDetailTitle }), [detailTitle]);

  return <TeacherPortalHeaderContext.Provider value={value}>{children}</TeacherPortalHeaderContext.Provider>;
}

export function useTeacherPortalHeaderTitle(title: string | null) {
  const ctx = useContext(TeacherPortalHeaderContext);
  if (!ctx) return;

  useEffect(() => {
    ctx.setDetailTitle(title);
    return () => ctx.setDetailTitle(null);
  }, [ctx, title]);
}

export function useTeacherPortalDetailTitle() {
  return useContext(TeacherPortalHeaderContext)?.detailTitle ?? null;
}
