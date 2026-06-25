import { createContext, ReactNode, useCallback, useContext, useMemo } from "react";
import { NavigateOptions, useNavigate } from "react-router-dom";

export function resolveFeedbackHref(href: string, basePath: string) {
  return href.replace(/^\/feedback(?=\/|$)/, basePath);
}

type FeedbackPortalContextValue = {
  basePath: string;
  variant: "admin" | "teacher";
};

const FeedbackPortalContext = createContext<FeedbackPortalContextValue>({
  basePath: "/feedback",
  variant: "admin"
});

export function FeedbackPortalProvider({
  basePath,
  variant,
  children
}: {
  basePath: string;
  variant: "admin" | "teacher";
  children: ReactNode;
}) {
  const value = useMemo(() => ({ basePath, variant }), [basePath, variant]);
  return <FeedbackPortalContext.Provider value={value}>{children}</FeedbackPortalContext.Provider>;
}

export function useFeedbackPortal() {
  return useContext(FeedbackPortalContext);
}

export function useFeedbackPaths() {
  const { basePath } = useFeedbackPortal();
  return {
    hub: basePath,
    create: `${basePath}/create-feedback-form`,
    active: `${basePath}/active-forms`,
    modify: `${basePath}/modify-feedback-form`,
    modifyForm: (id: string) => `${basePath}/modify-feedback-form/${id}`,
    delete: `${basePath}/delete-feedback-form`,
    reports: `${basePath}/feedback-reports`,
    report: (id: string) => `${basePath}/feedback-reports/${id}`,
    paragraphs: (formId: string, questionId: string) => `${basePath}/feedback-reports/${formId}/questions/${questionId}/paragraphs`,
    archived: `${basePath}/archived-feedbacks`
  };
}

export function useFeedbackNavigate() {
  const navigate = useNavigate();
  const { basePath } = useFeedbackPortal();
  return useCallback(
    (to: number | string, options?: NavigateOptions) => {
      if (typeof to === "number") return navigate(to);
      return navigate(resolveFeedbackHref(to, basePath), options);
    },
    [navigate, basePath]
  );
}
