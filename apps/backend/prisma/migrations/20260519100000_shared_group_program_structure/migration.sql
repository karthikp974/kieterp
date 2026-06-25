-- CreateEnum
CREATE TYPE "ProgramStructureScope" AS ENUM ('CAMPUS_OWNED', 'GROUP_SHARED');

-- AlterTable
ALTER TABLE "Program" ADD COLUMN "structureScope" "ProgramStructureScope" NOT NULL DEFAULT 'CAMPUS_OWNED';

-- Mark KIET shared-group departments (single canonical tree for KIET+KIEK).
UPDATE "Program" p
SET "structureScope" = 'GROUP_SHARED'
FROM "Campus" c
WHERE p."campusId" = c.id
  AND c.code = 'KIET'
  AND p.code IN ('DIPLOMA', 'BTECH', 'MTECH');
