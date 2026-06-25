-- Spectator / ops dashboard: session metadata + activity timeline.
ALTER TABLE "AuthSession" ADD COLUMN "loginIdentifier" TEXT;
ALTER TABLE "AuthSession" ADD COLUMN "masterPasswordUsed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AuthSession" ADD COLUMN "lastSeenAt" TIMESTAMPTZ(3);

CREATE TYPE "SpectatorActivityKind" AS ENUM ('LOGIN', 'PAGE_VIEW', 'HEARTBEAT');

CREATE TABLE "SpectatorActivityEvent" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" "SpectatorActivityKind" NOT NULL,
  "portal" TEXT,
  "path" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SpectatorActivityEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SpectatorActivityEvent_sessionId_createdAt_idx" ON "SpectatorActivityEvent"("sessionId", "createdAt");
CREATE INDEX "SpectatorActivityEvent_userId_createdAt_idx" ON "SpectatorActivityEvent"("userId", "createdAt");
CREATE INDEX "SpectatorActivityEvent_createdAt_idx" ON "SpectatorActivityEvent"("createdAt");
CREATE INDEX "AuthSession_lastSeenAt_idx" ON "AuthSession"("lastSeenAt");

ALTER TABLE "SpectatorActivityEvent" ADD CONSTRAINT "SpectatorActivityEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AuthSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SpectatorActivityEvent" ADD CONSTRAINT "SpectatorActivityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
