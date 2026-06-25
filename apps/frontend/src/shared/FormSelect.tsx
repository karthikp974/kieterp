import { SearchableSelect } from "./SearchableSelect";

export type FormSelectOption = readonly [string, string];

type FormSelectProps = {
  value: string;
  onChange: (value: string) => void | Promise<void>;
  options: readonly FormSelectOption[];
  disabled?: boolean;
  required?: boolean;
  id?: string;
  className?: string;
  /** Native aria-label when no visible Field label */
  "aria-label"?: string;
};

/** Branded dropdown (SearchableSelect, search off) — use instead of native `<select>`. */
export function FormSelect({
  value,
  onChange,
  options,
  disabled,
  required,
  className = "",
  "aria-label": ariaLabel
}: FormSelectProps) {
  const emptyOption = options.find(([optValue]) => optValue === "");
  const placeholder = emptyOption?.[1] ?? "Select";

  return (
    <SearchableSelect
      aria-label={ariaLabel}
      className={className}
      clearable={Boolean(emptyOption) && !required}
      disabled={disabled}
      onChange={(next) => {
        void Promise.resolve(onChange(next));
      }}
      options={options.map(([v, l]) => [v, l] as [string, string])}
      placeholder={placeholder}
      required={required}
      searchable={false}
      value={value}
    />
  );
}
