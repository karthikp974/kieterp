import { ConfigService } from "@nestjs/config";

/** Secrets that must never be used — including documented dev placeholders. */
export const KNOWN_WEAK_JWT_ACCESS_SECRETS = new Set([
  "",
  "dev-only-change-me",
  "change-this-access-secret",
  "change-me",
  "secret",
  "jwt-secret",
  "your-secret-key"
]);

export function assertJwtAccessSecretConfigured(secret: string | undefined): asserts secret is string {
  const trimmed = secret?.trim();
  if (!trimmed) {
    throw new Error("JWT_ACCESS_SECRET is required. Set a strong secret in .env.");
  }
  if (KNOWN_WEAK_JWT_ACCESS_SECRETS.has(trimmed) || KNOWN_WEAK_JWT_ACCESS_SECRETS.has(trimmed.toLowerCase())) {
    throw new Error(
      "JWT_ACCESS_SECRET is set to a known weak or placeholder value. Generate a strong random secret for .env."
    );
  }
  if (trimmed.length < 32) {
    throw new Error("JWT_ACCESS_SECRET must be at least 32 characters.");
  }
}

export function getJwtAccessSecret(config: ConfigService): string {
  const secret = config.get<string>("JWT_ACCESS_SECRET");
  assertJwtAccessSecretConfigured(secret);
  return secret.trim();
}
