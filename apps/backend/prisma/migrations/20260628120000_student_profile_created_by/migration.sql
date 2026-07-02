-- AlterTable
ALTER TABLE "StudentProfile" ADD COLUMN "createdById" TEXT;

-- CreateIndex
CREATE INDEX "StudentProfile_createdById_idx" ON "StudentProfile"("createdById");

-- AddForeignKey
ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
