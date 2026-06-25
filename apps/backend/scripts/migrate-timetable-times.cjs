const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient, TimetableSlotStatus } = require("@prisma/client");

const TIME_24H_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const LEGACY_HM = /^(\d{1,2}):(\d{1,2})$/;
const LEGACY_H = /^(\d{1,2})$/;

function normalizeTimeTo24h(value) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  if (TIME_24H_PATTERN.test(trimmed)) {
    const [hour, minute] = trimmed.split(":");
    return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  }

  const hm = LEGACY_HM.exec(trimmed);
  if (hm) {
    const hour = Number(hm[1]);
    const minute = Number(hm[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
    return null;
  }

  const hourOnly = LEGACY_H.exec(trimmed);
  if (hourOnly) {
    const hour = Number(hourOnly[1]);
    if (hour >= 0 && hour <= 23) {
      return `${String(hour).padStart(2, "0")}:00`;
    }
    return null;
  }

  const parts = trimmed.split(":");
  if (parts.length === 3) {
    return normalizeTimeTo24h(`${parts[0]}:${parts[1]}`);
  }

  return null;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required.");
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const slots = await prisma.timetableSlot.findMany({
    where: { status: TimetableSlotStatus.ACTIVE },
    orderBy: [{ sectionId: "asc" }, { dayOfWeek: "asc" }, { startTime: "asc" }]
  });

  let updated = 0;
  let archived = 0;
  let skipped = 0;

  for (const slot of slots) {
    const startTime = normalizeTimeTo24h(slot.startTime);
    const endTime = normalizeTimeTo24h(slot.endTime);

    if (!startTime || !endTime) {
      skipped += 1;
      console.warn(`Skip slot ${slot.id}: invalid times ${slot.startTime}-${slot.endTime}`);
      continue;
    }

    if (startTime === slot.startTime && endTime === slot.endTime) {
      continue;
    }

    const duplicate = await prisma.timetableSlot.findUnique({
      where: {
        sectionId_dayOfWeek_startTime_endTime: {
          sectionId: slot.sectionId,
          dayOfWeek: slot.dayOfWeek,
          startTime,
          endTime
        }
      },
      select: { id: true }
    });

    if (duplicate && duplicate.id !== slot.id) {
      await prisma.timetableSlot.update({
        where: { id: slot.id },
        data: { status: TimetableSlotStatus.ARCHIVED }
      });
      archived += 1;
      console.info(`Archived duplicate slot ${slot.id} (${slot.startTime}-${slot.endTime} -> ${startTime}-${endTime})`);
      continue;
    }

    await prisma.timetableSlot.update({
      where: { id: slot.id },
      data: { startTime, endTime }
    });
    updated += 1;
    console.info(`Updated slot ${slot.id}: ${slot.startTime}-${slot.endTime} -> ${startTime}-${endTime}`);
  }

  console.info(`Done. Updated ${updated}, archived ${archived}, skipped ${skipped}.`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
