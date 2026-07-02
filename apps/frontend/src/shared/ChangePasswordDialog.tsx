import { FormEvent, useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "../auth/auth-context";
import { useToast } from "./toast-context";
import { WfBtn } from "./WfBtn";

export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      showToast("New passwords do not match", "error");
      return;
    }
    if (!newPassword.trim()) {
      showToast("Password is required", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch("/api/auth/change-password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
        const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
        throw new Error(message || "Could not change password");
      }
      showToast("Password updated");
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not change password", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="erp-confirm-overlay" role="presentation" onClick={onClose}>
      <form className="erp-export-dialog profile-password-dialog" onSubmit={(e) => void submit(e)} onClick={(e) => e.stopPropagation()}>
        <div className="erp-export-dialog-head">
          <h2>Change password</h2>
          <button type="button" className="db-icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <label className="db-field">
          <span>Current password</span>
          <input className="db-input" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required autoComplete="current-password" />
        </label>
        <label className="db-field">
          <span>New password</span>
          <input className="db-input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={1} autoComplete="new-password" />
        </label>
        <label className="db-field">
          <span>Confirm new password</span>
          <input className="db-input" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={1} autoComplete="new-password" />
        </label>
        <div className="db-wf-actions">
          <WfBtn type="button" onClick={onClose}>
            Cancel
          </WfBtn>
          <WfBtn type="submit" variant="primary" disabled={saving}>
            {saving ? "Saving…" : "Update password"}
          </WfBtn>
        </div>
      </form>
    </div>
  );
}
