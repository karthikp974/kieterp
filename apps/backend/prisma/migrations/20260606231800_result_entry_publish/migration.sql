-- Result draft/publish workflow: PDF imports stay hidden until HTPO/CTPO pushes.
ALTER TABLE "ResultEntry" ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ResultEntry" ADD COLUMN "importJobId" TEXT;

CREATE INDEX "ResultEntry_importJobId_idx" ON "ResultEntry"("importJobId");
CREATE INDEX "ResultEntry_isPublished_studentProfileId_idx" ON "ResultEntry"("isPublished", "studentProfileId");
