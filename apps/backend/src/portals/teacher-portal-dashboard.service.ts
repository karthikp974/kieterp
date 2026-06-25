import { Injectable, NotFoundException } from "@nestjs/common";
import {
  AttendanceEntryStatus,
  FeedbackFormStatus,
  Prisma,
  StructureStatus,
  StudentFeePaymentStatus,
  TeacherRoleKind,
  UserStatus
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { istDateParts, istDayOfWeek, istStartOfDay } from "../common/ist-time.util";

type HtpoAssignment = {
  campusId: string | null;
  programId: string | null;
  branchId: string | null;
  program?: { name: string } | null;
};

@Injectable()
export class TeacherPortalDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async buildHtpoOverview(htpoAssignments: HtpoAssignment[]) {
    if (!htpoAssignments.length) return null;

    const sectionWhere = this.sectionsWhereForHtpo(htpoAssignments);
    const sections = await this.prisma.section.findMany({
      where: sectionWhere,
      select: { id: true }
    });

    const departmentNames = [
      ...new Set(htpoAssignments.map((a) => a.program?.name).filter((name): name is string => Boolean(name)))
    ];
    const departmentLabel = departmentNames.length ? departmentNames.join(" · ") : "Your department";

    return this.buildSupervisionOverview(
      sections.map((section) => section.id),
      departmentLabel,
      htpoAssignments
    );
  }

  /** KPI + supervision rows for explicit section ids (HTPO branch scope or CTPO assigned section). */
  async buildSupervisionOverview(
    sectionIds: string[],
    departmentLabel: string,
    feedbackScopeAssignments: HtpoAssignment[] = []
  ) {
    if (!sectionIds.length) {
      return {
        departmentLabel,
        sectionCount: 0,
        totalStudents: 0,
        avgAttendancePercent: null as number | null,
        feePendingCount: 0,
        openFeedbackCount: 0,
        supervisionSections: [] as {
          id: string;
          label: string;
          studentCount: number;
          classTeacherName: string;
          latestAttendance: { percentage: number; present: number; total: number } | null;
        }[]
      };
    }

    const sections = await this.prisma.section.findMany({
      where: { id: { in: sectionIds }, status: StructureStatus.ACTIVE, isArchived: false },
      include: {
        class: {
          include: {
            branch: { include: { program: true } },
            batch: true
          }
        },
        _count: {
          select: {
            students: { where: { isArchived: false, currentStatus: UserStatus.ACTIVE } }
          }
        }
      },
      orderBy: [{ class: { semesterNumber: "desc" } }, { name: "asc" }]
    });

    const sectionIdsResolved = sections.map((s) => s.id);
    const studentWhere: Prisma.StudentProfileWhereInput | null = sectionIdsResolved.length
      ? {
          isArchived: false,
          currentStatus: UserStatus.ACTIVE,
          sectionId: { in: sectionIdsResolved }
        }
      : null;

    const weekStart = this.startOfWeek(new Date());
    const now = new Date();

    const [ctpoAssignments, weekEntries, feePendingStudents, openFeedback, recentSessions] = await Promise.all([
      sectionIdsResolved.length
        ? this.prisma.teacherRoleAssignment.findMany({
            where: { isActive: true, role: TeacherRoleKind.CTPO, sectionId: { in: sectionIdsResolved } },
            include: { user: { select: { fullName: true } } }
          })
        : [],
      sectionIdsResolved.length
        ? this.prisma.attendanceEntry.findMany({
            where: {
              session: { sectionId: { in: sectionIdsResolved }, attendanceDate: { gte: weekStart } }
            },
            select: { status: true }
          })
        : [],
      studentWhere
        ? this.prisma.studentProfile.findMany({
            where: {
              ...studentWhere,
              feeAssignments: {
                some: { paymentStatus: { in: [StudentFeePaymentStatus.UNPAID, StudentFeePaymentStatus.PARTIAL] } }
              }
            },
            select: { id: true }
          })
        : [],
      feedbackScopeAssignments.length
        ? this.prisma.feedbackForm.count({
            where: {
              status: FeedbackFormStatus.ACTIVE,
              startsAt: { lte: now },
              endsAt: { gte: now },
              OR: feedbackScopeAssignments.map((a) => this.feedbackScopeOr(a))
            }
          })
        : Promise.resolve(0),
      sectionIdsResolved.length
        ? this.prisma.attendanceSession.findMany({
            where: { sectionId: { in: sectionIdsResolved } },
            include: { entries: { select: { status: true } } },
            orderBy: [{ attendanceDate: "desc" }, { createdAt: "desc" }]
          })
        : []
    ]);

    const ctpoBySection = new Map<string, string>();
    for (const row of ctpoAssignments) {
      if (row.sectionId && !ctpoBySection.has(row.sectionId)) {
        ctpoBySection.set(row.sectionId, row.user.fullName);
      }
    }

    const latestBySection = new Map<string, { present: number; total: number; percentage: number }>();
    for (const session of recentSessions) {
      if (latestBySection.has(session.sectionId)) continue;
      const total = session.entries.length;
      const present = session.entries.filter((e) => e.status === AttendanceEntryStatus.PRESENT).length;
      latestBySection.set(session.sectionId, {
        present,
        total,
        percentage: total ? Math.round((present / total) * 100) : 0
      });
    }

    const weekPresent = weekEntries.filter((e) => e.status === AttendanceEntryStatus.PRESENT).length;
    const weekTotal = weekEntries.length;
    const avgAttendancePercent = weekTotal ? Math.round((weekPresent / weekTotal) * 100) : null;

    const supervisionSections = sections.map((section) => {
      const latest = latestBySection.get(section.id);
      return {
        id: section.id,
        label: this.sectionLabel(section),
        studentCount: section._count.students,
        classTeacherName: ctpoBySection.get(section.id) ?? "Unassigned",
        latestAttendance: latest
          ? {
              percentage: latest.percentage,
              present: latest.present,
              total: latest.total
            }
          : null
      };
    });

    const totalStudents = supervisionSections.reduce((sum, row) => sum + row.studentCount, 0);

    return {
      departmentLabel,
      sectionCount: supervisionSections.length,
      totalStudents,
      avgAttendancePercent,
      feePendingCount: feePendingStudents.length,
      openFeedbackCount: openFeedback,
      supervisionSections
    };
  }

  async getTeacherStructure(userId: string) {
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { userId },
      include: {
        assignments: {
          where: { isActive: true },
          select: {
            campusId: true,
            programId: true,
            branchId: true,
            batchId: true,
            classId: true,
            sectionId: true
          }
        }
      }
    });
    if (!teacher || teacher.isArchived) throw new NotFoundException("Teacher profile not found.");

    const sectionWhere = this.sectionsWhereForTeacherAssignments(teacher.assignments);
    const sections = await this.prisma.section.findMany({
      where: sectionWhere,
      include: {
        campus: { include: { group: true } },
        class: {
          include: {
            batch: {
              include: {
                branch: {
                  include: {
                    program: { include: { campus: { include: { group: true } } } }
                  }
                }
              }
            }
          }
        }
      },
      orderBy: [{ class: { semesterNumber: "desc" } }, { name: "asc" }]
    });

    const campusMap = new Map<string, { id: string; code: string; name: string; groupId: string; group: { isolationPolicy: string } }>();
    const programMap = new Map<
      string,
      {
        id: string;
        campusId: string;
        code: string;
        name: string;
        durationValue: number;
        semesters: number;
        structureScope: string;
        campus: { id: string; code: string; groupId: string; group: { isolationPolicy: string } };
      }
    >();
    const branchMap = new Map<string, { id: string; programId: string; code: string; name: string }>();
    const batchMap = new Map<string, { id: string; branchId: string; startYear: number; endYear: number }>();
    const classMap = new Map<string, { id: string; batchId: string; yearNumber: number; semesterNumber: number; label: string }>();
    const sectionMap = new Map<string, { id: string; classId: string; name: string }>();

    for (const section of sections) {
      const campus = section.campus;
      if (campus) {
        campusMap.set(campus.id, {
          id: campus.id,
          code: campus.code,
          name: campus.name,
          groupId: campus.groupId,
          group: { isolationPolicy: campus.group.isolationPolicy }
        });
      }

      const academicClass = section.class;
      const batch = academicClass.batch;
      const branch = batch.branch;
      const program = branch.program;

      programMap.set(program.id, {
        id: program.id,
        campusId: program.campusId,
        code: program.code,
        name: program.name,
        durationValue: program.durationValue,
        semesters: program.semesters,
        structureScope: program.structureScope,
        campus: {
          id: program.campus.id,
          code: program.campus.code,
          groupId: program.campus.groupId,
          group: { isolationPolicy: program.campus.group.isolationPolicy }
        }
      });
      branchMap.set(branch.id, { id: branch.id, programId: branch.programId, code: branch.code, name: branch.name });
      batchMap.set(batch.id, { id: batch.id, branchId: batch.branchId, startYear: batch.startYear, endYear: batch.endYear });
      classMap.set(academicClass.id, {
        id: academicClass.id,
        batchId: academicClass.batchId,
        yearNumber: academicClass.yearNumber,
        semesterNumber: academicClass.semesterNumber,
        label: academicClass.label
      });
      sectionMap.set(section.id, { id: section.id, classId: section.classId, name: section.name });
    }

    const branchIds = [...branchMap.keys()];
    const subjects =
      branchIds.length === 0
        ? []
        : await this.prisma.subject.findMany({
            where: { branchId: { in: branchIds }, isArchived: false, status: StructureStatus.ACTIVE },
            orderBy: [{ semesterNumber: "asc" }, { code: "asc" }]
          });

    const sortByCode = <T extends { code: string }>(items: T[]) => [...items].sort((a, b) => a.code.localeCompare(b.code));
    const sortByName = <T extends { name: string }>(items: T[]) => [...items].sort((a, b) => a.name.localeCompare(b.name));

    return {
      campuses: sortByCode([...campusMap.values()]),
      programs: sortByCode([...programMap.values()]),
      branches: sortByCode([...branchMap.values()]),
      batches: [...batchMap.values()].sort((a, b) => b.startYear - a.startYear || b.endYear - a.endYear),
      classes: [...classMap.values()].sort((a, b) => b.semesterNumber - a.semesterNumber || a.label.localeCompare(b.label)),
      sections: sortByName([...sectionMap.values()]),
      subjects: sortByCode(subjects.map((s) => ({ id: s.id, branchId: s.branchId, code: s.code, name: s.name, semesterNumber: s.semesterNumber })))
    };
  }


  private sectionsWhereForTeacherAssignments(
    assignments: {
      campusId: string | null;
      programId: string | null;
      branchId: string | null;
      batchId: string | null;
      classId: string | null;
      sectionId: string | null;
    }[]
  ): Prisma.SectionWhereInput {
    const activeClass = { status: StructureStatus.ACTIVE, isArchived: false };
    const OR = assignments.map((assignment) => {
      const base: Prisma.SectionWhereInput = { status: StructureStatus.ACTIVE, isArchived: false };
      if (assignment.sectionId) return { ...base, id: assignment.sectionId };
      if (assignment.classId) return { ...base, classId: assignment.classId };
      if (assignment.batchId) return { ...base, class: { ...activeClass, batchId: assignment.batchId } };
      if (assignment.branchId) return { ...base, class: { ...activeClass, branchId: assignment.branchId } };
      if (assignment.programId) {
        return { ...base, class: { ...activeClass, branch: { programId: assignment.programId, ...activeClass } } };
      }
      if (assignment.campusId) return { ...base, campusId: assignment.campusId };
      return { id: "__none__" };
    });
    return OR.length ? { OR } : { id: "__none__" };
  }

  private sectionsWhereForHtpo(assignments: HtpoAssignment[]): Prisma.SectionWhereInput {
    const OR = assignments.map((a) => {
      const branchFilter: Prisma.BranchWhereInput = {
        status: StructureStatus.ACTIVE,
        isArchived: false,
        ...(a.branchId ? { id: a.branchId } : {}),
        ...(a.programId ? { programId: a.programId } : {})
      };
      const classFilter: Prisma.AcademicClassWhereInput = {
        status: StructureStatus.ACTIVE,
        isArchived: false,
        branch: branchFilter
      };
      return {
        status: StructureStatus.ACTIVE,
        isArchived: false,
        ...(a.campusId ? { campusId: a.campusId } : {}),
        class: classFilter
      };
    });
    return OR.length ? { OR } : { id: "__none__" };
  }

  private feedbackScopeOr(assignment: HtpoAssignment): Prisma.FeedbackFormWhereInput {
    if (assignment.branchId) return { branchId: assignment.branchId };
    if (assignment.programId) return { programId: assignment.programId };
    if (assignment.campusId) return { campusId: assignment.campusId };
    return { id: "__none__" };
  }

  private sectionLabel(
    section: Prisma.SectionGetPayload<{
      include: { class: { include: { branch: true } } };
    }>
  ) {
    const branch = section.class.branch.name;
    const sem = section.class.semesterNumber;
    return `${branch} · Sem ${sem} · ${section.name}`;
  }

  private startOfWeek(date: Date) {
    // IST week start (Monday 00:00 IST) for the week containing `date`.
    const parts = istDateParts(date);
    const day = istDayOfWeek(date);
    const diff = day === 0 ? 6 : day - 1;
    const istMidnight = istStartOfDay(parts.year, parts.month, parts.day);
    return new Date(istMidnight.getTime() - diff * 86_400_000);
  }
}
