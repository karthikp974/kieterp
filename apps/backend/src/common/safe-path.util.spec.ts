import { describe, expect, it } from "vitest";
import { join } from "path";
import { isPathWithinRoot } from "./safe-path.util";

const ROOT = join(process.cwd(), "uploads", "announcements");

describe("safe-path.util", () => {
  it("accepts paths inside the root", () => {
    expect(isPathWithinRoot(ROOT, join(ROOT, "abc", "file.pdf"))).toBe(true);
    expect(isPathWithinRoot(ROOT, ROOT)).toBe(true);
  });

  it("rejects traversal outside the root", () => {
    expect(isPathWithinRoot(ROOT, join(ROOT, "..", "..", "secret.env"))).toBe(false);
    expect(isPathWithinRoot(ROOT, join(ROOT, "..", "avatars", "1.jpg"))).toBe(false);
  });

  it("rejects a sibling directory sharing a name prefix", () => {
    expect(isPathWithinRoot(ROOT, `${ROOT}-evil/file.pdf`)).toBe(false);
  });
});
