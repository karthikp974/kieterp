import { useEffect } from "react";

const ROOT_CLASS = "portal-mobile-menu-open";

/** Toggle document class so mobile drawers hide page headers (all portals). */
export function setPortalMobileMenuOpen(open: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle(ROOT_CLASS, open);
}

/** Keep html.portal-mobile-menu-open in sync while a mobile drawer is open. */
export function usePortalMobileMenuOpen(isOpen: boolean) {
  useEffect(() => {
    setPortalMobileMenuOpen(isOpen);
    return () => setPortalMobileMenuOpen(false);
  }, [isOpen]);
}
