import type { PortalThemeMode } from "../shared/portal-theme";

export function studentPortalChartTheme(mode: PortalThemeMode = "light") {
  const isDark = mode === "dark";
  return {
    bar: isDark ? "#d4d4d4" : "#004b8d",
    ringFill: isDark ? "#f0f0f0" : "#004b8d",
    ringTrack: isDark ? "rgba(255, 255, 255, 0.14)" : "rgba(148, 163, 184, 0.35)",
    muted: isDark ? "#a3a3a3" : "#64748b",
    axis: isDark ? "#e2e8f0" : "#334155",
    grid: isDark ? "rgba(255,255,255,0.12)" : "rgba(148,163,184,0.35)",
    tooltip: isDark
      ? { borderRadius: 10, borderColor: "#333333", background: "#0a0a0a", color: "#f0f0f0" }
      : { borderRadius: 10, borderColor: "rgba(15,23,42,0.08)", background: "#ffffff", color: "#0f172a" }
  };
}
