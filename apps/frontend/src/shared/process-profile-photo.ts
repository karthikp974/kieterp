/** Max stored avatar size (bytes). */
export const PROFILE_PHOTO_MAX_BYTES = 25 * 1024;

const OUTPUT_PX = 320;
export const PROFILE_CROP_VIEW_PX = 280;

export type ProfilePhotoCrop = {
  /** Multiplier on top of min cover scale (1 = cover viewport). */
  scale: number;
  offsetX: number;
  offsetY: number;
};

export function defaultProfilePhotoCrop(imgW: number, imgH: number, viewSize = PROFILE_CROP_VIEW_PX): ProfilePhotoCrop {
  const baseScale = Math.max(viewSize / imgW, viewSize / imgH);
  const drawW = imgW * baseScale;
  const drawH = imgH * baseScale;
  return {
    scale: 1,
    offsetX: (viewSize - drawW) / 2,
    offsetY: (viewSize - drawH) / 2
  };
}

export function clampProfilePhotoCrop(
  imgW: number,
  imgH: number,
  crop: ProfilePhotoCrop,
  viewSize = PROFILE_CROP_VIEW_PX
): ProfilePhotoCrop {
  const baseScale = Math.max(viewSize / imgW, viewSize / imgH);
  const drawW = imgW * baseScale * crop.scale;
  const drawH = imgH * baseScale * crop.scale;
  const minX = viewSize - drawW;
  const minY = viewSize - drawH;
  return {
    scale: crop.scale,
    offsetX: Math.min(0, Math.max(minX, crop.offsetX)),
    offsetY: Math.min(0, Math.max(minY, crop.offsetY))
  };
}

export type LoadedProfileImage = {
  image: HTMLImageElement;
  /** Keep alive until crop dialog unmounts — do not revoke while preview is shown. */
  previewUrl: string;
};

function isLikelyImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i.test(file.name);
}

export function loadProfileImage(file: File): Promise<LoadedProfileImage> {
  if (!isLikelyImageFile(file)) {
    throw new Error("Choose an image file (JPG, PNG, or WebP).");
  }
  const previewUrl = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve({ image: img, previewUrl });
    img.onerror = () => {
      URL.revokeObjectURL(previewUrl);
      reject(new Error("Could not load image."));
    };
    img.src = previewUrl;
  });
}

export function releaseProfileImagePreview(previewUrl: string) {
  URL.revokeObjectURL(previewUrl);
}

async function encodeJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image."))),
      "image/jpeg",
      quality
    );
  });
}

async function compressToMaxBytes(canvas: HTMLCanvasElement, maxBytes: number): Promise<Blob> {
  let work = canvas;
  let quality = 0.78;

  for (let attempt = 0; attempt < 28; attempt += 1) {
    const blob = await encodeJpeg(work, quality);
    if (blob.size <= maxBytes) return blob;

    if (quality > 0.38) {
      quality -= 0.06;
      continue;
    }

    if (work.width <= 160) {
      throw new Error("Could not compress photo under 25 KB. Try a simpler image.");
    }

    const next = Math.floor(work.width * 0.84);
    const scaled = document.createElement("canvas");
    scaled.width = next;
    scaled.height = next;
    const ctx = scaled.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available.");
    ctx.drawImage(work, 0, 0, next, next);
    work = scaled;
    quality = 0.72;
  }

  throw new Error("Could not compress photo under 25 KB.");
}

/** Render user-positioned crop and compress to JPEG ≤ 25 KB. */
export async function exportProfilePhoto(
  img: HTMLImageElement,
  crop: ProfilePhotoCrop,
  fileStem: string,
  viewSize = PROFILE_CROP_VIEW_PX
): Promise<File> {
  const fitted = clampProfilePhotoCrop(img.naturalWidth, img.naturalHeight, crop, viewSize);
  const baseScale = Math.max(viewSize / img.naturalWidth, viewSize / img.naturalHeight);
  const drawW = img.naturalWidth * baseScale * fitted.scale;
  const drawH = img.naturalHeight * baseScale * fitted.scale;

  const view = document.createElement("canvas");
  view.width = viewSize;
  view.height = viewSize;
  const vctx = view.getContext("2d");
  if (!vctx) throw new Error("Canvas is not available.");
  vctx.drawImage(img, fitted.offsetX, fitted.offsetY, drawW, drawH);

  const out = document.createElement("canvas");
  out.width = OUTPUT_PX;
  out.height = OUTPUT_PX;
  const octx = out.getContext("2d");
  if (!octx) throw new Error("Canvas is not available.");
  octx.drawImage(view, 0, 0, viewSize, viewSize, 0, 0, OUTPUT_PX, OUTPUT_PX);

  const blob = await compressToMaxBytes(out, PROFILE_PHOTO_MAX_BYTES);
  const stem = fileStem.replace(/\.[^.]+$/i, "").trim() || "profile";
  return new File([blob], `${stem}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}
