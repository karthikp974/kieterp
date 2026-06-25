import { Suspense, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { usePortalMobileMenuOpen } from "../shared/portal-mobile-menu";
import { PortalShellHeader } from "../shared/PortalShellHeader";
import { StudentMenuContent } from "../shared/StudentMenu";
import {
  studentPortalPageTitle,
  studentPortalShowBrandedHeader,
  studentPortalSubPageBackHref
} from "./student-portal-nav";
import { StudentPortalRouteSkeleton } from "./StudentPortalRouteSkeleton";
import { STUDENT_NOTIFICATIONS_REFRESH } from "./student-portal-notification-events";
import { StudentPortalThemeProvider, useStudentPortalTheme } from "./student-portal-theme";

function StudentPortalChrome() {
  const { user, authFetch, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const pageTitle = studentPortalPageTitle(location.pathname);
  const showBrandedHeader = studentPortalShowBrandedHeader(location.pathname);
  const subPageBackHref = studentPortalSubPageBackHref(location.pathname);
  const exitHref = useMemo(() => (user?.type === "ADMIN" ? "/admin" : null), [user?.type]);

  usePortalMobileMenuOpen(sidebarOpen);

  useEffect(() => {
    if (user?.type !== "STUDENT") {
      setUnreadCount(0);
      return;
    }
    let cancelled = false;
    async function loadBadge() {
      try {
        const res = await authFetch("/api/portals/student/notifications/unread-count");
        if (!res.ok) throw new Error("badge");
        const data = (await res.json()) as { unreadCount?: number };
        if (!cancelled) setUnreadCount(typeof data.unreadCount === "number" ? data.unreadCount : 0);
      } catch {
        if (!cancelled) setUnreadCount(0);
      }
    }
    void loadBadge();
    const onRefresh = () => void loadBadge();
    window.addEventListener(STUDENT_NOTIFICATIONS_REFRESH, onRefresh);
    const id = window.setInterval(() => void loadBadge(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener(STUDENT_NOTIFICATIONS_REFRESH, onRefresh);
    };
  }, [authFetch, user?.type]);

  function closeSidebar() {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setSidebarCollapsed(true);
    }
    setSidebarOpen(false);
  }

  function toggleMenu() {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      if (sidebarCollapsed) {
        setSidebarCollapsed(false);
        setSidebarOpen(false);
      } else {
        closeSidebar();
      }
    } else {
      setSidebarOpen((o) => !o);
    }
  }

  async function handleSignOut() {
    await logout();
    void navigate("/login", { replace: true });
  }

  const menuProps = {
    exitHref,
    onClose: closeSidebar,
    onAfterNavigate: () => setSidebarOpen(false),
    onSignOut: handleSignOut,
    showClose: true
  };

  const sideNav = <StudentMenuContent {...menuProps} />;

  const layoutClass = `student-portal-layout flex h-[100dvh] max-h-[100dvh] min-h-0 overflow-hidden${sidebarCollapsed ? " portal-sidebar-collapsed" : ""}`;
  const sidebarClass = "erp-sidebar student-portal-sidebar student-portal-sidebar--desktop";

  return (
    <div className={layoutClass}>
      {!sidebarCollapsed ? (
        <aside className={sidebarClass} aria-label="Student portal menu">
          {sideNav}
        </aside>
      ) : null}

      {sidebarOpen ? (
        <div className="erp-mobile-overlay fixed inset-0 z-[110] lg:hidden" role="presentation" onClick={() => setSidebarOpen(false)}>
          <aside className="erp-mobile-drawer" onClick={(ev) => ev.stopPropagation()} aria-label="Student portal menu">
            {sideNav}
          </aside>
        </div>
      ) : null}

      <div className="student-portal-main flex h-full min-h-0 min-w-0 flex-1 flex-col">
        <PortalShellHeader
          pageTitle={pageTitle}
          portalLabel="Student portal"
          titleOnly={!showBrandedHeader}
          subPageBackHref={subPageBackHref}
          onMenuClick={toggleMenu}
          menuOpen={sidebarOpen}
          menuAriaLabel={sidebarOpen || !sidebarCollapsed ? "Close menu" : "Open menu"}
          unreadCount={unreadCount}
          notificationsHref="/student/notifications"
        />

        <div className="student-portal-body flex-1 overflow-y-auto">
          <div className="student-portal-body-inner portal-page-body">
            <Suspense fallback={<StudentPortalRouteSkeleton />}>
              <Outlet />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StudentPortalShell() {
  return (
    <StudentPortalThemeProvider>
      <StudentPortalChrome />
    </StudentPortalThemeProvider>
  );
}
