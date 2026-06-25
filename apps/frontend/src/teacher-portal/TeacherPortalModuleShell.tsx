import type { ReactNode } from "react";

export function TeacherPortalModuleHero({ title, subtitle }: { title?: string; subtitle?: string }) {
  if (!title && !subtitle) return null;
  return (
    <header className="teacher-portal-module-hero">
      {title ? <h1 className="teacher-portal-module-title">{title}</h1> : null}
      {subtitle ? <p className="teacher-portal-module-subtitle">{subtitle}</p> : null}
    </header>
  );
}

export function TeacherPortalModuleShell({
  title,
  subtitle,
  children
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="teacher-portal-module-stack">
      {subtitle || title ? <TeacherPortalModuleHero title={title} subtitle={subtitle} /> : null}
      {children}
    </div>
  );
}

export function TeacherPortalPanelWrap({ children }: { children: ReactNode }) {
  return <div className="teacher-portal-panel-wrap">{children}</div>;
}
