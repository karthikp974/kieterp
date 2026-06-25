import { X } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { STUDENT_PORTAL_NAV } from "../student-portal/student-portal-nav";
import { CurrentUserAvatar } from "./UserAvatar";

type StudentMenuContentProps = {
  onClose: () => void;
  onAfterNavigate?: () => void;
  onSignOut?: () => void | Promise<void>;
  showClose?: boolean;
  exitHref?: string | null;
};

/** Same sidebar structure as AdminMenu — colors come from portal theme CSS only. */
export function StudentMenuContent({
  onAfterNavigate,
  onClose,
  onSignOut,
  showClose = true,
  exitHref = null
}: StudentMenuContentProps) {
  const { user } = useAuth();

  return (
    <div className="erp-sidebar-content flex h-full flex-col">
      <div className="erp-brand">
        <div>
          <p className="erp-brand-title">CampusERP</p>
          <p className="erp-brand-subtitle">Student portal</p>
        </div>
        {showClose ? (
          <button type="button" className="erp-sidebar-close" onClick={onClose} aria-label="Close menu">
            <X size={18} />
          </button>
        ) : null}
      </div>
      <div className="erp-dark-profile">
        <CurrentUserAvatar size="md" className="erp-dark-avatar" />
        <div>
          <p className="erp-dark-profile-name">{user?.fullName ?? "Student"}</p>
          <p className="erp-dark-profile-meta">Student workspace</p>
        </div>
      </div>
      {exitHref ? (
        <NavLink className="erp-menu-button mb-3" to={exitHref} onClick={onAfterNavigate}>
          <span className="erp-menu-label">← Admin dashboard</span>
        </NavLink>
      ) : null}
      <div className="erp-menu-groups flex-1 overflow-y-auto">
        {STUDENT_PORTAL_NAV.map((section) => (
          <div className="erp-menu-group" key={section.sectionLabel}>
            <p className="erp-menu-heading">{section.sectionLabel}</p>
            <div className="erp-menu-list">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={onAfterNavigate}
                    className={({ isActive }) => `erp-menu-button${isActive ? " active" : ""}`}
                  >
                    <span className="erp-menu-label">
                      <Icon size={17} aria-hidden />
                      {item.label}
                    </span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {onSignOut ? (
        <button type="button" onClick={() => void onSignOut()} className="erp-signout">
          Sign out
        </button>
      ) : null}
    </div>
  );
}
