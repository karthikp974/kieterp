import { describe, expect, it } from "vitest";
import { assertJwtAccessSecretConfigured } from "./jwt-secret.util";

const STRONG_SECRET = "a".repeat(32);

describe("assertJwtAccessSecretConfigured", () => {
  it("accepts a strong secret", () => {
    expect(() => assertJwtAccessSecretConfigured(STRONG_SECRET)).not.toThrow();
  });

  it("rejects missing or blank secrets", () => {
    expect(() => assertJwtAccessSecretConfigured(undefined)).toThrow(/JWT_ACCESS_SECRET is required/);
    expect(() => assertJwtAccessSecretConfigured("   ")).toThrow(/JWT_ACCESS_SECRET is required/);
  });

  it("rejects known dev placeholders regardless of NODE_ENV", () => {
    expect(() => assertJwtAccessSecretConfigured("dev-only-change-me")).toThrow(/weak or placeholder/);
    expect(() => assertJwtAccessSecretConfigured("change-this-access-secret")).toThrow(/weak or placeholder/);
  });

  it("rejects secrets shorter than 32 characters", () => {
    expect(() => assertJwtAccessSecretConfigured("short-but-not-placeholder")).toThrow(/at least 32 characters/);
  });
});
