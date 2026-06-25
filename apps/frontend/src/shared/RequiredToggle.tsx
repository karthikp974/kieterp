type RequiredToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  id?: string;
};

/** Aligned required switch for form builders and wizards. */
export function RequiredToggle({ checked, onChange, label = "Required", id }: RequiredToggleProps) {
  const inputId = id ?? `req-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="erp-required-toggle">
      <span className="erp-required-toggle-label">{label}</span>
      <label className="erp-required-toggle-control" htmlFor={inputId}>
        <input id={inputId} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="erp-required-toggle-track" aria-hidden />
      </label>
    </div>
  );
}
