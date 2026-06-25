import { Camera, Image, Trash2 } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../../auth/auth-context";
import { ProfilePhotoCropDialog } from "../../shared/ProfilePhotoCropDialog";
import { ProfilePhotoNativeInputs } from "../../shared/ProfilePhotoNativeInputs";
import { CurrentUserAvatar } from "../../shared/UserAvatar";
import { useToast } from "../../shared/toast-context";

type Props = {
  avatarUrl: string | null;
  fullName: string;
  canEdit: boolean;
  onPhotoUpdated?: () => void;
};

export function StudentProfilePhotoSection({ avatarUrl, fullName, canEdit, onPhotoUpdated }: Props) {
  const { authFetch, refreshProfile } = useAuth();
  const { showToast } = useToast();
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function uploadPrepared(file: File) {
    const body = new FormData();
    body.append("file", file);
    const res = await authFetch("/api/auth/me/avatar", { method: "POST", body });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
      const message = Array.isArray(payload?.message) ? payload.message.join(", ") : payload?.message;
      throw new Error(message || "Upload failed");
    }
    await refreshProfile();
    onPhotoUpdated?.();
    showToast("Profile photo updated.", "success");
    setCropFile(null);
  }

  async function removePhoto() {
    setBusy(true);
    try {
      const res = await authFetch("/api/auth/me/avatar", { method: "DELETE" });
      if (!res.ok) throw new Error("Could not remove photo");
      await refreshProfile();
      onPhotoUpdated?.();
      showToast("Profile photo removed.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not remove photo", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sp-profile-photo">
      <CurrentUserAvatar size="xl" className="sp-profile-avatar" />
      {canEdit ? (
        <ProfilePhotoNativeInputs onFile={setCropFile} disabled={busy}>
          {({ galleryId, cameraId }) => (
            <div className="sp-profile-photo-actions">
              <label htmlFor={galleryId} className="sp-profile-photo-btn">
                <Image size={14} aria-hidden />
                Photo library
              </label>
              <label htmlFor={cameraId} className="sp-profile-photo-btn">
                <Camera size={14} aria-hidden />
                Take photo
              </label>
              {avatarUrl ? (
                <button
                  type="button"
                  className="sp-profile-photo-btn sp-profile-photo-btn--danger"
                  disabled={busy}
                  onClick={() => void removePhoto()}
                >
                  <Trash2 size={14} aria-hidden />
                  Remove
                </button>
              ) : null}
            </div>
          )}
        </ProfilePhotoNativeInputs>
      ) : null}
      <p className="sp-profile-photo-name">{fullName}</p>
      {cropFile ? (
        <ProfilePhotoCropDialog
          file={cropFile}
          onClose={() => setCropFile(null)}
          onSave={async (file) => {
            setBusy(true);
            try {
              await uploadPrepared(file);
            } catch (e) {
              showToast(e instanceof Error ? e.message : "Upload failed", "error");
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}
