-- CreateEnum
CREATE TYPE "StudentPortalNotificationKind" AS ENUM ('SYSTEM', 'FEEDBACK');

-- AlterTable
ALTER TABLE "StudentPortalNotification" ADD COLUMN "kind" "StudentPortalNotificationKind" NOT NULL DEFAULT 'SYSTEM';
ALTER TABLE "StudentPortalNotification" ADD COLUMN "feedbackFormId" TEXT;

-- CreateIndex
CREATE INDEX "StudentPortalNotification_feedbackFormId_idx" ON "StudentPortalNotification"("feedbackFormId");

-- AddForeignKey
ALTER TABLE "StudentPortalNotification" ADD CONSTRAINT "StudentPortalNotification_feedbackFormId_fkey" FOREIGN KEY ("feedbackFormId") REFERENCES "FeedbackForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
