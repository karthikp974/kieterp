import { ChevronLeft, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../../auth/auth-context";
import { readPortalTheme, useOptionalPortalTheme } from "../../shared/portal-theme";
import { useToast } from "../../shared/toast-context";
import { StudentPortalSubjectSyllabusCard } from "./StudentPortalSubjectSyllabusCard";
import type { StudentSyllabusDetailResponse, StudentSyllabusUnit } from "./student-subjects-types";
import { StudentSyllabusModalSkeleton } from "./StudentPortalSubjectsSkeleton";

async function readError(response: Response) {
  const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
  const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
  return new Error(message || "Request failed.");
}

type Props = {
  subjectId: string;
  subjectLabel: string;
  semesterNumber: number;
  onClose: () => void;
};

export function StudentSyllabusDetailModal({ subjectId, subjectLabel, semesterNumber, onClose }: Props) {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const overlayRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const portalTheme = useOptionalPortalTheme();
  const themeMode = portalTheme?.mode ?? readPortalTheme();
  const [data, setData] = useState<StudentSyllabusDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedUnitId, setExpandedUnitId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const qs = new URLSearchParams({ semesterNumber: String(semesterNumber) });
        const res = await authFetch(
          `/api/portals/student/subjects/${encodeURIComponent(subjectId)}/syllabus?${qs.toString()}`
        );
        if (res.status === 404) {
          if (!cancelled) setData(null);
          return;
        }
        if (!res.ok) throw await readError(res);
        if (!cancelled) setData((await res.json()) as StudentSyllabusDetailResponse);
      } catch (e) {
        if (!cancelled) {
          showToast(e instanceof Error ? e.message : "Could not load syllabus.", "error");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [authFetch, semesterNumber, showToast, subjectId]);

  useEffect(() => {
    const portalBody = document.querySelector(".student-portal-body") as HTMLElement | null;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    const prevPortalOverflow = portalBody?.style.overflow ?? "";

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    if (portalBody) portalBody.style.overflow = "hidden";

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (expandedUnitId) {
        setExpandedUnitId(null);
        bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
      if (portalBody) portalBody.style.overflow = prevPortalOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [expandedUnitId, onClose]);

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

  const toggleUnit = (unit: StudentSyllabusUnit) => {
    if (expandedUnitId === unit.id) {
      setExpandedUnitId(null);
      bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setExpandedUnitId(unit.id);
    window.requestAnimationFrame(() => {
      bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  function collapseUnit() {
    setExpandedUnitId(null);
    bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  const expandedUnit = data?.units.find((unit) => unit.id === expandedUnitId) ?? null;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="portal-root student-portal-root sp-subj-modal-overlay"
      data-portal-theme={themeMode}
      role="presentation"
      onClick={onClose}
    >
      <div
        className="sp-subj-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sp-subj-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sp-subj-modal-head">
          <div className="sp-subj-modal-head__main">
            {expandedUnit ? (
              <button type="button" className="sp-subj-modal-back" aria-label="Back to units" onClick={collapseUnit}>
                <ChevronLeft size={20} aria-hidden />
              </button>
            ) : null}
            <div>
              <h2 id="sp-subj-modal-title">{expandedUnit ? expandedUnit.unitTitle : "Syllabus"}</h2>
              <p className="sp-subj-modal-sub">
                {expandedUnit ? `${subjectLabel} · Unit ${expandedUnit.unitOrder}` : subjectLabel}
              </p>
            </div>
          </div>
          <button type="button" className="sp-subj-modal-close" aria-label="Close syllabus" onClick={onClose}>
            <X size={20} />
          </button>
        </header>

        <div ref={bodyRef} className="sp-subj-modal-body">
          {loading ? (
            <StudentSyllabusModalSkeleton />
          ) : !data ? (
            <p className="sp-subj-modal-empty">Syllabus is not available for this subject.</p>
          ) : expandedUnit ? (
            <section className="sp-subj-modal-units" aria-label="Unit topics">
              {expandedUnit.topics.length > 0 ? (
                <ul className="sp-syl-topic-list">
                  {expandedUnit.topics.map((topic) => (
                    <li
                      key={topic.id}
                      className={topic.isCompleted ? "sp-syl-topic sp-syl-topic--done" : "sp-syl-topic"}
                    >
                      {topic.title}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sp-subj-modal-empty">No topics listed for this unit yet.</p>
              )}
            </section>
          ) : (
            <>
              <StudentPortalSubjectSyllabusCard
                subject={data.subject}
                progressPercent={data.progressPercent}
                completedUnits={data.completedUnits}
                totalUnits={data.totalUnits}
                completedTopics={data.completedTopics}
                totalTopics={data.totalTopics}
                teacherName={data.teacherName}
              />
              <section className="sp-subj-modal-units" aria-label="Units and topics">
                <h3 className="sp-subj-modal-units-title">Units &amp; topics</h3>
                <p className="sp-subj-modal-units-hint">Tap a unit to view completed and pending topics.</p>
                {data.units.map((unit) => (
                  <div key={unit.id} className="sp-subj-modal-unit-wrap">
                    <button
                      type="button"
                      className={`sp-subj-modal-unit-btn${expandedUnitId === unit.id ? " sp-subj-modal-unit-btn--open" : ""}`}
                      onClick={() => toggleUnit(unit)}
                      aria-expanded={expandedUnitId === unit.id}
                    >
                      <span className="sp-subj-modal-unit-order">{unit.unitOrder}.</span>
                      <span className="sp-subj-modal-unit-name">{unit.unitTitle}</span>
                    </button>
                  </div>
                ))}
              </section>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
