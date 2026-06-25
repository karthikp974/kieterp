import { useEffect } from "react";



/** Lock page scroll while a portaled student bottom sheet is open. */

export function useStudentPortalSheetLock(open: boolean, onClose: () => void) {

  useEffect(() => {

    if (!open) return;



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

  }, [open, onClose]);

}

