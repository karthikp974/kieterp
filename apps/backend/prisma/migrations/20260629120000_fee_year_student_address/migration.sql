-- AlterTable: fee structures can target a whole academic year
ALTER TABLE "FeeStructure" ADD COLUMN "yearNumber" INTEGER;

-- AlterTable: structured student address columns
ALTER TABLE "StudentProfile" ADD COLUMN "village" TEXT;
ALTER TABLE "StudentProfile" ADD COLUMN "mandal" TEXT;
ALTER TABLE "StudentProfile" ADD COLUMN "district" TEXT;
ALTER TABLE "StudentProfile" ADD COLUMN "state" TEXT;
ALTER TABLE "StudentProfile" ADD COLUMN "pincode" TEXT;
ALTER TABLE "StudentProfile" ADD COLUMN "homeAddress" TEXT;

-- Backfill: move existing single-line address into Home Address
UPDATE "StudentProfile" SET "homeAddress" = "address" WHERE "address" IS NOT NULL AND "homeAddress" IS NULL;
