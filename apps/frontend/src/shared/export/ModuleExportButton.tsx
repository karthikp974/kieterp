import { useCallback, useState } from "react";
import { useAuth } from "../../auth/auth-context";
import { downloadAuthenticatedExportViaFetch } from "../download-authenticated-export";
import { useToast } from "../toast-context";
import { buildExportFilename, type ExportFormatId } from "./export-formats";
import { ExportFormatDialog, ExportTriggerButton } from "./ExportFormatDialog";

export function ModuleExportButton({
  apiPath,
  pageName,
  cardName,
  queryParams = {},
  label = "Export",
  title = "Export",
  description
}: {
  apiPath: string;
  pageName: string;
  cardName: string;
  queryParams?: Record<string, string | undefined>;
  label?: string;
  title?: string;
  description?: string;
}) {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);

  const onExport = useCallback(
    async (format: ExportFormatId) => {
      try {
        await downloadAuthenticatedExportViaFetch(
          authFetch,
          apiPath,
          { ...queryParams, format },
          buildExportFilename(pageName, cardName, format)
        );
        showToast("Export downloaded.", "success");
        setOpen(false);
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Export failed.", "error");
      }
    },
    [apiPath, authFetch, cardName, pageName, queryParams, showToast]
  );

  return (
    <>
      <ExportTriggerButton onClick={() => setOpen(true)}>{label}</ExportTriggerButton>
      <ExportFormatDialog
        open={open}
        title={title}
        cardName={cardName}
        description={description}
        onClose={() => setOpen(false)}
        onExport={onExport}
      />
    </>
  );
}
