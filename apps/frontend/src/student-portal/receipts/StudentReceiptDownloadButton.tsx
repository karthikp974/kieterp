import { Download } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../../auth/auth-context";
import { useToast } from "../../shared/toast-context";
import { parseReceiptFilename, RECEIPT_PDF_PATH } from "./receipt-download";

type Props = {
  paymentId: string;
  receiptNo: string;
  className?: string;
  label?: string;
};

export function StudentReceiptDownloadButton({
  paymentId,
  receiptNo,
  className = "sp-rcpt-download-btn",
  label = "Download PDF"
}: Props) {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  async function download() {
    setLoading(true);
    try {
      const res = await authFetch(RECEIPT_PDF_PATH(paymentId));
      if (!res.ok) {
        showToast("Could not generate receipt PDF.", "error");
        return;
      }
      const blob = await res.blob();
      const fn = parseReceiptFilename(res.headers.get("Content-Disposition"), `receipt-${receiptNo}.pdf`);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fn;
      a.click();
      URL.revokeObjectURL(a.href);
      showToast("Receipt download started.", "success");
    } catch {
      showToast("Could not generate receipt PDF.", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button type="button" className={className} disabled={loading} onClick={() => void download()}>
      <Download size={14} aria-hidden />
      {loading ? "Generating…" : label}
    </button>
  );
}
