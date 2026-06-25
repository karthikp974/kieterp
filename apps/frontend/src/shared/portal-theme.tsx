import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePortalVisualViewport } from "./usePortalVisualViewport";

export type PortalThemeMode = "light" | "dark";

export const PORTAL_THEME_STORAGE_KEY = "erp.portal.theme";

type PortalThemeContextValue = {
  mode: PortalThemeMode;
  setMode: (mode: PortalThemeMode) => void;
  toggleMode: () => void;
};

const PortalThemeContext = createContext<PortalThemeContextValue | null>(null);

export function readPortalTheme(): PortalThemeMode {
  try {
    const raw = localStorage.getItem(PORTAL_THEME_STORAGE_KEY);
    if (raw === "dark" || raw === "light") return raw;
    const legacy = localStorage.getItem("erp.studentPortal.theme");
    if (legacy === "dark" || legacy === "light") return legacy;
  } catch {
    /* ignore */
  }
  return "light";
}

function persistPortalTheme(mode: PortalThemeMode) {
  try {
    localStorage.setItem(PORTAL_THEME_STORAGE_KEY, mode);
    localStorage.setItem("erp.studentPortal.theme", mode);
  } catch {
    /* ignore */
  }
}

export function PortalThemeProvider({
  children,
  rootClassName
}: {
  children: ReactNode;
  rootClassName: string;
}) {
  const [mode, setModeState] = useState<PortalThemeMode>(() =>
    typeof window !== "undefined" ? readPortalTheme() : "light"
  );

  const setMode = useCallback((next: PortalThemeMode) => {
    setModeState(next);
    persistPortalTheme(next);
  }, []);

  const toggleMode = useCallback(() => {
    setMode(mode === "dark" ? "light" : "dark");
  }, [mode, setMode]);

  const value = useMemo(() => ({ mode, setMode, toggleMode }), [mode, setMode, toggleMode]);

  usePortalVisualViewport();

  useEffect(() => {
    const bg = mode === "dark" ? "#000000" : "rgb(255, 255, 255)";
    document.documentElement.setAttribute("data-portal-theme", mode);
    document.documentElement.style.backgroundColor = bg;
    document.body.style.backgroundColor = bg;
    const root = document.getElementById("root");
    if (root) root.style.backgroundColor = bg;

    let themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (!themeColorMeta) {
      themeColorMeta = document.createElement("meta");
      themeColorMeta.setAttribute("name", "theme-color");
      document.head.appendChild(themeColorMeta);
    }
    themeColorMeta.setAttribute("content", bg);

    return () => {
      document.documentElement.removeAttribute("data-portal-theme");
      document.documentElement.style.backgroundColor = "";
      document.body.style.backgroundColor = "";
      if (root) root.style.backgroundColor = "";
    };
  }, [mode]);

  return (
    <PortalThemeContext.Provider value={value}>
      <div className={`portal-root portal-no-footer ${rootClassName}`.trim()} data-portal-theme={mode}>
        {children}
      </div>
    </PortalThemeContext.Provider>
  );
}

export function usePortalTheme() {
  const ctx = useContext(PortalThemeContext);
  if (!ctx) throw new Error("usePortalTheme must be used inside PortalThemeProvider");
  return ctx;
}

export function useOptionalPortalTheme() {
  return useContext(PortalThemeContext);
}
