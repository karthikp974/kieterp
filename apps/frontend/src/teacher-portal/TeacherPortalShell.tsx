import { Suspense, useState } from "react";
import { usePortalMobileMenuOpen } from "../shared/portal-mobile-menu";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { useToast } from "../shared/toast-context";
import { useResultsImportRecovery } from "./useResultsImportRecovery";
import { PortalShellHeader } from "../shared/PortalShellHeader";
import { TeacherMenuContent } from "../shared/TeacherMenu";
import { TeacherPortalProvider, useTeacherPortal } from "./teacher-portal-context";
import { teacherPortalHideShellHeader, teacherPortalPageTitle, teacherPortalShowBrandedHeader, teacherPortalSubPageBackHref } from "./teacher-portal-nav";
import { TeacherPortalHeaderProvider, useTeacherPortalDetailTitle } from "./teacher-portal-header-context";
import { TeacherPortalRouteSkeleton } from "./TeacherPortalRouteSkeleton";
import { TeacherPortalThemeProvider } from "./teacher-portal-theme";
import { useTeacherNotificationCount } from "./useTeacherNotificationCount";

function TeacherPortalChrome() {
  const { logout, authFetch } = useAuth();
  const { showToast } = useToast();
  useResultsImportRecovery(authFetch, showToast);
  const navigate = useNavigate();
  const location = useLocation();
  const { menu, hasModule, defaultPath, loading, loadError } = useTeacherPortal();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const sidebarClass = "erp-sidebar teacher-portal-sidebar teacher-portal-sidebar--desktop";

  const detailTitle = useTeacherPortalDetailTitle();
  const hideShellHeader = teacherPortalHideShellHeader(location.pathname);
  const showBrandedHeader = teacherPortalShowBrandedHeader(location.pathname);
  const subPageBackHref = teacherPortalSubPageBackHref(
    location.pathname,
    location.state as { from?: string } | null
  );
  const pageTitle = detailTitle ?? teacherPortalPageTitle(location.pathname);
  const sidebarItems = menu?.modules ?? [];
  const roles = menu?.roles ?? [];
  const unreadNotifications = useTeacherNotificationCount();

  usePortalMobileMenuOpen(sidebarOpen);

  async function handleLogout() {
    await logout();
    void navigate("/login", { replace: true });
  }

  if (menu && location.pathname === "/teacher" && !hasModule("dashboard")) {
    return <Navigate to={defaultPath} replace />;
  }

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

  const sideNav = (
    <TeacherMenuContent
      items={sidebarItems}
      roles={roles}
      showClose
      onClose={closeSidebar}
      onAfterNavigate={() => setSidebarOpen(false)}
      onSignOut={handleLogout}
    />
  );

  const rootClass = `teacher-portal-layout flex h-[100dvh] max-h-[100dvh] min-h-0 overflow-hidden${sidebarCollapsed ? " portal-sidebar-collapsed" : ""}`;

  return (
    <div className={rootClass}>
      {!sidebarCollapsed ? (
        <aside className={sidebarClass} aria-label="Teacher portal menu">
          {sideNav}
        </aside>
      ) : null}

      {sidebarOpen ? (
        <div className="erp-mobile-overlay fixed inset-0 z-[110] lg:hidden" role="presentation" onClick={() => setSidebarOpen(false)}>
          <aside className="erp-mobile-drawer" onClick={(ev) => ev.stopPropagation()}>
            {sideNav}
          </aside>
        </div>
      ) : null}

      <div className="teacher-portal-main flex h-full min-h-0 min-w-0 flex-1 flex-col">
        {!hideShellHeader ? (
          <PortalShellHeader
            pageTitle={pageTitle}
            portalLabel="Teacher portal"
            titleOnly={!showBrandedHeader}
            subPageBackHref={subPageBackHref}
            onMenuClick={toggleMenu}
            menuOpen={sidebarOpen}
            menuAriaLabel={sidebarOpen || !sidebarCollapsed ? "Close menu" : "Open menu"}
            roleChips={roles}
            unreadCount={unreadNotifications}
            notificationsHref="/teacher/notifications"
          />
        ) : null}

        <div className="teacher-portal-content flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="teacher-portal-content-inner portal-page-body">
            {loadError ? (
              <section className="db-section teacher-portal-load-error">
                <h2>Teacher portal unavailable</h2>
                <p className="db-muted">{loadError}</p>
                <p className="db-muted">
                  Chairman/admin accounts manage the ERP from <strong>/admin</strong>. Sign in with a teacher employee
                  code assigned by your campus admin.
                </p>
              </section>
            ) : loading && !menu ? (
              <TeacherPortalRouteSkeleton />
            ) : (
              <Suspense fallback={<TeacherPortalRouteSkeleton />}>
                <Outlet />
              </Suspense>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

export function TeacherPortalShell() {
  return (
    <TeacherPortalThemeProvider>
      <TeacherPortalProvider>
        <TeacherPortalHeaderProvider>
          <TeacherPortalChrome />
        </TeacherPortalHeaderProvider>
      </TeacherPortalProvider>
    </TeacherPortalThemeProvider>
  );
}
