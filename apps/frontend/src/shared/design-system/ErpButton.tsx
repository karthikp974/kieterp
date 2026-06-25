import { ButtonHTMLAttributes } from "react";

export type ErpButtonSize = "sm" | "md" | "lg";
export type ErpButtonVariant = "primary" | "secondary" | "danger" | "icon";

type ErpButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: ErpButtonSize;
  variant?: ErpButtonVariant;
};

const variantClass: Record<ErpButtonVariant, string> = {
  primary: "erp-btn--primary",
  secondary: "erp-btn--secondary",
  danger: "erp-btn--danger",
  icon: "erp-btn--icon erp-btn--secondary"
};

/** Centralized button — use instead of page-specific button sizes. */
export function ErpButton({
  children,
  size = "md",
  variant = "secondary",
  className = "",
  type = "button",
  ...rest
}: ErpButtonProps) {
  const sizeClass = variant === "icon" ? "erp-btn--icon-size" : `erp-btn--${size}`;
  return (
    <button type={type} className={`erp-btn ${sizeClass} ${variantClass[variant]} ${className}`.trim()} {...rest}>
      {children}
    </button>
  );
}

/** Back-compat alias for existing workflow pages. */
export function WfBtnCompat({
  children,
  variant = "secondary",
  className = "",
  ...rest
}: Omit<ErpButtonProps, "size">) {
  const mapped = variant === "primary" ? "primary" : variant === "danger" ? "danger" : "secondary";
  return (
    <ErpButton size="md" variant={mapped} className={`db-wf-btn ${className}`.trim()} {...rest}>
      {children}
    </ErpButton>
  );
}
