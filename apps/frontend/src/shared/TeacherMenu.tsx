import { Menu, X } from "lucide-react";
import { useState } from "react";
import { usePortalMobileMenuOpen } from "./portal-mobile-menu";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { useTeacherPortal } from "../teacher-portal/teacher-portal-context";
import { canCreateTeacherModule } from "../teacher-portal/teacher-portal-permissions";
import { groupMenuBySection, TEACHER_MODULE_ICONS } from "../teacher-portal/teacher-portal-nav";
import type { TeacherPortalMenuItem, TeacherPortalModuleKey } from "../teacher-portal/teacher-portal-types";
import { CurrentUserAvatar } from "./UserAvatar";

const EDIT_BADGE_MODULES = new Set<TeacherPortalModuleKey>(["timetable", "syllabus"]);

type TeacherMenuContentProps = {
  items: TeacherPortalMenuItem[];
  roles: string[];
  onClose: () => void;
  onAfterNavigate?: () => void;
  onSignOut?: () => void | Promise<void>;
  showClose?: boolean;
};

/** Same sidebar structure as AdminMenu — colors come from portal theme CSS only. */
export function TeacherMenuContent({
  items,
  onAfterNavigate,
  onClose,
  onSignOut,
  roles,
  showClose = true
}: TeacherMenuContentProps) {
  const { user } = useAuth();
  const groups = groupMenuBySection(items);
  const roleLabel = roles.length ? roles.join(" · ") : "Teacher";

  return (
    <div className="erp-sidebar-content flex h-full flex-col">
      <div className="erp-brand">
        <div>
          <p className="erp-brand-title">CampusERP</p>
          <p className="erp-brand-subtitle">Teacher portal</p>
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
          <p className="erp-dark-profile-name">{user?.fullName ?? "Teacher"}</p>
          <p className="erp-dark-profile-meta">{roleLabel}</p>
        </div>
      </div>
      <div className="erp-menu-groups flex-1 overflow-y-auto">
        {groups.map((group) => (
          <div className="erp-menu-group" key={group.label}>
            <p className="erp-menu-heading">{group.label}</p>
            <div className="erp-menu-list">
              {group.items.map((item) => {
                const Icon = TEACHER_MODULE_ICONS[item.key];
                const showEdit = EDIT_BADGE_MODULES.has(item.key) && canCreateTeacherModule(user, item.key);
                return (
                  <NavLink
                    key={item.key}
                    to={item.path}
                    end={item.key === "dashboard"}
                    onClick={onAfterNavigate}
                    className={({ isActive }) => `erp-menu-button${isActive ? " active" : ""}`}
                  >
                    <span className="erp-menu-label">
                      <Icon size={17} aria-hidden />
                      {item.label}
                      {showEdit ? <span className="erp-menu-badge">EDIT</span> : null}
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

/** Hamburger drawer for teacher workflow pages that hide the main portal shell header. */
export function TeacherWorkflowMenuButton() {
  const [isOpen, setIsOpen] = useState(false);
  usePortalMobileMenuOpen(isOpen);
  const { menu } = useTeacherPortal();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const sidebarItems = menu?.modules ?? [];
  const roles = menu?.roles ?? [];

  async function handleLogout() {
    setIsOpen(false);
    await logout();
    void navigate("/login", { replace: true });
  }

  return (
    <>
      <button className="db-icon-button" type="button" onClick={() => setIsOpen(true)} aria-label="Open menu">
        <Menu size={20} />
      </button>
      {isOpen ? (
        <div
          className="erp-mobile-overlay portal-engage-menu-overlay fixed inset-0 z-[120]"
          role="presentation"
          onClick={() => setIsOpen(false)}
        >
          <aside
            className="erp-mobile-drawer portal-engage-menu-drawer"
            aria-label="Teacher portal menu"
            onClick={(event) => event.stopPropagation()}
          >
            <TeacherMenuContent
              items={sidebarItems}
              roles={roles}
              onClose={() => setIsOpen(false)}
              onAfterNavigate={() => setIsOpen(false)}
              onSignOut={handleLogout}
            />
          </aside>
        </div>
      ) : null}
    </>
  );
}
