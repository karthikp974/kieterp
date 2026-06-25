import { describe, expect, it } from "vitest";
import { computeSectionSyllabusProgress } from "../src/syllabus/syllabus-progress.util";

describe("syllabus-progress.util", () => {
  it("returns zero progress when no syllabus exists", async () => {
    const prisma = {
      syllabus: {
        findFirst: async () => null
      }
    } as never;

    const result = await computeSectionSyllabusProgress(prisma, "section-a", "subject-a");
    expect(result).toEqual({
      progressPercent: 0,
      completedUnits: 0,
      totalUnits: 0,
      completedTopics: 0,
      totalTopics: 0,
      hasSyllabus: false
    });
  });
});
