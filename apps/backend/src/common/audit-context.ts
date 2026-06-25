import { AsyncLocalStorage } from "async_hooks";

export type AuditContextStore = {
  auditUserId?: string;
};

export const auditContextStorage = new AsyncLocalStorage<AuditContextStore>();

export function getAuditContext(): AuditContextStore | undefined {
  return auditContextStorage.getStore();
}

export function resolveAuditUserId(explicitUserId?: string | null): string | undefined {
  const fromContext = getAuditContext()?.auditUserId;
  if (fromContext) return fromContext;
  return explicitUserId ?? undefined;
}
