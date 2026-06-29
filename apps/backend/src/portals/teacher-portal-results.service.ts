import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  PermissionAction,
  Prisma,
  ResultEntryStatus,
  StructureStatus,
  TeacherRoleKind,
  UserStatus,
  UserType
} from "@prisma/client";
import { AuthUser } from "../auth/auth.types";
import { PermissionsService } from "../permissions/permissions.service";
import { studentProfileToScope } from "../permissions/operational-scope.util";
import { PrismaService } from "../prisma/prisma.service";
import { ResultsService } from "../results/results.service";
import { resolveResultSubjectByCode } from "../results/results-subject.util";
import { QueueService } from "../queues/queues.module";
import { RESULT_PDF_IMPORT_JOB } from "../queues/queue.constants";

import { RESULTS_IMPORT_INTERRUPTED_MESSAGE } from "../results/results-import.constants";
import {
  TeacherResultsBulkUpsertDto,
  TeacherResultsSectionQueryDto,
  TeacherResultsStudentSearchDto
} from "./teacher-results-portal.dto";
import { computeJntukCgpa, computeJntukSemesterSgpa } from "../common/jntuk-gpa.util";

type SectionTree = Prisma.SectionGetPayload<{
  include: {
    class: { include: { batch: { include: { branch: { include: { program: true } } } } } };
  };
}>;

@Injectable()
export class TeacherPortalResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly results: ResultsService,
    private readonly queues: QueueService
  ) {}

  async getSetup(user: AuthUser) {
    const teacher = await this.getActiveTeacher(user.id);
    const roles = [...new Set(teacher.assignments.map((a) => a.role))];
    const hasHtpo = roles.includes(TeacherRoleKind.HTPO);
    const hasCtpo = roles.includes(TeacherRoleKind.CTPO);
    const mode = hasHtpo ? "htpo" : hasCtpo ? "ctpo" : "teacher";

    const sections = await this.loadResultSections(user, teacher);
    const ctpoAssignment = teacher.assignments.find((a) => a.role === TeacherRoleKind.CTPO && a.sectionId);

    return {
      mode,
      roles,
      canUpload: user.assignments.some((a) =>
        this.permissions.can(user, { action: PermissionAction.UPLOAD_RESULTS, scope: a }).allowed
      ),
      sections,
      fixedSectionId: !hasHtpo && hasCtpo ? ctpoAssignment?.sectionId ?? sections[0]?.id ?? null : null
    };
  }

  async listSemesters(user: AuthUser, sectionId: string) {
    const section = await this.loadSection(sectionId);
    this.assertSectionAccess(user, section);
    const durationYears = section.class.batch.branch.durationYears ?? 4;
    const maxSemester = Math.max(1, durationYears * 2);
    return {
      sectionId: section.id,
      currentSemesterNumber: section.class.semesterNumber,
      semesters: Array.from({ length: maxSemester }, (_, index) => ({
        value: index + 1,
        label: `Semester ${index + 1}`
      }))
    };
  }

  async searchStudents(user: AuthUser, sectionId: string, query: TeacherResultsStudentSearchDto) {
    const section = await this.loadSection(sectionId);
    this.assertSectionAccess(user, section);

    const search = query.search?.trim();
    const students = await this.prisma.studentProfile.findMany({
      where: {
        sectionId: section.id,
        isArchived: false,
        currentStatus: UserStatus.ACTIVE,
        ...(search
          ? {
              OR: [
                { rollNumber: { contains: search, mode: "insensitive" } },
                { user: { fullName: { contains: search, mode: "insensitive" } } }
              ]
            }
          : {})
      },
      include: { user: { select: { fullName: true } } },
      orderBy: [{ rollNumber: "asc" }],
      take: 20
    });

    return {
      students: students.map((student) => ({
        id: student.id,
        rollNumber: student.rollNumber,
        fullName: student.user.fullName,
        label: `${student.rollNumber} — ${student.user.fullName}`
      }))
    };
  }

  async getSectionResultsView(user: AuthUser, sectionId: string, query: TeacherResultsSectionQueryDto) {
    const section = await this.loadSection(sectionId);
    this.assertSectionAccess(user, section);
    const semesterNumber = query.semesterNumber ?? section.class.semesterNumber;

    const students = await this.prisma.studentProfile.findMany({
      where: {
        sectionId: section.id,
        isArchived: false,
        currentStatus: UserStatus.ACTIVE,
        ...(query.search?.trim()
          ? {
              OR: [
                { rollNumber: { contains: query.search.trim(), mode: "insensitive" } },
                { user: { fullName: { contains: query.search.trim(), mode: "insensitive" } } }
              ]
            }
          : {})
      },
      include: { user: { select: { fullName: true } } },
      orderBy: { rollNumber: "asc" }
    });

    const studentIds = students.map((s) => s.id);
    const entries = studentIds.length
      ? await this.prisma.resultEntry.findMany({
          where: { studentProfileId: { in: studentIds }, semesterNumber },
          include: { subject: { select: { code: true, name: true } } },
          orderBy: [{ studentProfileId: "asc" }, { subject: { code: "asc" } }]
        })
      : [];

    const allEntries = studentIds.length
      ? await this.prisma.resultEntry.findMany({
          where: { studentProfileId: { in: studentIds } },
          include: { subject: { select: { code: true, name: true } } }
        })
      : [];

    const byStudent = new Map<string, typeof entries>();
    for (const entry of entries) {
      const list = byStudent.get(entry.studentProfileId) ?? [];
      list.push(entry);
      byStudent.set(entry.studentProfileId, list);
    }

    const cumulativeByStudent = new Map<string, typeof allEntries>();
    for (const entry of allEntries) {
      const list = cumulativeByStudent.get(entry.studentProfileId) ?? [];
      list.push(entry);
      cumulativeByStudent.set(entry.studentProfileId, list);
    }

    const rows = students.flatMap((student) => {
      const subjectRows = byStudent.get(student.id) ?? [];
      if (!subjectRows.length) {
        return [
          {
            studentProfileId: student.id,
            rollNumber: student.rollNumber,
            fullName: student.user.fullName,
            subjectCode: null as string | null,
            subjectName: null as string | null,
            internals: null as number | null,
            grade: null as string | null,
            credits: null as number | null,
            sgpa: this.computeSgpa(subjectRows),
            cgpa: this.computeCgpa(cumulativeByStudent.get(student.id) ?? [])
          }
        ];
      }
      return subjectRows.map((entry, index) => ({
        studentProfileId: student.id,
        rollNumber: student.rollNumber,
        fullName: student.user.fullName,
        subjectCode: entry.subject.code,
        subjectName: entry.subject.name,
        internals: entry.internals ? Number(entry.internals) : null,
        grade: entry.grade,
        credits: entry.credits ? Number(entry.credits) : null,
        sgpa: index === subjectRows.length - 1 ? this.computeSgpa(subjectRows) : null,
        cgpa: index === subjectRows.length - 1 ? this.computeCgpa(cumulativeByStudent.get(student.id) ?? []) : null
      }));
    });

    return {
      section: { id: section.id, label: this.sectionLabel(section), semesterNumber },
      rows
    };
  }

  async getStudentSemesterForm(user: AuthUser, studentProfileId: string, semesterNumber: number) {
    const student = await this.getStudent(studentProfileId);
    this.assertSectionAccess(user, student.section);

    const entries = await this.prisma.resultEntry.findMany({
      where: { studentProfileId, semesterNumber },
      include: { subject: { select: { code: true, name: true } } },
      orderBy: { subject: { code: "asc" } }
    });

    return {
      student: {
        id: student.id,
        rollNumber: student.rollNumber,
        fullName: student.user.fullName,
        sectionId: student.sectionId,
        sectionLabel: this.sectionLabel(student.section)
      },
      semesterNumber,
      rows: entries.map((entry) => ({
        subjectCode: entry.subject.code,
        subjectName: entry.subject.name,
        internals: entry.internals ? Number(entry.internals) : null,
        grade: entry.grade,
        credits: entry.credits ? Number(entry.credits) : null,
        status: entry.status
      }))
    };
  }

  async getStudentAllSemesters(user: AuthUser, studentProfileId: string) {
    const student = await this.getStudent(studentProfileId);
    this.assertSectionAccess(user, student.section);

    const entries = await this.prisma.resultEntry.findMany({
      where: { studentProfileId },
      include: { subject: { select: { code: true, name: true } } },
      orderBy: [{ semesterNumber: "asc" }, { subject: { code: "asc" } }]
    });

    const bySemester = new Map<number, typeof entries>();
    for (const entry of entries) {
      const list = bySemester.get(entry.semesterNumber) ?? [];
      list.push(entry);
      bySemester.set(entry.semesterNumber, list);
    }

    return {
      student: {
        id: student.id,
        rollNumber: student.rollNumber,
        fullName: student.user.fullName,
        sectionLabel: this.sectionLabel(student.section)
      },
      semesters: [...bySemester.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([semesterNumber, rows]) => ({
          semesterNumber,
          semesterLabel: `Semester ${semesterNumber}`,
          sgpa: this.computeSgpa(rows),
          subjects: rows.map((entry) => ({
            subjectCode: entry.subject.code,
            subjectName: entry.subject.name,
            internals: entry.internals ? Number(entry.internals) : null,
            grade: entry.grade,
            credits: entry.credits ? Number(entry.credits) : null,
            status: entry.status
          }))
        })),
      cgpa: this.computeCgpa(entries)
    };
  }

  async bulkUpsert(user: AuthUser, dto: TeacherResultsBulkUpsertDto) {
    const student = await this.getStudent(dto.studentProfileId);
    if (student.sectionId !== dto.sectionId) {
      throw new BadRequestException("Student does not belong to the selected section.");
    }
    this.assertSectionUploadAccess(user, student.section);

    const examType = dto.examType?.trim().toUpperCase() || "SEMESTER";
    let saved = 0;

    for (const row of dto.rows) {
      const branchId = student.section.class.batch.branchId;
      const subject = await resolveResultSubjectByCode(this.prisma, {
        branchId,
        subjectCode: row.subjectCode
      });
      if (subject.semesterNumber !== dto.semesterNumber) {
        throw new BadRequestException(
          `Subject code "${row.subjectCode}" belongs to semester ${subject.semesterNumber}, not semester ${dto.semesterNumber}.`
        );
      }

      const status = row.status ?? this.statusFromGrade(row.grade);
      await this.results.upsert(
        user,
        {
          studentProfileId: dto.studentProfileId,
          subjectId: subject.id,
          semesterNumber: subject.semesterNumber,
          examType,
          internals: row.internals,
          grade: row.grade,
          credits: row.credits,
          status
        },
        { isPublished: true, importJobId: null }
      );
      saved += 1;
    }

    return { ok: true, savedCount: saved };
  }

  async getImportJob(user: AuthUser, jobId: string) {
    const job = await this.prisma.backgroundJobRecord.findFirst({
      where: { id: jobId, jobName: RESULT_PDF_IMPORT_JOB }
    });
    if (!job) throw new NotFoundException("Import job not found.");
    if (user.type === UserType.TEACHER) {
      const ownerId = (job.payload as { user?: { id?: string } } | null)?.user?.id;
      if (ownerId !== user.id) throw new ForbiddenException("You cannot view this import job.");
    }

    const sectionReports =
      job.status === "completed" || job.status === "failed"
        ? await this.buildImportSectionReports(user, job.result)
        : [];

    return {
      job: {
        id: job.id,
        status: job.status,
        error: job.error,
        createdAt: job.createdAt,
        result: job.result
      },
      sectionReports,
      missingRollNumbersFromPdf:
        ((job.result as { missingRollNumbersFromPdf?: string[] } | null)?.missingRollNumbersFromPdf ?? []).map((roll) =>
          roll.toUpperCase()
        ),
      autoPublished: Boolean((job.result as { autoPublished?: boolean } | null)?.autoPublished),
      publishedCount: Number((job.result as { publishedCount?: number } | null)?.publishedCount ?? 0)
    };
  }

  async cancelImportJob(user: AuthUser, jobId: string) {
    const job = await this.prisma.backgroundJobRecord.findFirst({
      where: { id: jobId, jobName: RESULT_PDF_IMPORT_JOB }
    });
    if (!job) throw new NotFoundException("Import job not found.");
    if (user.type === UserType.TEACHER) {
      const ownerId = (job.payload as { user?: { id?: string } } | null)?.user?.id;
      if (ownerId !== user.id) throw new ForbiddenException("You cannot cancel this import job.");
    }
    if (job.status === "completed" || job.status === "failed") {
      return { ok: true, cancelled: false, status: job.status };
    }

    await this.queues.cancelBackgroundJob(jobId, RESULTS_IMPORT_INTERRUPTED_MESSAGE);
    return { ok: true, cancelled: true, status: "failed" as const };
  }

  private async buildImportSectionReports(user: AuthUser, result: unknown) {
    const sections = await this.loadResultSections(user, await this.getActiveTeacher(user.id));
    const importedRolls = new Set<string>(
      ((result as { importedRollNumbers?: string[] } | null)?.importedRollNumbers ?? []).map((r) => r.toUpperCase())
    );

    const sectionReports = [];
    for (const sectionOption of sections) {
      const students = await this.prisma.studentProfile.findMany({
        where: { sectionId: sectionOption.id, isArchived: false, currentStatus: UserStatus.ACTIVE },
        select: { rollNumber: true, user: { select: { fullName: true } } },
        orderBy: { rollNumber: "asc" }
      });
      const missingFromPdf = students
        .filter((s) => !importedRolls.has(s.rollNumber.toUpperCase()))
        .map((s) => ({ rollNumber: s.rollNumber, fullName: s.user.fullName }));
      sectionReports.push({
        sectionId: sectionOption.id,
        sectionLabel: sectionOption.label,
        studentCount: students.length,
        importedCount: students.length - missingFromPdf.length,
        missingFromPdf
      });
    }
    return sectionReports;
  }

  private statusFromGrade(grade?: string | null): ResultEntryStatus {
    const g = grade?.trim().toUpperCase();
    if (!g) return ResultEntryStatus.WITHHELD;
    if (["AB", "ABSENT"].includes(g)) return ResultEntryStatus.ABSENT;
    if (["W", "WH", "WITHHELD"].includes(g)) return ResultEntryStatus.WITHHELD;
    if (["F", "FAIL"].includes(g)) return ResultEntryStatus.FAIL;
    return ResultEntryStatus.PASS;
  }

  private computeSgpa(entries: { grade: string | null; credits: Prisma.Decimal | null; status: ResultEntryStatus }[]) {
    return computeJntukSemesterSgpa(
      entries.map((entry) => ({
        grade: entry.grade,
        credits: entry.credits,
        status: entry.status
      }))
    );
  }

  private computeCgpa(entries: { grade: string | null; credits: Prisma.Decimal | null; status: ResultEntryStatus; semesterNumber?: number }[]) {
    return computeJntukCgpa(
      entries.map((entry) => ({
        grade: entry.grade,
        credits: entry.credits,
        status: entry.status,
        semesterNumber: entry.semesterNumber
      }))
    );
  }

  private async loadResultSections(user: AuthUser, teacher: Awaited<ReturnType<typeof this.getActiveTeacher>>) {
    const hasHtpo = teacher.assignments.some((a) => a.role === TeacherRoleKind.HTPO);
    if (hasHtpo) {
      const sections = await this.prisma.section.findMany({
        where: this.sectionsWhereForHtpo(teacher.assignments.filter((a) => a.role === TeacherRoleKind.HTPO)),
        include: { class: { include: { batch: { include: { branch: { include: { program: true } } } } } } },
        orderBy: [{ class: { semesterNumber: "desc" } }, { name: "asc" }]
      });
      return sections
        .filter((section) =>
          this.permissions.can(user, { action: PermissionAction.VIEW_RESULTS, scope: this.sectionToScope(section) }).allowed
        )
        .map((section) => ({ id: section.id, label: this.sectionLabel(section) }));
    }

    const ctpoSections = teacher.assignments.filter((a) => a.role === TeacherRoleKind.CTPO && a.sectionId);
    const sectionIds = [...new Set(ctpoSections.map((a) => a.sectionId!))];
    if (!sectionIds.length) return [];

    const sections = await this.prisma.section.findMany({
      where: { id: { in: sectionIds }, isArchived: false, status: StructureStatus.ACTIVE },
      include: { class: { include: { batch: { include: { branch: { include: { program: true } } } } } } },
      orderBy: [{ class: { semesterNumber: "desc" } }, { name: "asc" }]
    });
    return sections.map((section) => ({ id: section.id, label: this.sectionLabel(section) }));
  }

  private sectionsWhereForHtpo(
    assignments: { campusId: string | null; programId: string | null; branchId: string | null }[]
  ): Prisma.SectionWhereInput {
    const OR = assignments.map((a) => ({
      status: StructureStatus.ACTIVE,
      isArchived: false,
      ...(a.campusId ? { campusId: a.campusId } : {}),
      class: {
        status: StructureStatus.ACTIVE,
        isArchived: false,
        batch: {
          status: StructureStatus.ACTIVE,
          branch: {
            status: StructureStatus.ACTIVE,
            isArchived: false,
            ...(a.branchId ? { id: a.branchId } : {}),
            ...(a.programId ? { programId: a.programId } : {})
          }
        }
      }
    }));
    return OR.length ? { OR } : { id: "__none__" };
  }

  private async getActiveTeacher(userId: string) {
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { userId },
      include: {
        assignments: {
          where: { isActive: true },
          select: { role: true, campusId: true, programId: true, branchId: true, sectionId: true, subjectId: true }
        }
      }
    });
    if (!teacher || teacher.isArchived) throw new NotFoundException("Teacher profile not found.");
    return teacher;
  }

  private async loadSection(sectionId: string): Promise<SectionTree> {
    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, isArchived: false, status: StructureStatus.ACTIVE },
      include: { class: { include: { batch: { include: { branch: { include: { program: true } } } } } } }
    });
    if (!section) throw new NotFoundException("Section not found.");
    return section;
  }

  private async getStudent(studentProfileId: string) {
    const student = await this.prisma.studentProfile.findFirst({
      where: { id: studentProfileId, isArchived: false, currentStatus: UserStatus.ACTIVE },
      include: {
        user: { select: { fullName: true } },
        section: { include: { class: { include: { batch: { include: { branch: { include: { program: true } } } } } } } }
      }
    });
    if (!student) throw new NotFoundException("Student not found.");
    return student;
  }

  private assertSectionAccess(user: AuthUser, section: SectionTree) {
    const allowed = this.permissions.can(user, {
      action: PermissionAction.VIEW_RESULTS,
      scope: this.sectionToScope(section)
    }).allowed;
    if (!allowed) throw new ForbiddenException("You cannot access results for this section.");
  }

  private assertSectionUploadAccess(user: AuthUser, section: SectionTree) {
    const allowed = this.permissions.can(user, {
      action: PermissionAction.UPLOAD_RESULTS,
      scope: this.sectionToScope(section)
    }).allowed;
    if (!allowed) throw new ForbiddenException("You cannot upload results for this section.");
  }

  private sectionLabel(section: SectionTree) {
    const program = section.class.batch.branch.program;
    const programShort = program.name.replace(/^B\.?Tech\s*/i, "B.Tech ");
    return `${programShort} · Sem ${section.class.semesterNumber} · ${section.name}`;
  }

  private sectionToScope(section: SectionTree) {
    return {
      campusId: section.campusId,
      programId: section.class.batch.branch.programId,
      branchId: section.class.batch.branchId,
      batchId: section.class.batchId,
      classId: section.classId,
      sectionId: section.id
    };
  }
}
