import { useId, type ReactNode } from "react";

/** Images only — no generic file picker (avoids extra iOS “Choose file” in our UI). */
const PROFILE_GALLERY_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,image/*";

export type ProfilePhotoInputIds = {
  galleryId: string;
  cameraId: string;
};

type Props = {
  onFile: (file: File) => void;
  disabled?: boolean;
  children: (ids: ProfilePhotoInputIds) => ReactNode;
};

/**
 * Direct native pickers for profile photos (no ERP modal).
 * Gallery input → photo library; camera input with capture → camera app.
 * On iOS/iPadOS, WebKit may still show system options we cannot hide — but only one sheet, not two.
 */
export function ProfilePhotoNativeInputs({ onFile, disabled, children }: Props) {
  const uid = useId();
  const galleryId = `profile-gallery${uid}`;
  const cameraId = `profile-camera${uid}`;

  function handleChange(file: File | undefined, input: HTMLInputElement) {
    if (!file) return;
    onFile(file);
    input.value = "";
  }

  return (
    <>
      <div className="profile-photo-native-inputs" aria-hidden>
        <input
          id={galleryId}
          type="file"
          accept={PROFILE_GALLERY_ACCEPT}
          disabled={disabled}
          className="profile-photo-native-input"
          onChange={(e) => handleChange(e.target.files?.[0], e.target)}
        />
        <input
          id={cameraId}
          type="file"
          accept="image/*"
          capture="user"
          disabled={disabled}
          className="profile-photo-native-input"
          onChange={(e) => handleChange(e.target.files?.[0], e.target)}
        />
      </div>
      {children({ galleryId, cameraId })}
    </>
  );
}
