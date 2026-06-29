import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { AuthSessionStatus, Prisma, StructureStatus, TeacherRoleKind, UserStatus } from "@prisma/client";
import { AuthUser } from "../auth/auth.types";
import { Response } from "express";
import { computeFeeOverdue } from "../common/fee-overdue.util";
import { buildExportBasename } from "../common/export-filename.util";
import { formatIstDate } from "../common/ist-time.util";
import { toPagination } from "../common/pagination.dto";
import { sendTabularExport, type TabularExportFormat } from "../common/tabular-export.util";
import { RequestContext } from "../auth/request-context";
import { PrismaService } from "../prisma/prisma.service";
import { StudentSearchQueryDto, TeacherStudentProfileEditDto } from "./teacher-student-search.dto";

type FieldChange = { old: unknown; new: unknown };

export const PROFILE_CARDS = ["all", "personal", "academic", "fee", "marks"] as const;
export type ProfileCard = (typeof PROFILE_CARDS)[number];

const profileInclude = {
  user: { select: { id: true, fullName: true, email: true, username: true, phone: true, status: true } },
  section: {
    include: { campus: true, class: { include: { batch: { include: { branch: { include: { program: true } } } } } } }
  },
  feeAssignments: {
    include: {
      feeStructure: { include: { feeHead: true, class: { select: { yearNumber: true } } } },
      payments: { where: { status: "ACTIVE" as const }, select: { amount: true } }
    }
  },
  resultEntries: { include: { subject: { select: { id: true, code: true, name: true } } } }
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

  /**
   * Edit a student's personal/login fields (section/campus are NOT editable here).
   * Scoped + IDOR-safe. Writes a single audit row capturing every changed field
   * old→new plus IP/userAgent. Reuses the same uniqueness handling as admin edits.
   */
  async updateProfile(user: AuthUser, studentProfileId: string, dto: TeacherStudentProfileEditDto, ctx: RequestContext = {}) {
    const sectionIds = await this.accessibleSectionIds(user);
    const student = await this.prisma.studentProfile.findFirst({
      where: { id: studentProfileId, sectionId: { in: sectionIds.length ? sectionIds : ["__none__"] } },
      include: { user: { select: { id: true, fullName: true, email: true, username: true, phone: true, status: true } } }
    });
    if (!student) throw new NotFoundException("Student not found.");

    const changes: Record<string, FieldChange> = {};
    const userData: Prisma.UserUpdateInput = {};
    const profileData: Prisma.StudentProfileUpdateInput = {};

    const norm = (v: string | undefined) => (v === undefined ? undefined : v.trim());
    const nullable = (v: string | undefined) => (v === undefined ? undefined : v.trim() || null);

    // --- User fields ---
    const fullName = norm(dto.fullName);
    if (fullName !== undefined && fullName !== student.user.fullName) {
      userData.fullName = fullName;
      changes.fullName = { old: student.user.fullName, new: fullName };
    }
    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      const currentEmail = student.user.email.endsWith("@students.local") ? null : student.user.email;
      if (email !== currentEmail) {
        userData.email = email;
        changes.email = { old: currentEmail, new: email };
      }
    }
    if (dto.username !== undefined) {
      const username = dto.username.trim();
      if (username !== (student.user.username ?? null)) {
        userData.username = username;
        changes.username = { old: student.user.username, new: username };
      }
    }
    if (dto.phone !== undefined) {
      const phone = nullable(dto.phone);
      if (phone !== student.user.phone) {
        userData.phone = phone;
        changes.phone = { old: student.user.phone, new: phone };
      }
    }
    if (dto.status !== undefined && dto.status !== student.user.status) {
      userData.status = dto.status;
      profileData.currentStatus = dto.status;
      changes.status = { old: student.user.status, new: dto.status };
    }

    // --- StudentProfile fields ---
    if (dto.rollNumber !== undefined) {
      const rollNumber = dto.rollNumber.trim().toUpperCase().replace(/\s+/g, "");
      if (rollNumber && rollNumber !== student.rollNumber) {
        profileData.rollNumber = rollNumber;
        changes.rollNumber = { old: student.rollNumber, new: rollNumber };
      }
    }
    if (dto.dateOfBirth !== undefined) {
      const dob = dto.dateOfBirth.trim() ? new Date(dto.dateOfBirth) : null;
      if (dob && Number.isNaN(dob.getTime())) throw new BadRequestException("Invalid date of birth.");
      const oldIso = student.dateOfBirth ? student.dateOfBirth.toISOString() : null;
      const newIso = dob ? dob.toISOString() : null;
      if (newIso !== oldIso) {
        profileData.dateOfBirth = dob;
        changes.dateOfBirth = { old: oldIso, new: newIso };
      }
    }
    if (dto.fatherName !== undefined) {
      const v = nullable(dto.fatherName);
      if (v !== student.fatherName) { profileData.fatherName = v; changes.fatherName = { old: student.fatherName, new: v }; }
    }
    if (dto.guardianName !== undefined) {
      const v = nullable(dto.guardianName);
      if (v !== student.guardianName) { profileData.guardianName = v; changes.guardianName = { old: student.guardianName, new: v }; }
    }
    if (dto.address !== undefined) {
      const v = nullable(dto.address);
      if (v !== student.address) { profileData.address = v; changes.address = { old: student.address, new: v }; }
    }
    for (const key of ["village", "mandal", "district", "state", "pincode", "homeAddress"] as const) {
      if (dto[key] !== undefined) {
        const v = nullable(dto[key]);
        if (v !== student[key]) { profileData[key] = v; changes[key] = { old: student[key], new: v }; }
      }
    }

    if (!Object.keys(changes).length) {
      return this.profile(user, studentProfileId);
    }

    const deactivating = dto.status !== undefined && dto.status !== UserStatus.ACTIVE && changes.status;

    try {
      await this.prisma.$transaction(async (tx) => {
        if (Object.keys(userData).length) {
          await tx.user.update({ where: { id: student.user.id }, data: userData });
        }
        if (Object.keys(profileData).length) {
          await tx.studentProfile.update({ where: { id: studentProfileId }, data: profileData });
        }
        if (deactivating) {
          await tx.authSession.updateMany({
            where: { userId: student.user.id, status: AuthSessionStatus.ACTIVE },
            data: { status: AuthSessionStatus.REVOKED, revokedAt: new Date() }
          });
        }
        await tx.auditLog.create({
          data: {
            userId: user.auditUserId ?? user.id,
            action: "TEACHER_UPDATE_STUDENT_PROFILE",
            entity: "StudentProfile",
            entityId: studentProfileId,
            metadata: {
              changes,
              ipAddress: ctx.ipAddress ?? null,
              userAgent: ctx.userAgent ?? null
            } as Prisma.InputJsonObject
          }
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Email, username, or roll number already exists.");
      }
      throw error;
    }

    return this.profile(user, studentProfileId);
  }

  /** Export one student's card (personal/academic/fee/marks) or all, to PDF/Excel. */
  async exportProfile(user: AuthUser, studentProfileId: string, format: TabularExportFormat, response: Response, card: ProfileCard = "all") {
    const p = await this.profile(user, studentProfileId);
    const rows: (string | number | null)[][] = [["Field", "Value"]];

    const wantAll = card === "all";
    if (wantAll || card === "academic") {
      rows.push(["— Academic —", ""],
        ["Campus", p.academic.campus.code], ["Department", p.academic.program.code], ["Branch", p.academic.branch.code],
        ["Batch", `${p.academic.batch.startYear}-${p.academic.batch.endYear}`], ["Semester", String(p.academic.semester)], ["Section", p.academic.section.name]);
    }
    if (wantAll || card === "personal") {
      rows.push(["— Personal —", ""],
        ["Name", p.personal.fullName], ["Roll Number", p.personal.rollNumber], ["Email", p.personal.email ?? "-"], ["Username", p.personal.username ?? "-"],
        ["Phone", p.personal.phone ?? "-"], ["Date of Birth", p.personal.dateOfBirth ?? "-"], ["Father Name", p.personal.fatherName ?? "-"], ["Guardian Name", p.personal.guardianName ?? "-"],
        ["Village", p.personal.village ?? "-"], ["Mandal", p.personal.mandal ?? "-"], ["District", p.personal.district ?? "-"], ["State", p.personal.state ?? "-"], ["Pincode", p.personal.pincode ?? "-"], ["Home Address", p.personal.homeAddress ?? "-"],
        ["Status", p.personal.status]);
    }
    if (wantAll || card === "fee") {
      rows.push(["— Fees —", ""], ["Total Assigned", p.fees.totals.assigned], ["Total Paid", p.fees.totals.paid], ["Balance", p.fees.totals.balance]);
      for (const yr of p.fees.years) {
        rows.push([`Year ${yr.yearNumber || "—"}`, `Balance ${yr.totals.balance}${yr.hasOverdue ? " · OVERDUE" : ""}`]);
        for (const f of yr.items) {
          rows.push([`  ${f.feeHead} (due ${f.dueDate ?? "-"})`, `Paid ${f.paid}/${f.amount} · Balance ${f.balance} · ${f.status}${f.daysOverdue ? ` (${f.daysOverdue}d overdue)` : ""}`]);
        }
      }
    }
    if (wantAll || card === "marks") {
      rows.push(["— Marks —", ""]);
      for (const sem of p.marks.semesters) {
        rows.push([`Semester ${sem.semesterNumber}`, ""]);
        for (const m of sem.items) {
          rows.push([`  ${m.subject} (${m.examType})`, `Int ${m.internals ?? "-"} · Ext ${m.externals ?? "-"} · Total ${m.totalMarks ?? "-"} · ${m.grade ?? "-"} · ${m.status}`]);
        }
      }
    }

    const cardLabel = wantAll ? "Profile" : card.charAt(0).toUpperCase() + card.slice(1);
    await sendTabularExport(
      response,
      format,
      buildExportBasename(`Student_${cardLabel}`, p.personal.rollNumber),
      `${p.personal.fullName} (${p.personal.rollNumber}) — ${cardLabel}`,
      rows
    );
  }

  private toProfile(student: ProfileRow) {
    const branch = student.section.class.batch.branch;
    const program = branch.program;

    const fees = student.feeAssignments.map((a) => {
      const due = Number(a.feeStructure.amount);
      const paid = a.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const balance = Math.max(due - paid, 0);
      const overdue = computeFeeOverdue(balance, a.feeStructure.dueDate);
      // Fee year: the structure's stored year, else the linked class's year, else 0 (ungrouped).
      const yearNumber = a.feeStructure.yearNumber ?? a.feeStructure.class?.yearNumber ?? 0;
      return {
        assignmentId: a.id,
        yearNumber,
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
    // One card per year — completed years first, current/highest last.
    const feeYearMap = new Map<number, typeof fees>();
    for (const f of fees) {
      if (!feeYearMap.has(f.yearNumber)) feeYearMap.set(f.yearNumber, []);
      feeYearMap.get(f.yearNumber)!.push(f);
    }
    const feeYears = [...feeYearMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([yearNumber, items]) => ({
        yearNumber,
        items,
        hasOverdue: items.some((i) => i.status === "overdue"),
        totals: items.reduce(
          (acc, i) => ({ assigned: acc.assigned + i.amount, paid: acc.paid + i.paid, balance: acc.balance + i.balance }),
          { assigned: 0, paid: 0, balance: 0 }
        )
      }));

    // One card per semester.
    const markItems = student.resultEntries
      .map((m) => ({
        id: m.id,
        subjectId: m.subject.id,
        subjectCode: m.subject.code,
        subjectName: m.subject.name,
        subject: `${m.subject.code} — ${m.subject.name}`,
        semesterNumber: m.semesterNumber,
        examType: m.examType,
        internals: m.internals != null ? Number(m.internals) : null,
        externals: m.externals != null ? Number(m.externals) : null,
        totalMarks: m.totalMarks != null ? Number(m.totalMarks) : null,
        grade: m.grade,
        credits: m.credits != null ? Number(m.credits) : null,
        status: m.status
      }))
      .sort((a, b) => a.semesterNumber - b.semesterNumber || a.subject.localeCompare(b.subject));
    const markSemMap = new Map<number, typeof markItems>();
    for (const m of markItems) {
      if (!markSemMap.has(m.semesterNumber)) markSemMap.set(m.semesterNumber, []);
      markSemMap.get(m.semesterNumber)!.push(m);
    }
    const markSemesters = [...markSemMap.entries()].sort((a, b) => a[0] - b[0]).map(([semesterNumber, items]) => ({ semesterNumber, items }));

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
        village: student.village,
        mandal: student.mandal,
        district: student.district,
        state: student.state,
        pincode: student.pincode,
        homeAddress: student.homeAddress,
        status: student.currentStatus
      },
      academic: {
        campus: { code: student.section.campus.code, name: student.section.campus.name },
        program: { code: program.code, name: program.name },
        branch: { code: branch.code, name: branch.name },
        batchId: student.section.class.batchId,
        batch: { startYear: student.section.class.batch.startYear, endYear: student.section.class.batch.endYear },
        semester: student.section.class.semesterNumber,
        section: { id: student.section.id, name: student.section.name }
      },
      fees: { items: fees, totals: feeTotals, years: feeYears },
      marks: { items: markItems, semesters: markSemesters }
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
