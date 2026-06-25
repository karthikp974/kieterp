import { ArrowLeft, Menu, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ProfileMenuButton } from "./ProfileMenu";
import { PortalNotificationsButton } from "./PortalNotificationsButton";
import { usePortalTheme } from "./portal-theme";

type Props = {
  pageTitle: string;
  onMenuClick: () => void;
  menuAriaLabel?: string;
  notificationsHref?: string;
  unreadCount?: number;
  onNotificationsClick?: () => void;
  roleChips?: string[];
  showThemeToggle?: boolean;
  portalLabel?: string;
  /** Timetable-style bar: menu + page title only (no logo / ERP branding). */
  titleOnly?: boolean;
  /** Sub-page: back + title left; menu hidden, notifications stay visible. */
  subPageBackHref?: string;
  /** Mobile drawer open — show close icon on menu button. */
  menuOpen?: boolean;
};

/** One admin-style top bar for light and dark; only colors change via portal-theme-overrides. */
export function PortalShellHeader({
  pageTitle,
  onMenuClick,
  menuAriaLabel = "Toggle menu",
  notificationsHref,
  unreadCount = 0,
  onNotificationsClick,
  roleChips,
  showThemeToggle = true,
  portalLabel = "Teacher portal",
  titleOnly = false,
  subPageBackHref,
  menuOpen = false
}: Props) {
  const navigate = useNavigate();
  const { mode, toggleMode } = usePortalTheme();

  function handleNotifications() {
    if (onNotificationsClick) {
      onNotificationsClick();
      return;
    }
    if (notificationsHref) {
      void navigate(notificationsHref);
    }
  }

  const themeToggle = showThemeToggle ? { mode, onToggle: toggleMode } : undefined;
  const onBlue = mode === "light";

  return (
    <header className="erp-topbar portal-shell-header sticky top-0 z-[100]">
      <div className="erp-topbar-inner flex items-center justify-between gap-3">
        <div className="erp-app-header-left">
          {subPageBackHref ? (
            <>
              <button
                type="button"
                className="portal-shell-back-btn"
                onClick={() => void navigate(subPageBackHref)}
                aria-label="Go back"
              >
                <ArrowLeft size={20} aria-hidden />
              </button>
              <h1 className="portal-shell-title-only portal-shell-subpage-title db-header-title">{pageTitle}</h1>
            </>
          ) : (
            <button type="button" className="erp-menu-toggle" onClick={onMenuClick} aria-label={menuAriaLabel}>
              {menuOpen ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
            </button>
          )}
          {!subPageBackHref && titleOnly && pageTitle ? (
            <h1 className="portal-shell-title-only db-header-title">{pageTitle}</h1>
          ) : !subPageBackHref ? (
            <>
              <img className="erp-header-logo" src="/kiet-logo.png" alt="KIET Group of Institutions" />
              <div className="erp-header-copy">
                <p className="erp-header-title">KIET ERP</p>
                <p className="erp-header-subtitle">{portalLabel}</p>
              </div>
              {pageTitle !== "Dashboard" ? <span className="erp-page-pill">{pageTitle}</span> : null}
              {roleChips?.length ? (
                <div className="portal-shell-role-chips hidden lg:flex" aria-label="Active roles">
                  {roleChips.map((role) => (
                    <span
                      key={role}
                      className={onBlue ? "portal-shell-role-chip portal-shell-role-chip--on-blue" : "portal-shell-role-chip"}
                    >
                      {role}
                    </span>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="erp-topbar-actions flex items-center gap-2">
          {notificationsHref || onNotificationsClick ? (
            <PortalNotificationsButton
              unreadCount={unreadCount}
              onClick={handleNotifications}
              className={onBlue ? "erp-icon-button portal-notifications-btn--on-blue" : "erp-icon-button"}
            />
          ) : null}
          <ProfileMenuButton className="erp-top-avatar" themeToggle={themeToggle} />
        </div>
      </div>
    </header>
  );
}
