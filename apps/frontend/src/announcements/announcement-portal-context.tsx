import { createContext, ReactNode, useCallback, useContext, useMemo } from "react";
import { NavigateOptions, useNavigate } from "react-router-dom";

export function resolveAnnouncementHref(href: string, basePath: string) {
  return href.replace(/^\/announcements(?=\/|$)/, basePath);
}

type AnnouncementPortalContextValue = {
  basePath: string;
  variant: "admin" | "teacher";
};

const AnnouncementPortalContext = createContext<AnnouncementPortalContextValue>({
  basePath: "/announcements",
  variant: "admin"
});

export function AnnouncementPortalProvider({
  basePath,
  variant,
  children
}: {
  basePath: string;
  variant: "admin" | "teacher";
  children: ReactNode;
}) {
  const value = useMemo(() => ({ basePath, variant }), [basePath, variant]);
  return <AnnouncementPortalContext.Provider value={value}>{children}</AnnouncementPortalContext.Provider>;
}

export function useAnnouncementPortal() {
  return useContext(AnnouncementPortalContext);
}

export function useAnnouncementPaths() {
  const { basePath } = useAnnouncementPortal();
  return {
    hub: basePath,
    create: `${basePath}/create`,
    history: `${basePath}/history`
  };
}

export function useAnnouncementNavigate() {
  const navigate = useNavigate();
  const { basePath } = useAnnouncementPortal();
  return useCallback(
    (to: number | string, options?: NavigateOptions) => {
      if (typeof to === "number") return navigate(to);
      return navigate(resolveAnnouncementHref(to, basePath), options);
    },
    [navigate, basePath]
  );
}
