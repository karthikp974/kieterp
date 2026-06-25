import {
  Bell,
  BookOpen,
  CalendarDays,
  GraduationCap,
  LayoutDashboard,
  Layers3,
  MessageSquare,
  School,
  UserRoundCog,
  Users,
  WalletCards,
  X
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context";
import { CurrentUserAvatar } from "./UserAvatar";

const adminMenuGroups = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", module: "dashboard", icon: LayoutDashboard }]
  },
  {
    label: "Structure",
    items: [
      { label: "Department & Branch", module: "department-branch", icon: School },
      { label: "Classes & Sections", module: "classes-sections", icon: Layers3 },
      { label: "Batches", module: "batches", icon: CalendarDays }
    ]
  },
  {
    label: "Academics",
    items: [
      { label: "Subjects", module: "subjects", icon: BookOpen },
      { label: "Syllabus", module: "syllabus", icon: BookOpen },
      { label: "Teachers", module: "teachers", icon: UserRoundCog },
      { label: "Students", module: "students", icon: GraduationCap },
      { label: "Promotion", module: "promotion", icon: Users }
    ]
  },
  {
    label: "Finance",
    items: [
      { label: "Fee Structure", module: "fee-structure", icon: WalletCards },
      { label: "Payments", module: "payments", icon: WalletCards }
    ]
  },
  {
    label: "Engage",
    items: [
      { label: "Announcements", module: "announcements", icon: Bell },
      { label: "Feedback", module: "feedback", icon: MessageSquare },
      { label: "Reports", module: "reports", icon: Layers3 }
    ]
  }
];

type AdminMenuContentProps = {
  onClose: () => void;
  onAfterNavigate?: () => void;
  onSignOut?: () => void | Promise<void>;
};

export function AdminMenuContent({ onAfterNavigate, onClose, onSignOut }: AdminMenuContentProps) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  function go(module: string) {
    if (isModuleActive(location.pathname, location.search, module)) {
      onAfterNavigate?.();
      return;
    }
    onAfterNavigate?.();
    void navigate(modulePath(module));
  }

  return (
    <div className="erp-sidebar-content flex h-full flex-col">
      <div className="erp-brand">
        <div>
          <p className="erp-brand-title">CampusERP</p>
          <p className="erp-brand-subtitle">Admin portal</p>
        </div>
        <button type="button" className="erp-sidebar-close" onClick={onClose} aria-label="Close menu">
          <X size={18} />
        </button>
      </div>
      <div className="erp-dark-profile">
        <CurrentUserAvatar size="md" className="erp-dark-avatar" />
        <div>
          <p className="erp-dark-profile-name">{user?.fullName ?? "Chairman Admin"}</p>
          <p className="erp-dark-profile-meta">Chairman control</p>
        </div>
      </div>
      <div className="erp-menu-groups">
        {adminMenuGroups.map((group) => (
          <div className="erp-menu-group" key={group.label}>
            <p className="erp-menu-heading">{group.label}</p>
            <div className="erp-menu-list">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = isModuleActive(location.pathname, location.search, item.module);
                return (
                  <button className={`erp-menu-button ${isActive ? "active" : ""}`} key={item.label} type="button" onClick={() => go(item.module)}>
                    <span className="erp-menu-label">
                      <Icon size={17} />
                      {item.label}
                    </span>
                  </button>
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

function modulePath(module: string) {
  if (module === "dashboard") return "/admin";
  if (module === "department-branch") return "/department-branch";
  if (module === "classes-sections") return "/classes-sections";
  if (module === "batches") return "/batches";
  if (module === "subjects") return "/subjects";
  if (module === "syllabus") return "/syllabus";
  if (module === "teachers") return "/teachers";
  if (module === "students") return "/students";
  if (module === "promotion") return "/promotion";
  if (module === "fee-structure") return "/fee-structure";
  if (module === "payments") return "/payments";
  if (module === "announcements") return "/announcements";
  if (module === "feedback") return "/feedback";
  if (module === "reports") return "/reports";
  return `/admin/modules?module=${module}`;
}

function isModuleActive(pathname: string, search: string, module: string) {
  const activeModule = new URLSearchParams(search).get("module");
  if (module === "dashboard") return pathname === "/admin";
  if (module === "reports") return pathname === "/reports" || pathname.startsWith("/reports/");
  if (pathname === "/admin/modules") return activeModule === module;
  return pathname.startsWith(modulePath(module));
}
