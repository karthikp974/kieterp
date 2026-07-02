/**
 * Magic-byte ("file signature") validation for uploads.
 *
 * MIME types and extensions are caller-supplied and trivially spoofed, so for any
 * file we persist or parse we also confirm the raw bytes match the declared type —
 * the same defensive approach the avatar upload uses (JPEG SOI check).
 */

export function isPdfBuffer(buf: Buffer): boolean {
  // "%PDF"
  return buf.length >= 5 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
}

export function isPngBuffer(buf: Buffer): boolean {
  return (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  );
}

export function isJpegBuffer(buf: Buffer): boolean {
  // SOI marker
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

export function isGifBuffer(buf: Buffer): boolean {
  // "GIF87a" or "GIF89a"
  return (
    buf.length >= 6 &&
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38 &&
    (buf[4] === 0x37 || buf[4] === 0x39) &&
    buf[5] === 0x61
  );
}

export function isWebpBuffer(buf: Buffer): boolean {
  // "RIFF" .... "WEBP"
  return (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  );
}

export function isZipBuffer(buf: Buffer): boolean {
  // ZIP local-file / central-dir / spanned headers — DOCX is a ZIP container.
  return (
    buf.length >= 4 &&
    buf[0] === 0x50 &&
    buf[1] === 0x4b &&
    (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07) &&
    (buf[3] === 0x04 || buf[3] === 0x06 || buf[3] === 0x08)
  );
}

/**
 * True when the buffer's signature matches the declared MIME type.
 * Unknown MIME types return false (reject by default).
 */
export function bufferMatchesMime(buf: Buffer, mimeType: string): boolean {
  switch (mimeType) {
    case "application/pdf":
      return isPdfBuffer(buf);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return isZipBuffer(buf);
    case "image/png":
      return isPngBuffer(buf);
    case "image/jpeg":
      return isJpegBuffer(buf);
    case "image/webp":
      return isWebpBuffer(buf);
    case "image/gif":
      return isGifBuffer(buf);
    default:
      return false;
  }
}
