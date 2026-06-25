/** Scroll a form field into view inside the student portal scroll container (avoids window scroll on mobile). */
export function scrollStudentPortalFieldIntoView(element: HTMLElement) {
  window.requestAnimationFrame(() => {
    const scrollParent = element.closest(".student-portal-body") as HTMLElement | null;
    if (!scrollParent) {
      element.scrollIntoView({ block: "nearest", behavior: "smooth" });
      return;
    }

    const padding = 12;
    const elRect = element.getBoundingClientRect();
    const parentRect = scrollParent.getBoundingClientRect();
    const targetTop = elRect.top - parentRect.top + scrollParent.scrollTop - padding;

    scrollParent.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
  });
}
