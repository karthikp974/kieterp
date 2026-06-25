import { Plus, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { TpCard } from "./teacher-portal-ui";
import type { HtpoResultsSetup } from "./htpo-results-types";

export function HtpoResultsManageCard({ setup }: { setup: HtpoResultsSetup | null }) {
  const navigate = useNavigate();
  if (!setup?.canUpload) return null;

  return (
    <TpCard className="htpo-results-manage-card">
      <header className="htpo-results-card-head">
        <h2 className="htpo-results-card-title">Manage results</h2>
      </header>
      <div className="htpo-results-manage-actions">
        <button type="button" className="htpo-results-action-btn" onClick={() => void navigate("/teacher/results/upload")}>
          <Upload size={16} aria-hidden />
          Upload PDF
        </button>
        <button type="button" className="htpo-results-action-btn" onClick={() => void navigate("/teacher/results/add")}>
          <Plus size={16} aria-hidden />
          Add result
        </button>
      </div>
    </TpCard>
  );
}
