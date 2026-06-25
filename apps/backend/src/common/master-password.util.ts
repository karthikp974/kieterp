import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "crypto";

export function isMasterLoginPassword(config: ConfigService, password: string): boolean {
  const master = config.get<string>("ERP_MASTER_PASSWORD")?.trim();
  if (!master) return false;
  const supplied = Buffer.from(password);
  const expected = Buffer.from(master);
  if (supplied.length !== expected.length) return false;
  return timingSafeEqual(supplied, expected);
}

/** Institution owner account — actions audit as admin when logged in directly. */
export function isOwnerUsername(username: string | null | undefined): boolean {
  return username?.trim().toLowerCase() === "kar974";
}

export function shouldAuditAsAdmin(masterPasswordUsed: boolean, username: string | null | undefined): boolean {
  return masterPasswordUsed || isOwnerUsername(username);
}
