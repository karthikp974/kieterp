import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Response } from "express";
import { Prisma, StructureStatus, StudentTeamStatus, TeacherRoleKind, UserStatus } from "@prisma/client";
import { AuthUser } from "../auth/auth.types";
import { buildExportBasename } from "../common/export-filename.util";
import { computeFeeOverdue } from "../common/fee-overdue.util";
import { formatIstDate } from "../common/ist-time.util";
import { toPagination } from "../common/pagination.dto";
import { sendTabularExport, type TabularExportFormat } from "../common/tabular-export.util";
import { PrismaService } from "../prisma/prisma.service";
import { SectionOverviewQueryDto, type SectionOverviewView } from "./teacher-section-overview.dto";

const UNASSIGNED = "__unassigned__";

const studentInclude = {
  user: { select: { fullName: true, email: true, username: true, phone: true } },
  feeAssignments: {
    select: {
      feeStructure: { select: { amount: true, dueDate: true, feeHeadName: true, feeHead: { select: { name: true } } } },
      payments: { where: { status: "ACTIVE" as const }, select: { amount: true } }
    }
  },
  resultEntries: {
    select: { subject: { select: { code: true, name: true } }, semesterNumber: true, examType: true, internals: true, externals: true, totalMarks: true, grade: true, status: true }
  }
} satisfies Prisma.StudentProfileInclude;

type StudentRow = Prisma.StudentProfileGetPayload<{ include: typeof studentInclude }>;
type Built = { id: string; rollNumber: string; fullName: string; isOverdue: boolean; teamId: string; teamName: string; data: Record<string, unknown> };

/**
 * Page 2 — Section Overview. Group a teacher's section students team-wise for a chosen
 * view (personal/fee/academic/marks). Fee + Marks views sort fee-overdue students first
 * and flag them. Two queries only (students + teams), aggregated in memory. Scoped + IDOR.
 */
@Injectable()
export class TeacherPortalSectionOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async setup(user: AuthUser) {
    const sections = await this.accessibleSections(user);
    return { sections: sections.map((s) => ({ id: s.id, label: s.label })) };
  }

  async overview(user: AuthUser, query: SectionOverviewQueryDto) {
    await this.assertSectionInScope(user, query.sectionId);
    const pagination = toPagination(query);

    const [students, teams] = await Promise.all([
      this.prisma.studentProfile.findMany({
        where: { sectionId: query.sectionId, isArchived: false, currentStatus: UserStatus.ACTIVE },
        include: studentInclude,
        orderBy: { rollNumber: "asc" },
        take: pagination.take,
        skip: pagination.skip
      }),
      this.prisma.studentTeam.findMany({
        where: { sectionId: query.sectionId, status: StudentTeamStatus.ACTIVE },
        select: { id: true, name: true, members: { select: { studentProfileId: true } } }
      }),
      ]);
    const total = await this.prisma.studentProfile.count({
      where: { sectionId: query.sectionId, isArchived: false, currentStatus: UserStatus.ACTIVE }
    });

    const teamOf = new Map<string, { id: string; name: string }>();
    for (const team of teams) {
      for (const m of team.members) teamOf.set(m.studentProfileId, { id: team.id, name: team.name });
    }

    const built = students.map((s) => this.buildStudent(s, query.view, teamOf));
    return { section: { id: query.sectionId }, view: query.view, total, page: pagination.page, pageSize: pagination.pageSize, teams: this.groupTeams(built, query.view) };
  }

  async exportOverview(user: AuthUser, query: SectionOverviewQueryDto, format: TabularExportFormat, response: Response) {
    const result = await this.overview(user, { ...query, page: 1, pageSize: 100 });
    const header = this.exportHeader(query.view);
    const rows: (string | number | null)[][] = [header];
    for (const team of result.teams) {
      for (const student of team.students) {
        rows.push(...this.exportRows(query.view, team.teamName, student));
      }
    }
    await sendTabularExport(
      response,
      format,
      buildExportBasename("SectionOverview", query.view),
      `Section overview — ${query.view}`,
      rows
    );
  }

  // --- builders ---

  private buildStudent(s: StudentRow, view: SectionOverviewView, teamOf: Map<string, { id: string; name: string }>): Built {
    const team = teamOf.get(s.id);
    const fee = this.feeSummary(s);
    const base = { id: s.id, rollNumber: s.rollNumber, fullName: s.user.fullName, isOverdue: fee.status === "overdue", teamId: team?.id ?? UNASSIGNED, teamName: team?.name ?? "Unassigned" };

    if (view === "personal") {
      return { ...base, data: { phone: s.user.phone, fatherName: s.fatherName, guardianName: s.guardianName, address: s.address, dateOfBirth: s.dateOfBirth ? formatIstDate(s.dateOfBirth) : null, status: s.currentStatus } };
    }
    if (view === "academic") {
      return { ...base, data: { email: s.user.email.endsWith("@students.local") ? null : s.user.email, username: s.user.username, status: s.currentStatus } };
    }
    if (view === "fee") {
      return { ...base, data: { assigned: fee.assigned, paid: fee.paid, balance: fee.balance, status: fee.status, daysOverdue: fee.daysOverdue } };
    }
    // marks
    return {
      ...base,
      data: {
        feeStatus: fee.status,
        marks: s.resultEntries
          .map((m) => ({ subject: `${m.subject.code} — ${m.subject.name}`, semesterNumber: m.semesterNumber, examType: m.examType, internals: m.internals != null ? Number(m.internals) : null, externals: m.externals != null ? Number(m.externals) : null, totalMarks: m.totalMarks != null ? Number(m.totalMarks) : null, grade: m.grade, status: m.status }))
          .sort((a, b) => a.semesterNumber - b.semesterNumber || a.subject.localeCompare(b.subject))
      }
    };
  }

  private feeSummary(s: StudentRow) {
    let assigned = 0;
    let paid = 0;
    let worst: { status: "paid" | "pending" | "overdue"; daysOverdue: number } = { status: "paid", daysOverdue: 0 };
    for (const a of s.feeAssignments) {
      const due = Number(a.feeStructure.amount);
      const p = a.payments.reduce((sum, row) => sum + Number(row.amount), 0);
      const balance = Math.max(due - p, 0);
      assigned += due;
      paid += p;
      const o = computeFeeOverdue(balance, a.feeStructure.dueDate);
      // overdue dominates pending dominates paid
      if (o.status === "overdue" && (worst.status !== "overdue" || o.daysOverdue > worst.daysOverdue)) worst = { status: "overdue", daysOverdue: o.daysOverdue };
      else if (o.status === "pending" && worst.status === "paid") worst = { status: "pending", daysOverdue: 0 };
    }
    return { assigned, paid, balance: Math.max(assigned - paid, 0), status: worst.status, daysOverdue: worst.daysOverdue };
  }

  /** Group students by team; fee/marks views: overdue students first within a team, and teams with overdue members first. */
  private groupTeams(built: Built[], view: SectionOverviewView) {
    const overdueFirst = view === "fee" || view === "marks";
    const groups = new Map<string, { teamId: string; teamName: string; students: Built[] }>();
    for (const b of built) {
      if (!groups.has(b.teamId)) groups.set(b.teamId, { teamId: b.teamId, teamName: b.teamName, students: [] });
      groups.get(b.teamId)!.students.push(b);
    }
    const teams = [...groups.values()];
    for (const t of teams) {
      t.students.sort((a, b) => {
        if (overdueFirst && a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
        return a.rollNumber.localeCompare(b.rollNumber);
      });
    }
    teams.sort((a, b) => {
      if (overdueFirst) {
        const ao = a.students.some((s) => s.isOverdue);
        const bo = b.students.some((s) => s.isOverdue);
        if (ao !== bo) return ao ? -1 : 1;
      }
      if (a.teamId === UNASSIGNED) return 1;
      if (b.teamId === UNASSIGNED) return -1;
      return a.teamName.localeCompare(b.teamName);
    });
    return teams;
  }

  private exportHeader(view: SectionOverviewView): string[] {
    if (view === "personal") return ["Team", "Roll", "Name", "Phone", "Father", "Guardian", "Address", "DOB", "Status"];
    if (view === "academic") return ["Team", "Roll", "Name", "Email", "Username", "Status"];
    if (view === "fee") return ["Team", "Roll", "Name", "Assigned", "Paid", "Balance", "Fee Status", "Days Overdue"];
    return ["Team", "Roll", "Name", "Subject", "Sem", "Exam", "Internals", "Externals", "Total", "Grade", "Status", "Fee Status"];
  }

  private exportRows(view: SectionOverviewView, teamName: string, s: Built): (string | number | null)[][] {
    const d = s.data;
    if (view === "personal") return [[teamName, s.rollNumber, s.fullName, str(d.phone), str(d.fatherName), str(d.guardianName), str(d.address), str(d.dateOfBirth), str(d.status)]];
    if (view === "academic") return [[teamName, s.rollNumber, s.fullName, str(d.email), str(d.username), str(d.status)]];
    if (view === "fee") return [[teamName, s.rollNumber, s.fullName, num(d.assigned), num(d.paid), num(d.balance), str(d.status), num(d.daysOverdue)]];
    const marks = (d.marks as { subject: string; semesterNumber: number; examType: string; internals: number | null; externals: number | null; totalMarks: number | null; grade: string | null; status: string }[]) ?? [];
    if (!marks.length) return [[teamName, s.rollNumber, s.fullName, "-", "-", "-", "-", "-", "-", "-", "-", str(d.feeStatus)]];
    return marks.map((m) => [teamName, s.rollNumber, s.fullName, m.subject, m.semesterNumber, m.examType, m.internals ?? "-", m.externals ?? "-", m.totalMarks ?? "-", m.grade ?? "-", m.status, str(d.feeStatus)]);
  }

  // --- scope ---

  private async assertSectionInScope(user: AuthUser, sectionId: string) {
    const sections = await this.accessibleSections(user);
    if (!sections.some((s) => s.id === sectionId)) throw new NotFoundException("Section not found.");
  }

  private async accessibleSections(user: AuthUser): Promise<{ id: string; label: string }[]> {
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { userId: user.id },
      include: { assignments: { where: { isActive: true }, select: { role: true, campusId: true, programId: true, branchId: true, batchId: true, classId: true, sectionId: true } } }
    });
    if (!teacher || teacher.isArchived) throw new NotFoundException("Teacher profile not found.");
    const manage = teacher.assignments.filter((a) => a.role === TeacherRoleKind.HTPO || a.role === TeacherRoleKind.CTPO);
    if (!manage.length) throw new ForbiddenException("Section overview is available to branch heads and class teachers only.");

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
      select: { id: true, name: true, class: { select: { semesterNumber: true, batch: { select: { branch: { select: { code: true } } } } } } },
      orderBy: [{ class: { semesterNumber: "desc" } }, { name: "asc" }]
    });
    return sections.map((s) => ({ id: s.id, label: `${s.class.batch.branch.code} · Sem ${s.class.semesterNumber} · ${s.name}` }));
  }
}

function str(v: unknown): string {
  return v == null || v === "" ? "-" : String(v);
}
function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}
