import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { WfBtn } from "./WfBtn";
import { useToast } from "./toast-context";
import {
  PROFILE_CROP_VIEW_PX,
  clampProfilePhotoCrop,
  defaultProfilePhotoCrop,
  exportProfilePhoto,
  loadProfileImage,
  releaseProfileImagePreview,
  type ProfilePhotoCrop
} from "./process-profile-photo";

type ProfilePhotoCropDialogProps = {
  file: File;
  onClose: () => void;
  onSave: (file: File) => void | Promise<void>;
};

export function ProfilePhotoCropDialog({ file, onClose, onSave }: ProfilePhotoCropDialogProps) {
  const { showToast } = useToast();
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<ProfilePhotoCrop | null>(null);
  const [saving, setSaving] = useState(false);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    let active = true;
    void loadProfileImage(file)
      .then((loaded) => {
        if (!active) {
          releaseProfileImagePreview(loaded.previewUrl);
          return;
        }
        setImg(loaded.image);
        setPreviewUrl(loaded.previewUrl);
        setCrop(defaultProfilePhotoCrop(loaded.image.naturalWidth, loaded.image.naturalHeight));
      })
      .catch((err) => {
        if (!active) return;
        showToast(err instanceof Error ? err.message : "Could not load image.", "error");
        onClose();
      });
    return () => {
      active = false;
    };
  }, [file, onClose]);

  useEffect(() => {
    return () => {
      if (previewUrl) releaseProfileImagePreview(previewUrl);
    };
  }, [previewUrl]);

  const applyCrop = useCallback(
    (next: ProfilePhotoCrop) => {
      if (!img) return;
      setCrop(clampProfilePhotoCrop(img.naturalWidth, img.naturalHeight, next));
    },
    [img]
  );

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!crop) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, ox: crop.offsetX, oy: crop.offsetY };
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || !crop) return;
    applyCrop({
      ...crop,
      offsetX: drag.ox + (event.clientX - drag.x),
      offsetY: drag.oy + (event.clientY - drag.y)
    });
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  async function handleSave() {
    if (!img || !crop) return;
    setSaving(true);
    try {
      const prepared = await exportProfilePhoto(img, crop, file.name);
      await onSave(prepared);
    } finally {
      setSaving(false);
    }
  }

  const preview =
    img && crop
      ? (() => {
          const baseScale = Math.max(PROFILE_CROP_VIEW_PX / img.naturalWidth, PROFILE_CROP_VIEW_PX / img.naturalHeight);
          const drawW = img.naturalWidth * baseScale * crop.scale;
          const drawH = img.naturalHeight * baseScale * crop.scale;
          return {
            width: drawW,
            height: drawH,
            transform: `translate(${crop.offsetX}px, ${crop.offsetY}px)`
          };
        })()
      : null;

  return createPortal(
    <div className="erp-confirm-overlay" role="presentation" onClick={onClose}>
      <section
        className="erp-export-dialog profile-photo-crop-dialog"
        role="dialog"
        aria-labelledby="profile-crop-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="erp-export-dialog-head">
          <h2 id="profile-crop-title">Position your photo</h2>
          <button type="button" className="db-icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="erp-export-dialog-lead">Drag to move and use the slider to zoom. Saved as a square up to 25 KB.</p>

        <div
          className="profile-photo-crop-stage"
          style={{ width: PROFILE_CROP_VIEW_PX, height: PROFILE_CROP_VIEW_PX }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {previewUrl && preview ? (
            <img
              src={previewUrl}
              alt=""
              className="profile-photo-crop-image"
              style={{ width: preview.width, height: preview.height, transform: preview.transform }}
              draggable={false}
            />
          ) : (
            <p className="profile-photo-crop-loading">Loading…</p>
          )}
        </div>

        <label className="profile-photo-crop-zoom">
          <span>Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.02}
            value={crop?.scale ?? 1}
            disabled={!crop || !img}
            onChange={(e) => {
              if (!crop || !img) return;
              const nextScale = Number(e.target.value);
              const baseScale = Math.max(PROFILE_CROP_VIEW_PX / img.naturalWidth, PROFILE_CROP_VIEW_PX / img.naturalHeight);
              const oldW = img.naturalWidth * baseScale * crop.scale;
              const oldH = img.naturalHeight * baseScale * crop.scale;
              const newW = img.naturalWidth * baseScale * nextScale;
              const newH = img.naturalHeight * baseScale * nextScale;
              const cx = PROFILE_CROP_VIEW_PX / 2;
              const cy = PROFILE_CROP_VIEW_PX / 2;
              const focalX = (cx - crop.offsetX) / oldW;
              const focalY = (cy - crop.offsetY) / oldH;
              applyCrop({
                scale: nextScale,
                offsetX: cx - focalX * newW,
                offsetY: cy - focalY * newH
              });
            }}
          />
        </label>

        <div className="db-wf-actions">
          <WfBtn type="button" onClick={onClose}>
            Cancel
          </WfBtn>
          <WfBtn type="button" variant="primary" disabled={!img || !crop || saving} onClick={() => void handleSave()}>
            {saving ? "Saving…" : "Use photo"}
          </WfBtn>
        </div>
      </section>
    </div>,
    document.body
  );
}
