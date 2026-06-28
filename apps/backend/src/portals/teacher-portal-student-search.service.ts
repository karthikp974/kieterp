import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, StructureStatus, TeacherRoleKind, UserStatus } from "@prisma/client";
import { AuthUser } from "../auth/auth.types";
import { computeFeeOverdue } from "../common/fee-overdue.util";
import { formatIstDate } from "../common/ist-time.util";
import { toPagination } from "../common/pagination.dto";
import { PrismaService } from "../prisma/prisma.service";
import { StudentSearchQueryDto } from "./teacher-student-search.dto";

const profileInclude = {
  user: { select: { id: true, fullName: true, email: true, username: true, phone: true, status: true } },
  section: {
    include: { campus: true, class: { include: { batch: { include: { branch: { include: { program: true } } } } } } }
  },
  feeAssignments: {
    include: {
      feeStructure: { include: { feeHead: true } },
      payments: { where: { status: "ACTIVE" as const }, select: { amount: true } }
    }
  },
  resultEntries: { include: { subject: { select: { code: true, name: true } } } }
} satisfies Prisma.StudentProfileInclude;

type ProfileRow = Prisma.StudentProfileGetPayload<{ include: typeof profileInclude }>;

/**
 * Read side of the teacher "Search Student" page. Every read is constrained to the
 * teacher's own HTPO/CTPO sections — a student id outside that set is treated as
 * not-found (no information leak), satisfying the IDOR requirement.
 */
@Injectable()
export class TeacherPortalStudentSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(user: AuthUser, query: StudentSearchQueryDto) {
    const sectionIds = await this.accessibleSectionIds(user);
    if (!sectionIds.length) return { items: [], total: 0, page: 1, pageSize: 25 };

    const pagination = toPagination(query);
    const term = query.search?.trim();
    const where: Prisma.StudentProfileWhereInput = {
      sectionId: { in: sectionIds },
      isArchived: false,
      ...(term
        ? {
            OR: [
              { rollNumber: { contains: term, mode: "insensitive" } },
              { user: { fullName: { contains: term, mode: "insensitive" } } }
            ]
          }
        : {})
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.studentProfile.findMany({
        where,
        select: {
          id: true,
          rollNumber: true,
          currentStatus: true,
          user: { select: { fullName: true } },
          section: { select: { name: true, class: { select: { semesterNumber: true, batch: { select: { branch: { select: { code: true } } } } } } } }
        },
        orderBy: [{ rollNumber: "asc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.studentProfile.count({ where })
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        rollNumber: r.rollNumber,
        fullName: r.user.fullName,
        status: r.currentStatus,
        sectionLabel: `${r.section.class.batch.branch.code} · Sem ${r.section.class.semesterNumber} · ${r.section.name}`
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize
    };
  }

  async profile(user: AuthUser, studentProfileId: string) {
    const sectionIds = await this.accessibleSectionIds(user);
    const student = await this.prisma.studentProfile.findFirst({
      where: { id: studentProfileId, sectionId: { in: sectionIds.length ? sectionIds : ["__none__"] } },
      include: profileInclude
    });
    if (!student) throw new NotFoundException("Student not found.");
    return this.toProfile(student);
  }

  private toProfile(student: ProfileRow) {
    const branch = student.section.class.batch.branch;
    const program = branch.program;

    const fees = student.feeAssignments.map((a) => {
      const due = Number(a.feeStructure.amount);
      const paid = a.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const balance = Math.max(due - paid, 0);
      const overdue = computeFeeOverdue(balance, a.feeStructure.dueDate);
      return {
        assignmentId: a.id,
        feeHead: a.feeStructure.feeHeadName ?? a.feeStructure.feeHead.name,
        amount: due,
        paid,
        balance,
        dueDate: a.feeStructure.dueDate ? formatIstDate(a.feeStructure.dueDate) : null,
        status: overdue.status,
        daysOverdue: overdue.daysOverdue
      };
    });
    const feeTotals = fees.reduce(
      (acc, f) => ({ assigned: acc.assigned + f.amount, paid: acc.paid + f.paid, balance: acc.balance + f.balance }),
      { assigned: 0, paid: 0, balance: 0 }
    );

    return {
      id: student.id,
      personal: {
        fullName: student.user.fullName,
        rollNumber: student.rollNumber,
        email: student.user.email.endsWith("@students.local") ? null : student.user.email,
        username: student.user.username,
        phone: student.user.phone,
        dateOfBirth: student.dateOfBirth ? formatIstDate(student.dateOfBirth) : null,
        fatherName: student.fatherName,
        guardianName: student.guardianName,
        address: student.address,
        status: student.currentStatus
      },
      academic: {
        campus: { code: student.section.campus.code, name: student.section.campus.name },
        program: { code: program.code, name: program.name },
        branch: { code: branch.code, name: branch.name },
        batch: { startYear: student.section.class.batch.startYear, endYear: student.section.class.batch.endYear },
        semester: student.section.class.semesterNumber,
        section: { id: student.section.id, name: student.section.name }
      },
      fees: { items: fees, totals: feeTotals },
      marks: student.resultEntries
        .map((m) => ({
          id: m.id,
          subject: `${m.subject.code} — ${m.subject.name}`,
          semesterNumber: m.semesterNumber,
          examType: m.examType,
          internals: m.internals != null ? Number(m.internals) : null,
          externals: m.externals != null ? Number(m.externals) : null,
          totalMarks: m.totalMarks != null ? Number(m.totalMarks) : null,
          grade: m.grade,
          status: m.status
        }))
        .sort((a, b) => a.semesterNumber - b.semesterNumber || a.subject.localeCompare(b.subject))
    };
  }

  /** Section ids the teacher may act on (HTPO branch / CTPO section). STPO-only ⇒ forbidden. */
  private async accessibleSectionIds(user: AuthUser): Promise<string[]> {
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { userId: user.id },
      include: {
        assignments: {
          where: { isActive: true },
          select: { role: true, campusId: true, programId: true, branchId: true, batchId: true, classId: true, sectionId: true }
        }
      }
    });
    if (!teacher || teacher.isArchived) throw new NotFoundException("Teacher profile not found.");

    const manage = teacher.assignments.filter((a) => a.role === TeacherRoleKind.HTPO || a.role === TeacherRoleKind.CTPO);
    if (!manage.length) {
      throw new ForbiddenException("Student search is available to branch heads and class teachers only.");
    }

    const OR: Prisma.SectionWhereInput[] = manage.map((a) => {
      if (a.sectionId) return { id: a.sectionId };
      if (a.classId) return { classId: a.classId };
      if (a.batchId) return { class: { batchId: a.batchId } };
      if (a.branchId) return { class: { batch: { branchId: a.branchId } } };
      if (a.programId) return { class: { batch: { branch: { programId: a.programId } } } };
      if (a.campusId) return { campusId: a.campusId };
      return { id: "__none__" };
    });

    const sections = await this.prisma.section.findMany({
      where: { status: StructureStatus.ACTIVE, isArchived: false, OR },
      select: { id: true }
    });
    return sections.map((s) => s.id);
  }
}
