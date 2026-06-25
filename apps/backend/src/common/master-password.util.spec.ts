import { describe, expect, it } from "vitest";
import { isOwnerUsername, shouldAuditAsAdmin } from "./master-password.util";

describe("master-password owner helpers", () => {
  it("detects kar974 owner username", () => {
    expect(isOwnerUsername("kar974")).toBe(true);
    expect(isOwnerUsername("KAR974")).toBe(true);
    expect(isOwnerUsername("admin")).toBe(false);
  });

  it("flags audit-as-admin for master login or owner account", () => {
    expect(shouldAuditAsAdmin(true, "HTPO001")).toBe(true);
    expect(shouldAuditAsAdmin(false, "kar974")).toBe(true);
    expect(shouldAuditAsAdmin(false, "admin")).toBe(false);
  });
});
