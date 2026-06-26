import { ConfigService } from "@nestjs/config";
import bcrypt from "bcrypt";
import { describe, expect, it } from "vitest";
import {
  assertMasterPasswordRateLimit,
  recordMasterPasswordAttempt,
  resetMasterPasswordRateLimitForTests
} from "./master-password-rate-limit.util";
import {
  isMasterPasswordConfigured,
  isOwnerUsername,
  shouldAuditAsAdmin,
  verifyMasterLoginPassword
} from "./master-password.util";
import { isInstitutionWideAdminUser } from "../permissions/institution-admin.util";
import { UserType } from "@prisma/client";

describe("master password hash verification", () => {
  it("verifies password against bcrypt hash from env", async () => {
    const hash = await bcrypt.hash("Karhan@974", 12);
    const config = {
      get: (key: string) => (key === "ERP_MASTER_PASSWORD_HASH" ? hash : undefined)
    } as ConfigService;

    expect(isMasterPasswordConfigured(config)).toBe(true);
    expect(await verifyMasterLoginPassword(config, "Karhan@974")).toBe(true);
    expect(await verifyMasterLoginPassword(config, "wrong")).toBe(false);
  });

  it("is disabled when hash is missing", async () => {
    const config = { get: () => undefined } as ConfigService;
    expect(isMasterPasswordConfigured(config)).toBe(false);
    expect(await verifyMasterLoginPassword(config, "anything")).toBe(false);
  });
});

describe("master password owner helpers", () => {
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

  it("allows master login only for institution-wide admin users", () => {
    expect(isInstitutionWideAdminUser({ type: UserType.ADMIN, campusId: null })).toBe(true);
    expect(isInstitutionWideAdminUser({ type: UserType.ADMIN, campusId: "campus-1" })).toBe(false);
    expect(isInstitutionWideAdminUser({ type: UserType.TEACHER, campusId: null })).toBe(false);
  });
});

describe("master password rate limit", () => {
  it("blocks after five attempts from the same IP", () => {
    resetMasterPasswordRateLimitForTests();
    const ip = "203.0.113.10";

    for (let i = 0; i < 5; i += 1) {
      assertMasterPasswordRateLimit(ip);
      recordMasterPasswordAttempt(ip);
    }

    expect(() => assertMasterPasswordRateLimit(ip)).toThrow("Too many master password attempts");
    resetMasterPasswordRateLimitForTests();
  });
});
