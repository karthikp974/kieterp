import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  APPLICATION_CATEGORIES,
  formatApplicationCategory,
  type ApplicationCategory
} from "./student-applications-types";

type Props = {
  value: ApplicationCategory;
  onChange: (value: ApplicationCategory) => void;
  disabled?: boolean;
  "aria-labelledby"?: string;
};

export function StudentApplicationCategoryField({
  value,
  onChange,
  disabled,
  "aria-labelledby": ariaLabelledBy
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const ignoreOutsideCloseUntilRef = useRef(0);
  const listId = useId();

  useEffect(() => {
    if (!open) return;

    function closeOnOutside(event: PointerEvent) {
      if (performance.now() < ignoreOutsideCloseUntilRef.current) return;
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutside, true);
    window.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutside, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function markOpeningGuard() {
    ignoreOutsideCloseUntilRef.current = performance.now() + 280;
  }

  function pickCategory(category: ApplicationCategory) {
    onChange(category);
    setOpen(false);
  }

  function toggleOpen() {
    if (disabled) return;
    setOpen((current) => {
      if (!current) markOpeningGuard();
      return !current;
    });
  }

  return (
    <div className={`sp-app-select-field${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="sp-app-select-trigger"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        aria-labelledby={ariaLabelledBy}
        disabled={disabled}
        onClick={toggleOpen}
      >
        <span>{formatApplicationCategory(value)}</span>
        <ChevronDown className={`sp-app-select-chevron${open ? " is-open" : ""}`} size={18} aria-hidden />
      </button>
      {open ? (
        <ul
          className="sp-app-select-menu"
          id={listId}
          role="listbox"
          aria-label="Application category"
        >
          {APPLICATION_CATEGORIES.map((category) => (
            <li key={category}>
              <button
                type="button"
                role="option"
                aria-selected={category === value}
                className={`sp-app-select-option${category === value ? " is-selected" : ""}`}
                onClick={() => pickCategory(category)}
              >
                <span>{formatApplicationCategory(category)}</span>
                {category === value ? <Check size={16} aria-hidden /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
