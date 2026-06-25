import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "./auth-context";
import { portalFromPath } from "./owner.util";

/** Records page views and heartbeats for the owner spectator console. */
export function useActivityTracker() {
  const { user, authFetch } = useAuth();
  const location = useLocation();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const path = `${location.pathname}${location.search}`;
    if (path === lastPath.current) return;
    lastPath.current = path;

    void authFetch("/api/ops/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path,
        portal: portalFromPath(location.pathname),
        kind: "PAGE_VIEW"
      })
    }).catch(() => undefined);
  }, [authFetch, location.pathname, location.search, user]);

  useEffect(() => {
    if (!user) return;
    const timer = window.setInterval(() => {
      void authFetch("/api/ops/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: `${window.location.pathname}${window.location.search}`,
          portal: portalFromPath(window.location.pathname),
          kind: "HEARTBEAT"
        })
      }).catch(() => undefined);
    }, 90_000);
    return () => window.clearInterval(timer);
  }, [authFetch, user]);
}

export function ActivityTracker() {
  useActivityTracker();
  return null;
}
