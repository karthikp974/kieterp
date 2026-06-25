-- CreateEnum
CREATE TYPE "TimetableSlotType" AS ENUM ('LECTURE', 'LAB');

-- AlterTable
ALTER TABLE "TimetableSlot" ADD COLUMN "slotType" "TimetableSlotType" NOT NULL DEFAULT 'LECTURE';
