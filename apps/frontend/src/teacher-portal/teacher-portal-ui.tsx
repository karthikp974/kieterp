import type { ReactNode } from "react";

export function TpCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`tp-card ${className}`.trim()}>{children}</section>;
}

export function TpCardHead({
  title,
  children,
  actions
}: {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="tp-card-head">
      <div>{children ?? <h2 className="tp-card-title">{title}</h2>}</div>
      {actions ? <div className="tp-card-actions">{actions}</div> : null}
    </div>
  );
}

export function TpKpiGrid({ children }: { children: ReactNode }) {
  return <div className="tp-kpi-grid">{children}</div>;
}

export function TpKpi({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="tp-kpi">
      <p className="tp-kpi-label">{label}</p>
      <p className="tp-kpi-value">{value}</p>
      {sub ? <p className="tp-kpi-sub">{sub}</p> : null}
    </div>
  );
}

export function TpBadge({ children, variant = "muted" }: { children: ReactNode; variant?: "solid" | "outline" | "muted" }) {
  return <span className={`tp-badge tp-badge--${variant}`}>{children}</span>;
}

export function TpNoAccess() {
  return (
    <div className="tp-no-access">
      <p className="tp-no-access-icon" aria-hidden>
        🔒
      </p>
      <p className="tp-no-access-title">Access denied</p>
      <p className="tp-no-access-msg">
        Your current roles do not include permission for this module. Contact an administrator if you need access.
      </p>
    </div>
  );
}
