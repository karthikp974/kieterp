import { PrismaService } from "../prisma/prisma.service";

export type SyllabusProgressSnapshot = {
  progressPercent: number;
  completedUnits: number;
  totalUnits: number;
  completedTopics: number;
  totalTopics: number;
  hasSyllabus: boolean;
};

export async function computeSectionSyllabusProgress(
  prisma: PrismaService,
  sectionId: string,
  subjectId: string
): Promise<SyllabusProgressSnapshot> {
  const syllabus = await prisma.syllabus.findFirst({
    where: { subjectId, isArchived: false },
    include: {
      units: {
        where: { isArchived: false },
        include: { topics: { where: { isArchived: false } } }
      }
    }
  });

  if (!syllabus) {
    return { progressPercent: 0, completedUnits: 0, totalUnits: 0, completedTopics: 0, totalTopics: 0, hasSyllabus: false };
  }

  const topicIds = syllabus.units.flatMap((unit) => unit.topics.map((t) => t.id));
  const completions =
    topicIds.length === 0
      ? []
      : await prisma.sectionSyllabusTopicCompletion.findMany({
          where: { sectionId, topicId: { in: topicIds }, isCompleted: true },
          select: { topicId: true }
        });
  const completedTopicSet = new Set(completions.map((c) => c.topicId));
  const totalTopics = topicIds.length;
  const completedTopics = topicIds.filter((id) => completedTopicSet.has(id)).length;
  const progressPercent = totalTopics ? Math.round((completedTopics / totalTopics) * 100) : 0;

  let completedUnits = 0;
  const totalUnits = syllabus.units.length;
  for (const unit of syllabus.units) {
    const topics = unit.topics;
    if (topics.length > 0 && topics.every((t) => completedTopicSet.has(t.id))) {
      completedUnits += 1;
    }
  }

  return { progressPercent, completedUnits, totalUnits, completedTopics, totalTopics, hasSyllabus: true };
}
