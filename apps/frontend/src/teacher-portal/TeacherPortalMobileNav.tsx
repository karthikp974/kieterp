import { Menu } from "lucide-react";
import { NavLink } from "react-router-dom";
import { TEACHER_MODULE_ICONS } from "./teacher-portal-nav";
import type { TeacherPortalMenuItem } from "./teacher-portal-types";

type Props = {
  items: TeacherPortalMenuItem[];
  onMore: () => void;
};

export function TeacherPortalMobileNav({ items, onMore }: Props) {
  const primary = items.slice(0, 4);

  return (
    <nav className="teacher-portal-bnav lg:hidden" aria-label="Teacher portal shortcuts">
      {primary.map((item) => {
        const Icon = TEACHER_MODULE_ICONS[item.key];
        const short = item.label.split(/\s+/)[0] ?? item.label;
        return (
          <NavLink
            key={item.key}
            to={item.path}
            end={item.key === "dashboard"}
            className={({ isActive }) => `teacher-portal-bnav-item${isActive ? " teacher-portal-bnav-item--active" : ""}`}
          >
            <Icon size={17} aria-hidden />
            <span>{short}</span>
          </NavLink>
        );
      })}
      <button type="button" className="teacher-portal-bnav-item" onClick={onMore} aria-label="Open full menu">
        <Menu size={17} aria-hidden />
        <span>More</span>
      </button>
    </nav>
  );
}
