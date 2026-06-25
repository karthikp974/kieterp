import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

/** Above modal overlays (9500) so dropdowns work inside custom-period / confirm dialogs. */
const PORTAL_SELECT_Z_INDEX = 9800;

export type SearchableSelectOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

type OptionInput = SearchableSelectOption | [string, string];

function normalizeOptionInput(option: OptionInput): SearchableSelectOption {
  if (Array.isArray(option)) {
    return { value: option[0], label: option[1] };
  }
  return option;
}

type SearchableSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: readonly OptionInput[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  loading?: boolean;
  disabled?: boolean;
  required?: boolean;
  clearable?: boolean;
  className?: string;
  inputMode?: boolean;
  searchable?: boolean;
  "aria-label"?: string;
};

export function SearchableSelect({
  className = "",
  clearable = true,
  disabled = false,
  emptyMessage = "No options found",
  inputMode = false,
  loading = false,
  onChange,
  options,
  placeholder = "Select",
  required = false,
  searchable = true,
  searchPlaceholder = "Search options...",
  value,
  "aria-label": ariaLabel
}: SearchableSelectProps) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const touchStartRef = useRef<{ x: number; y: number; value: string } | null>(null);
  const ignoreOutsideCloseUntilRef = useRef(0);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const [listStyle, setListStyle] = useState<CSSProperties>({});

  const normalizedOptions = useMemo((): SearchableSelectOption[] => options.map(normalizeOptionInput), [options]);

  const selectedOption = normalizedOptions.find((option) => option.value === value);
  const hasEmptyOption = normalizedOptions.some((option) => option.value === "");
  const filteredOptions = useMemo(() => {
    if (!searchable) return normalizedOptions;
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return normalizedOptions;
    return normalizedOptions
      .map((option) => ({ option, score: matchScore(option, normalizedQuery) }))
      .filter((item) => item.score < Number.POSITIVE_INFINITY)
      .sort((a, b) => a.score - b.score || a.option.label.localeCompare(b.option.label))
      .map((item) => item.option);
  }, [normalizedOptions, query, searchable]);

  useEffect(() => {
    if (!isOpen || !searchable) return;
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }, [isOpen, searchable]);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPanelStyle({});
      setListStyle({});
      return;
    }

    function readSafeAreaInset(side: "top" | "bottom"): number {
      const raw = getComputedStyle(document.documentElement).getPropertyValue(`env(safe-area-inset-${side})`);
      const parsed = Number.parseFloat(raw);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    function updatePanelPosition() {
      const trigger = rootRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const gap = 8;
      const viewportPadding = 12;
      const vv = window.visualViewport;
      const viewportTop = vv?.offsetTop ?? 0;
      const viewportHeight = vv?.height ?? window.innerHeight;
      const safeTop = viewportTop + readSafeAreaInset("top") + viewportPadding;
      const safeBottom = viewportTop + viewportHeight - readSafeAreaInset("bottom") - viewportPadding;
      const keyboardLikelyOpen = viewportHeight < window.innerHeight * 0.82;
      const searchBlockHeight = searchable && !inputMode ? 52 : 0;
      const optionCount = Math.max(filteredOptions.length, 1);
      const estimatedListHeight = Math.min(320, window.innerHeight * 0.48, optionCount * 44 + 12);
      const measuredPanelHeight = panelRef.current?.offsetHeight ?? estimatedListHeight + searchBlockHeight;
      const naturalHeight = Math.max(measuredPanelHeight, estimatedListHeight + searchBlockHeight);

      const spaceBelow = safeBottom - rect.bottom - gap;
      const spaceAbove = rect.top - gap - safeTop;
      const minVisible = Math.min(naturalHeight, 160);
      const openUpward =
        keyboardLikelyOpen ||
        inputMode ||
        (spaceBelow < minVisible && spaceAbove > spaceBelow) ||
        (spaceBelow < naturalHeight && spaceAbove >= spaceBelow);

      const available = Math.max(96, openUpward ? spaceAbove : spaceBelow);
      const maxPanelHeight = Math.min(320, available);
      const maxListHeight = Math.max(72, maxPanelHeight - searchBlockHeight);
      const clampedPanelHeight = Math.min(naturalHeight, maxPanelHeight);

      let panelTop = openUpward
        ? Math.max(safeTop, rect.top - gap - clampedPanelHeight)
        : rect.bottom + gap;

      if (inputMode && keyboardLikelyOpen) {
        const keyboardSafeTop = safeTop;
        const keyboardSafeBottom = Math.min(rect.top - gap, safeBottom);
        const keyboardSpace = Math.max(96, keyboardSafeBottom - keyboardSafeTop);
        const keyboardMaxHeight = Math.min(280, keyboardSpace);
        const keyboardPanelHeight = Math.min(naturalHeight, keyboardMaxHeight);
        panelTop = Math.max(keyboardSafeTop, keyboardSafeBottom - keyboardPanelHeight);
        setPanelStyle({
          position: "fixed",
          top: panelTop,
          left: rect.left,
          width: rect.width,
          zIndex: PORTAL_SELECT_Z_INDEX,
          maxHeight: keyboardMaxHeight,
          display: "flex",
          flexDirection: "column"
        });
        setListStyle({ maxHeight: Math.max(72, keyboardMaxHeight - searchBlockHeight) });
        return;
      }

      setPanelStyle({
        position: "fixed",
        top: panelTop,
        left: rect.left,
        width: rect.width,
        zIndex: PORTAL_SELECT_Z_INDEX,
        maxHeight: maxPanelHeight,
        display: "flex",
        flexDirection: "column"
      });
      setListStyle({ maxHeight: maxListHeight });
    }

    updatePanelPosition();
    const frame1 = window.requestAnimationFrame(() => {
      updatePanelPosition();
      window.requestAnimationFrame(updatePanelPosition);
    });
    window.addEventListener("scroll", updatePanelPosition, true);
    window.addEventListener("resize", updatePanelPosition);
    window.visualViewport?.addEventListener("resize", updatePanelPosition);
    window.visualViewport?.addEventListener("scroll", updatePanelPosition);
    return () => {
      window.cancelAnimationFrame(frame1);
      window.removeEventListener("scroll", updatePanelPosition, true);
      window.removeEventListener("resize", updatePanelPosition);
      window.visualViewport?.removeEventListener("resize", updatePanelPosition);
      window.visualViewport?.removeEventListener("scroll", updatePanelPosition);
    };
  }, [filteredOptions.length, inputMode, isOpen, query, searchable]);

  useEffect(() => {
    function closeOnOutsideClick(event: PointerEvent) {
      if (performance.now() < ignoreOutsideCloseUntilRef.current) return;
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setIsOpen(false);
      setQuery("");
    }

    document.addEventListener("pointerdown", closeOnOutsideClick, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick, true);
  }, []);

  function markOpeningGuard() {
    ignoreOutsideCloseUntilRef.current = performance.now() + 280;
  }

  function toggleOpen() {
    if (disabled) return;
    setIsOpen((current) => {
      if (!current) markOpeningGuard();
      return !current;
    });
  }

  function choose(option: SearchableSelectOption) {
    if (option.disabled) return;
    onChange(option.value);
    setIsOpen(false);
    setQuery(inputMode ? option.label : "");
    if (inputMode) {
      window.setTimeout(() => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }, 0);
    }
  }

  function handleInputChange(nextQuery: string) {
    setQuery(nextQuery);
    markOpeningGuard();
    setIsOpen(true);
    if (value) {
      onChange("");
    }
  }

  function moveActive(direction: 1 | -1) {
    if (!filteredOptions.length) return;
    let nextIndex = activeIndex;
    for (let step = 0; step < filteredOptions.length; step += 1) {
      nextIndex = (nextIndex + direction + filteredOptions.length) % filteredOptions.length;
      if (!filteredOptions[nextIndex]?.disabled) {
        setActiveIndex(nextIndex);
        return;
      }
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isOpen) {
        markOpeningGuard();
        setIsOpen(true);
      } else {
        moveActive(1);
      }
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) {
        markOpeningGuard();
        setIsOpen(true);
      } else {
        moveActive(-1);
      }
    }

    if (event.key === "Enter" && isOpen) {
      event.preventDefault();
      const option = filteredOptions[activeIndex] ?? filteredOptions.find((item) => !item.disabled);
      if (option) choose(option);
    }

    if (event.key === "Escape") {
      setIsOpen(false);
      setQuery("");
    }
  }

  const displayValue = inputMode ? (isOpen || query ? query : selectedOption?.label ?? "") : selectedOption?.label ?? placeholder;

  const panel = isOpen ? (
    <div
      className="erp-select-panel erp-select-panel--portal"
      ref={panelRef}
      style={panelStyle}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {searchable && !inputMode ? (
        <div className="erp-select-search">
          <Search size={16} aria-hidden="true" />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            autoComplete="off"
          />
        </div>
      ) : null}
      <div className="erp-select-list" id={`${id}-listbox`} role="listbox" style={listStyle}>
        {loading ? <div className="erp-select-state">Loading options...</div> : null}
        {!loading && filteredOptions.length === 0 ? <div className="erp-select-state">{emptyMessage}</div> : null}
        {!loading
          ? filteredOptions.map((option, index) => (
              <button
                type="button"
                aria-selected={option.value === value}
                className={`erp-select-option ${option.value === value ? "selected" : ""}`}
                disabled={option.disabled}
                key={option.value === "" ? "__empty" : option.value}
                onMouseEnter={() => setActiveIndex(index)}
                onPointerDown={(event) => {
                  if (event.pointerType === "touch") {
                    touchStartRef.current = { x: event.clientX, y: event.clientY, value: option.value };
                    return;
                  }
                  event.preventDefault();
                  choose(option);
                }}
                onPointerMove={(event) => {
                  const start = touchStartRef.current;
                  if (!start) return;
                  const moved = Math.abs(event.clientX - start.x) > 8 || Math.abs(event.clientY - start.y) > 8;
                  if (moved) touchStartRef.current = null;
                }}
                onPointerUp={(event) => {
                  const start = touchStartRef.current;
                  touchStartRef.current = null;
                  if (!start || start.value !== option.value) return;
                  event.preventDefault();
                  choose(option);
                }}
                onClick={() => choose(option)}
                role="option"
              >
                <span>
                  <strong>{option.label}</strong>
                  {option.description ? <small>{option.description}</small> : null}
                </span>
                {option.value === value ? <Check size={16} aria-hidden="true" /> : null}
              </button>
            ))
          : null}
      </div>
    </div>
  ) : null;

  return (
    <div className={`erp-searchable-select ${className}`} ref={rootRef} onKeyDown={handleKeyDown}>
      {inputMode ? (
        <div className={`erp-select-trigger erp-select-search-trigger ${isOpen ? "open" : ""}`}>
          <Search size={17} aria-hidden="true" />
          <input
            aria-controls={`${id}-listbox`}
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            autoComplete="off"
            disabled={disabled}
            onBlur={() => {
              if (!value) return;
              window.setTimeout(() => setQuery(""), 120);
            }}
            onChange={(event) => handleInputChange(event.target.value)}
            onFocus={() => {
              markOpeningGuard();
              setIsOpen(true);
              setQuery(selectedOption?.label ?? "");
              const scrollInputIntoView = () => {
                rootRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
              };
              scrollInputIntoView();
              window.setTimeout(scrollInputIntoView, 180);
              window.setTimeout(scrollInputIntoView, 420);
            }}
            placeholder={placeholder}
            role="combobox"
            value={displayValue}
          />
          {clearable && (value || query) ? (
            <span
              aria-label="Clear selection"
              className="erp-select-clear"
              onClick={(event) => {
                event.stopPropagation();
                onChange("");
                setQuery("");
                setIsOpen(false);
              }}
              role="button"
              tabIndex={-1}
            >
              <X size={15} />
            </span>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          className={`erp-select-trigger ${isOpen ? "open" : ""}`}
          aria-controls={`${id}-listbox`}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            toggleOpen();
          }}
          role="combobox"
        >
          <span className={selectedOption ? "erp-select-value" : "erp-select-placeholder"}>
            {displayValue}
          </span>
          <span className="erp-select-actions">
            {clearable && value ? (
              <span
                aria-label="Clear selection"
                className="erp-select-clear"
                onClick={(event) => {
                  event.stopPropagation();
                  onChange("");
                  setQuery("");
                }}
                role="button"
                tabIndex={-1}
              >
                <X size={15} />
              </span>
            ) : null}
            <ChevronDown className="erp-select-chevron" size={18} aria-hidden="true" />
          </span>
        </button>
      )}
      {required && !value ? <input tabIndex={-1} className="erp-select-required" value="" required onChange={() => undefined} aria-hidden="true" /> : null}
      {panel ? createPortal(panel, document.body) : null}
    </div>
  );
}

function matchScore(option: SearchableSelectOption, normalizedQuery: string) {
  const label = option.label.toLowerCase();
  const description = option.description?.toLowerCase() ?? "";
  const haystack = `${label} ${description}`.trim();
  if (label === normalizedQuery) return 0;
  if (label.startsWith(normalizedQuery)) return 1;
  if (label.split(/[^a-z0-9]+/).some((part) => part.startsWith(normalizedQuery))) return 2;
  const labelIndex = label.indexOf(normalizedQuery);
  if (labelIndex >= 0) return 3 + labelIndex / 100;
  const descriptionIndex = description.indexOf(normalizedQuery);
  if (descriptionIndex >= 0) return 5 + descriptionIndex / 100;
  if (haystack.includes(normalizedQuery)) return 8;
  return Number.POSITIVE_INFINITY;
}
