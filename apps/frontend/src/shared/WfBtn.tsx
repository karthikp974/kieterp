import { ButtonHTMLAttributes } from "react";
import { ErpButton } from "./design-system/ErpButton";

type WfBtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
};

/** Plain institutional action — uses centralized md button tokens. */
export function WfBtn({ children, variant = "secondary", className = "", type = "button", ...rest }: WfBtnProps) {
  const mapped = variant === "primary" ? "primary" : variant === "danger" ? "danger" : "secondary";
  const legacy =
    variant === "primary" ? "db-wf-btn--primary" : variant === "danger" ? "db-wf-btn--danger" : "";
  return (
    <ErpButton type={type} variant={mapped} size="md" className={`db-wf-btn ${legacy} ${className}`.trim()} {...rest}>
      {children}
    </ErpButton>
  );
}
