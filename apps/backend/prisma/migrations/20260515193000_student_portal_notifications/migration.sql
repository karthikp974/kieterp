-- Student Portal notification inbox (unread badge + future list).

CREATE TABLE "StudentPortalNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentPortalNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StudentPortalNotification_userId_readAt_idx" ON "StudentPortalNotification"("userId", "readAt");

ALTER TABLE "StudentPortalNotification" ADD CONSTRAINT "StudentPortalNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
