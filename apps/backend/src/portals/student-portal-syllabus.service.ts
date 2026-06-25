import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { TeacherRoleKind, UserType } from "@prisma/client";
import { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { assertStudentSubjectAccess } from "./student-portal-subjects.util";

@Injectable()
export class StudentPortalSyllabusService {
  constructor(private readonly prisma: PrismaService) {}

  async getSubjectSyllabus(user: AuthUser, subjectId: string, semesterNumber?: number) {
    if (user.type !== UserType.STUDENT) {
      throw new ForbiddenException("Only student accounts can access syllabus.");
    }

    const { sectionId } = await assertStudentSubjectAccess(this.prisma, user, subjectId, semesterNumber);

    const syllabus = await this.prisma.syllabus.findFirst({
      where: { subjectId, isArchived: false },
      include: {
        subject: true,
        units: {
          where: { isArchived: false },
          orderBy: { unitOrder: "asc" },
          include: {
            topics: { where: { isArchived: false }, orderBy: { topicOrder: "asc" } }
          }
        }
      }
    });
    if (!syllabus) {
      throw new NotFoundException("No syllabus published for this subject.");
    }

    const topicIds = syllabus.units.flatMap((unit) => unit.topics.map((t) => t.id));
    const completions =
      topicIds.length === 0
        ? []
        : await this.prisma.sectionSyllabusTopicCompletion.findMany({
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
      if (topics.length === 0) continue;
      if (topics.every((t) => completedTopicSet.has(t.id))) {
        completedUnits += 1;
      }
    }

    const stpo = await this.prisma.teacherRoleAssignment.findFirst({
      where: { sectionId, subjectId, role: TeacherRoleKind.STPO, isActive: true },
      include: { teacherProfile: { include: { user: true } } },
      orderBy: { createdAt: "asc" }
    });
    const fallback =
      stpo ??
      (await this.prisma.teacherRoleAssignment.findFirst({
        where: {
          sectionId,
          subjectId,
          role: { in: [TeacherRoleKind.CTPO, TeacherRoleKind.HTPO] },
          isActive: true
        },
        include: { teacherProfile: { include: { user: true } } },
        orderBy: { createdAt: "asc" }
      }));
    const teacherName = fallback?.teacherProfile.user.fullName ?? null;

    return {
      sectionId,
      subject: { id: syllabus.subject.id, name: syllabus.subject.name, code: syllabus.subject.code },
      progressPercent,
      completedUnits,
      totalUnits,
      completedTopics,
      totalTopics,
      teacherName,
      units: syllabus.units.map((unit) => ({
        id: unit.id,
        unitTitle: unit.unitTitle,
        unitOrder: unit.unitOrder,
        topics: unit.topics.map((topic) => ({
          id: topic.id,
          title: topic.topicTitle,
          order: topic.topicOrder,
          isCompleted: completedTopicSet.has(topic.id)
        }))
      }))
    };
  }
}
