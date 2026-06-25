import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/auth-context";
import { readApiError } from "../../shared/read-api-error";
import { useToast } from "../../shared/toast-context";
import { HtpoResultsManageCard } from "../HtpoResultsManageCard";
import { HtpoResultsViewCard } from "../HtpoResultsViewCard";
import type { HtpoResultsSetup } from "../htpo-results-types";
import { RequireTeacherModule } from "../RequireTeacherModule";
import { TeacherPortalModuleShell, TeacherPortalPanelWrap } from "../TeacherPortalModuleShell";

export function TeacherPortalResultsPage() {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const [setup, setSetup] = useState<HtpoResultsSetup | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSetup = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/portals/teacher/results/setup");
      if (!res.ok) throw new Error(await readApiError(res, "Could not load results setup."));
      setSetup((await res.json()) as HtpoResultsSetup);
    } catch (error) {
      setSetup(null);
      showToast(error instanceof Error ? error.message : "Could not load results.", "error");
    } finally {
      setLoading(false);
    }
  }, [authFetch, showToast]);

  useEffect(() => {
    void loadSetup();
  }, [loadSetup]);

  return (
    <RequireTeacherModule moduleKey="results">
      <TeacherPortalModuleShell>
        <TeacherPortalPanelWrap>
          <div className="htpo-results-page-stack">
            {loading ? <p className="htpo-results-empty">Loading results…</p> : null}
            {!loading ? <HtpoResultsManageCard setup={setup} /> : null}
            {!loading ? <HtpoResultsViewCard setup={setup} /> : null}
          </div>
        </TeacherPortalPanelWrap>
      </TeacherPortalModuleShell>
    </RequireTeacherModule>
  );
}
