-- CreateEnum
CREATE TYPE "SyllabusResourceKind" AS ENUM ('PDF', 'LINK', 'NOTE');

-- CreateTable
CREATE TABLE "SyllabusTopic" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "topicTitle" TEXT NOT NULL,
    "topicOrder" INTEGER NOT NULL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyllabusTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SectionSyllabusTopicCompletion" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SectionSyllabusTopicCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyllabusUnitResource" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "kind" "SyllabusResourceKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "filePath" TEXT,
    "url" TEXT,
    "noteBody" TEXT,
    "uploadedById" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyllabusUnitResource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyllabusTopic_unitId_idx" ON "SyllabusTopic"("unitId");
CREATE INDEX "SyllabusTopic_isArchived_idx" ON "SyllabusTopic"("isArchived");
CREATE UNIQUE INDEX "SyllabusTopic_unitId_topicOrder_key" ON "SyllabusTopic"("unitId", "topicOrder");

CREATE INDEX "SectionSyllabusTopicCompletion_sectionId_idx" ON "SectionSyllabusTopicCompletion"("sectionId");
CREATE INDEX "SectionSyllabusTopicCompletion_topicId_idx" ON "SectionSyllabusTopicCompletion"("topicId");
CREATE UNIQUE INDEX "SectionSyllabusTopicCompletion_sectionId_topicId_key" ON "SectionSyllabusTopicCompletion"("sectionId", "topicId");

CREATE INDEX "SyllabusUnitResource_unitId_sectionId_isArchived_idx" ON "SyllabusUnitResource"("unitId", "sectionId", "isArchived");
CREATE INDEX "SyllabusUnitResource_sectionId_idx" ON "SyllabusUnitResource"("sectionId");

-- AddForeignKey
ALTER TABLE "SyllabusTopic" ADD CONSTRAINT "SyllabusTopic_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "SyllabusUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SectionSyllabusTopicCompletion" ADD CONSTRAINT "SectionSyllabusTopicCompletion_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SectionSyllabusTopicCompletion" ADD CONSTRAINT "SectionSyllabusTopicCompletion_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "SyllabusTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SectionSyllabusTopicCompletion" ADD CONSTRAINT "SectionSyllabusTopicCompletion_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SyllabusUnitResource" ADD CONSTRAINT "SyllabusUnitResource_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "SyllabusUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SyllabusUnitResource" ADD CONSTRAINT "SyllabusUnitResource_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SyllabusUnitResource" ADD CONSTRAINT "SyllabusUnitResource_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
