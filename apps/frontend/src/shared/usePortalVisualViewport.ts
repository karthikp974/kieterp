import { useEffect } from "react";

/** Keep portal shells sized to the visible viewport on mobile (keyboard-safe). */
export function usePortalVisualViewport(enabled = true) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const root = document.documentElement;
    const mobileQuery = window.matchMedia("(max-width: 1023px)");

    function sync() {
      if (!mobileQuery.matches) {
        root.style.removeProperty("--portal-vvh");
        root.style.removeProperty("--portal-vv-offset-top");
        return;
      }

      const vv = window.visualViewport;
      const height = vv?.height ?? window.innerHeight;
      const offsetTop = vv?.offsetTop ?? 0;
      root.style.setProperty("--portal-vvh", `${Math.round(height)}px`);
      root.style.setProperty("--portal-vv-offset-top", `${Math.round(offsetTop)}px`);
    }

    sync();
    mobileQuery.addEventListener("change", sync);
    window.visualViewport?.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);

    function onFocusIn(event: FocusEvent) {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        window.requestAnimationFrame(sync);
        window.setTimeout(sync, 120);
        window.setTimeout(sync, 320);
      }
    }

    document.addEventListener("focusin", onFocusIn);

    return () => {
      mobileQuery.removeEventListener("change", sync);
      window.visualViewport?.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      document.removeEventListener("focusin", onFocusIn);
      root.style.removeProperty("--portal-vvh");
      root.style.removeProperty("--portal-vv-offset-top");
    };
  }, [enabled]);
}
