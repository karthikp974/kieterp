import { KeyRound, LogOut, Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { ChangePasswordDialog } from "../shared/ChangePasswordDialog";
import { CurrentUserAvatar } from "../shared/UserAvatar";
import { useStudentPortalTheme } from "./student-portal-theme";

export function StudentPortalProfileMenu({ avatarClassName = "student-portal-avatar-ring" }: { avatarClassName?: string }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { mode, toggleMode } = useStudentPortalTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  async function handleLogout() {
    await logout();
    void navigate("/login", { replace: true });
  }

  return (
    <>
      <div className="student-portal-profile-wrap" ref={menuRef}>
        <button type="button" className="student-portal-profile-trigger" aria-label="Profile menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
          <CurrentUserAvatar size="xs" className={avatarClassName} />
        </button>
        {menuOpen ? (
          <div className="student-portal-profile-dropdown" role="menu">
            <div className="student-portal-profile-hero">
              <CurrentUserAvatar size="lg" className="student-portal-profile-dropdown-avatar" />
              <p className="student-portal-profile-name">{user?.fullName ?? "Student"}</p>
              <p className="student-portal-profile-meta">Student portal</p>
            </div>
            <button type="button" className="student-portal-profile-item" role="menuitem" onClick={() => void handleLogout()}>
              <LogOut size={18} aria-hidden />
              Logout
            </button>
            <button
              type="button"
              className="student-portal-profile-item"
              role="menuitem"
              onClick={() => {
                setPasswordOpen(true);
                setMenuOpen(false);
              }}
            >
              <KeyRound size={18} aria-hidden />
              Change Password
            </button>
            <button type="button" className="student-portal-profile-item" role="menuitem" onClick={() => toggleMode()}>
              {mode === "dark" ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
              Theme: {mode === "dark" ? "Light mode" : "Dark mode"}
            </button>
          </div>
        ) : null}
      </div>
      {passwordOpen ? <ChangePasswordDialog onClose={() => setPasswordOpen(false)} /> : null}
    </>
  );
}
