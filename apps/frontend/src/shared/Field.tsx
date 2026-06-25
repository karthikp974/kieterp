import type { ReactNode } from "react";

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="db-field">
      <span>{label}</span>
      {children}
      {hint ? <span className="db-field-hint">{hint}</span> : null}
    </label>
  );
}
