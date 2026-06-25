import { describe, expect, it } from "vitest";
import { isDevelopmentNodeEnv } from "./node-env.util";

describe("isDevelopmentNodeEnv", () => {
  it("returns true only for development", () => {
    expect(isDevelopmentNodeEnv("development")).toBe(true);
  });

  it("returns false for production, staging, test, and undefined", () => {
    expect(isDevelopmentNodeEnv("production")).toBe(false);
    expect(isDevelopmentNodeEnv("staging")).toBe(false);
    expect(isDevelopmentNodeEnv("test")).toBe(false);
    expect(isDevelopmentNodeEnv(undefined)).toBe(false);
  });
});
