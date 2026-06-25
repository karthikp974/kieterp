import { useEffect } from "react";

/** Lock page scroll while a portaled teacher bottom sheet is open. */
export function useTeacherPortalSheetLock(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;

    const portalContent = document.querySelector(".teacher-portal-content") as HTMLElement | null;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    const prevPortalOverflow = portalContent?.style.overflow ?? "";

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    if (portalContent) portalContent.style.overflow = "hidden";

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
      if (portalContent) portalContent.style.overflow = prevPortalOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
}
