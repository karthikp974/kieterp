import { X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { readPortalTheme, useOptionalPortalTheme } from "../../shared/portal-theme";
import type { FeeBreakdownView, StudentFeeYearBreakdown } from "./student-fees-types";
import { filterYearBreakdown, filterYearItems } from "./student-fees-types";
import { StudentFeeYearBreakdownCard } from "./StudentFeeYearBreakdownCard";

const VIEW_TITLES: Record<FeeBreakdownView, string> = {
  total: "Total fee breakdown",
  paid: "Paid breakdown",
  outstanding: "Outstanding breakdown"
};

type Props = {
  view: FeeBreakdownView;
  breakdown: StudentFeeYearBreakdown | null | undefined;
  onClose: () => void;
};

export function StudentFeeBreakdownSheet({ view, breakdown, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const portalTheme = useOptionalPortalTheme();
  const themeMode = portalTheme?.mode ?? readPortalTheme();
  const filtered = filterYearBreakdown(breakdown, view);

  useEffect(() => {
    const portalBody = document.querySelector(".student-portal-body") as HTMLElement | null;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    const prevPortalOverflow = portalBody?.style.overflow ?? "";

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    if (portalBody) portalBody.style.overflow = "hidden";

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
      if (portalBody) portalBody.style.overflow = prevPortalOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const blockBackdropScroll = (event: Event) => {
      const target = event.target as Node;
      if (bodyRef.current?.contains(target)) return;
      event.preventDefault();
    };

    overlay.addEventListener("wheel", blockBackdropScroll, { passive: false });
    overlay.addEventListener("touchmove", blockBackdropScroll, { passive: false });
    return () => {
      overlay.removeEventListener("wheel", blockBackdropScroll);
      overlay.removeEventListener("touchmove", blockBackdropScroll);
    };
  });

  if (typeof document === "undefined") return null;

  const hasAny = view === "total" || filtered.completedYears.length > 0 || filtered.hasOngoing;

  return createPortal(
    <div
      ref={overlayRef}
      className="portal-root student-portal-root sp-fee-modal-overlay"
      data-portal-theme={themeMode}
      role="presentation"
      onClick={onClose}
    >
      <div
        className="sp-fee-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sp-fee-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sp-fee-modal-head">
          <div>
            <h2 id="sp-fee-modal-title">{VIEW_TITLES[view]}</h2>
            <p className="sp-fee-modal-sub">Completed and ongoing academic years for your account.</p>
          </div>
          <button type="button" className="sp-fee-modal-close" aria-label="Close breakdown" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <div ref={bodyRef} className="sp-fee-modal-body">
          {!hasAny ? (
            <p className="sp-fee-modal-empty">No fee rows match this breakdown.</p>
          ) : (
            <>
              {filtered.completedYears.length > 0 || view === "total" ? (
                <section className="sp-fee-modal-section" aria-label="Completed years">
                  <h3 className="sp-fee-modal-section-title">Completed years</h3>
                  <div className="sp-fee-modal-sem-list">
                    {filtered.completedYears.map((year) => (
                      <StudentFeeYearBreakdownCard
                        key={year.yearNumber}
                        year={{
                          ...year,
                          items: view === "total" ? year.items : filterYearItems(year.items, view)
                        }}
                        view={view}
                      />
                    ))}
                  </div>
                </section>
              ) : null}
              {filtered.hasOngoing || view === "total" ? (
                <section className="sp-fee-modal-section" aria-label="Ongoing year">
                  <h3 className="sp-fee-modal-section-title">Ongoing year</h3>
                  <StudentFeeYearBreakdownCard
                    year={{
                      ...filtered.ongoingYear,
                      items:
                        view === "total"
                          ? filtered.ongoingYear.items
                          : filterYearItems(filtered.ongoingYear.items, view)
                    }}
                    view={view}
                  />
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
