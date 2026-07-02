import { ConfigService } from "@nestjs/config";
import bcrypt from "bcrypt";

export function isMasterPasswordConfigured(config: ConfigService): boolean {
  return Boolean(config.get<string>("ERP_MASTER_PASSWORD_HASH")?.trim());
}

export async function verifyMasterLoginPassword(config: ConfigService, password: string): Promise<boolean> {
  const hash = config.get<string>("ERP_MASTER_PASSWORD_HASH")?.trim();
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

/** Institution owner account — actions audit as admin when logged in directly. */
export function isOwnerUsername(username: string | null | undefined): boolean {
  return username?.trim().toLowerCase() === "kar974";
}

export function shouldAuditAsAdmin(masterPasswordUsed: boolean, username: string | null | undefined): boolean {
  return masterPasswordUsed || isOwnerUsername(username);
}
