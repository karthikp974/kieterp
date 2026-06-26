import { describe, expect, it } from "vitest";
import { bufferMatchesMime, isPdfBuffer, isPngBuffer, isZipBuffer } from "./file-signature.util";

const PDF = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const GIF = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // "GIF89a"
const WEBP = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // docx container

describe("file-signature.util", () => {
  it("accepts buffers whose signature matches the declared mime", () => {
    expect(bufferMatchesMime(PDF, "application/pdf")).toBe(true);
    expect(bufferMatchesMime(PNG, "image/png")).toBe(true);
    expect(bufferMatchesMime(JPEG, "image/jpeg")).toBe(true);
    expect(bufferMatchesMime(GIF, "image/gif")).toBe(true);
    expect(bufferMatchesMime(WEBP, "image/webp")).toBe(true);
    expect(bufferMatchesMime(ZIP, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(true);
  });

  it("rejects mismatched or spoofed content", () => {
    const fakePdf = Buffer.from("not a pdf at all", "utf8");
    expect(isPdfBuffer(fakePdf)).toBe(false);
    expect(bufferMatchesMime(fakePdf, "application/pdf")).toBe(false);
    // an executable/script renamed to .png
    expect(bufferMatchesMime(Buffer.from([0x4d, 0x5a, 0x90, 0x00]), "image/png")).toBe(false);
  });

  it("rejects unknown mime types by default", () => {
    expect(bufferMatchesMime(PDF, "application/x-msdownload")).toBe(false);
  });

  it("handles short buffers without throwing", () => {
    expect(isPdfBuffer(Buffer.from([0x25]))).toBe(false);
    expect(isPngBuffer(Buffer.alloc(0))).toBe(false);
    expect(isZipBuffer(Buffer.from([0x50]))).toBe(false);
  });
});
