import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { TeacherRoleKind, UserType } from "@prisma/client";
import { AuthUser } from "../auth/auth.types";
import { formatSemesterLabel } from "../common/semester-label.util";
import { computeSectionSyllabusProgress } from "../syllabus/syllabus-progress.util";
import { PrismaService } from "../prisma/prisma.service";
import { loadStudentPortalProfile } from "./student-portal-load-student";
import { resolveStudentSectionSubjects } from "./student-portal-subjects.util";
import { StudentPortalSyllabusService } from "./student-portal-syllabus.service";

@Injectable()
export class StudentPortalSubjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly syllabusPortal: StudentPortalSyllabusService
  ) {}

  async listSemesters(user: AuthUser) {
    if (user.type !== UserType.STUDENT) {
      throw new ForbiddenException("Only student accounts can access subjects.");
    }
    const student = await loadStudentPortalProfile(this.prisma, user.id);
    const cls = student.section.class;
    const durationYears = cls.batch.branch.durationYears ?? 4;
    const maxSemester = Math.max(1, durationYears * 2);
    const currentSemesterNumber = cls.semesterNumber;
    const cappedMax = Math.min(maxSemester, currentSemesterNumber);

    const semesters = Array.from({ length: cappedMax }, (_, index) => {
      const value = cappedMax - index;
      return {
        value,
        label: formatSemesterLabel(value),
        isCurrent: value === currentSemesterNumber
      };
    });

    return {
      sectionId: student.sectionId,
      currentSemesterNumber,
      semesters
    };
  }

  async listMySubjects(user: AuthUser, semesterNumber?: number) {
    if (user.type !== UserType.STUDENT) {
      throw new ForbiddenException("Only student accounts can access subjects.");
    }
    const student = await loadStudentPortalProfile(this.prisma, user.id);
    const section = student.section;
    const sectionId = student.sectionId;
    const cls = section.class;
    const currentSemesterNumber = cls.semesterNumber;
    const selectedSemesterNumber = semesterNumber ?? currentSemesterNumber;

    if (selectedSemesterNumber > currentSemesterNumber) {
      throw new BadRequestException("Cannot view subjects for a future semester.");
    }

    const durationYears = cls.batch.branch.durationYears ?? 4;
    const maxSemester = Math.max(1, durationYears * 2);
    if (selectedSemesterNumber < 1 || selectedSemesterNumber > maxSemester) {
      throw new BadRequestException("Invalid semester number.");
    }

    const subjects = await resolveStudentSectionSubjects(
      this.prisma,
      sectionId,
      cls.batchId,
      cls.batch.branchId,
      selectedSemesterNumber
    );

    const subjectIds = subjects.map((s) => s.id);
    const roleRows = await this.prisma.teacherRoleAssignment.findMany({
      where: { sectionId, subjectId: { in: subjectIds }, isActive: true },
      include: { teacherProfile: { include: { user: { select: { fullName: true } } } } },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }]
    });

    const teacherBySubject = new Map<string, string>();
    for (const subjectId of subjectIds) {
      const stpo = roleRows.find((r) => r.subjectId === subjectId && r.role === TeacherRoleKind.STPO);
      const any = roleRows.find((r) => r.subjectId === subjectId);
      const pick = stpo ?? any;
      if (pick) teacherBySubject.set(subjectId, pick.teacherProfile.user.fullName);
    }

    const items = await Promise.all(
      subjects.map(async (subject) => {
        const progress = await computeSectionSyllabusProgress(this.prisma, sectionId, subject.id);
        return {
          id: subject.id,
          code: subject.code,
          name: subject.name,
          semesterNumber: subject.semesterNumber,
          teacherName: teacherBySubject.get(subject.id) ?? null,
          progressPercent: progress.progressPercent,
          completedUnits: progress.completedUnits,
          totalUnits: progress.totalUnits,
          completedTopics: progress.completedTopics,
          totalTopics: progress.totalTopics,
          hasSyllabus: progress.hasSyllabus
        };
      })
    );

    return {
      section: {
        id: section.id,
        name: section.name,
        code: section.code,
        semesterNumber: currentSemesterNumber,
        selectedSemesterNumber,
        classLabel: cls.label,
        campusCode: cls.batch.branch.program.campus.code
      },
      subjects: items
    };
  }

  getSubjectSyllabus(user: AuthUser, subjectId: string, semesterNumber?: number) {
    return this.syllabusPortal.getSubjectSyllabus(user, subjectId, semesterNumber);
  }
}
