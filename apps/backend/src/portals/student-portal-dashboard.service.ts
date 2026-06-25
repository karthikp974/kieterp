import { ForbiddenException, Injectable } from "@nestjs/common";
import { formatIstDate, istDayOfWeek, istMonthRange } from "../common/ist-time.util";
import {
  AnnouncementAudience,
  AnnouncementStatus,
  AttendanceEntryStatus,
  FeePaymentStatus,
  StudentFeePaymentStatus,
  StructureStatus,
  TimetableSlotStatus,
  UserType
} from "@prisma/client";
import { AuthUser, ScopeRef } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { campusIdsForSharedMatching, studentProfileToScope } from "../permissions/operational-scope.util";
import { loadStudentPortalProfile } from "./student-portal-load-student";
import { formatTime24Label } from "../timetable/normalize-timetable-time";

@Injectable()
export class StudentPortalDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  assertStudent(user: AuthUser) {
    if (user.type !== UserType.STUDENT) {
      throw new ForbiddenException("Only student accounts can access the student dashboard.");
    }
  }

  async getDashboard(user: AuthUser) {
    this.assertStudent(user);
    const student = await this.loadStudent(user.id);
    const sectionId = student.sectionId;
    const todayDow = this.todayDayOfWeek();
    const month = istMonthRange(new Date());

    const [entriesForSection, monthEntries, todaySlots, assignments, announcementRows] = await Promise.all([
      this.prisma.attendanceEntry.findMany({
        where: { studentProfileId: student.id, session: { sectionId } },
        select: { status: true }
      }),
      this.prisma.attendanceEntry.findMany({
        where: {
          studentProfileId: student.id,
          session: { sectionId, attendanceDate: { gte: month.start, lte: month.end } }
        },
        select: { status: true }
      }),
      this.prisma.timetableSlot.findMany({
        where: { sectionId, status: TimetableSlotStatus.ACTIVE, dayOfWeek: todayDow },
        include: { subject: { select: { name: true, code: true } }, teacherProfile: { include: { user: { select: { fullName: true } } } } },
        orderBy: [{ startTime: "asc" }]
      }),
      this.prisma.studentFeeAssignment.findMany({
        where: {
          studentId: student.id,
          feeStructure: { isActive: true, isArchived: false },
          paymentStatus: { in: [StudentFeePaymentStatus.UNPAID, StudentFeePaymentStatus.PARTIAL] }
        },
        include: {
          feeStructure: { include: { feeHead: true } },
          payments: { where: { status: FeePaymentStatus.ACTIVE }, select: { amount: true } }
        }
      }),
      this.prisma.announcement.findMany({
        where: {
          status: AnnouncementStatus.PUBLISHED,
          audience: { in: [AnnouncementAudience.ALL, AnnouncementAudience.STUDENTS, AnnouncementAudience.BOTH] },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
        },
        include: { createdBy: { select: { fullName: true } } },
        orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
        take: 40
      })
    ]);

    const scope = studentProfileToScope(student);
    const campusIds = campusIdsForSharedMatching(student);
    const announcements = announcementRows
      .filter((row) => this.scopeMatchesAnnouncement(scope, campusIds, row))
      .slice(0, 6)
      .map((row) => ({
        id: row.id,
        title: row.title,
        bodyPreview: row.body.length > 200 ? `${row.body.slice(0, 200)}…` : row.body,
        priority: row.priority,
        pinned: row.pinned,
        publishedAt: row.publishedAt?.toISOString() ?? null,
        createdBy: row.createdBy.fullName
      }));

    const semesterPct = this.attendancePercentage(entriesForSection);
    const monthPct = this.attendancePercentage(monthEntries);

    let outstandingPaise = 0;
    for (const a of assignments) {
      const due = Number(a.feeStructure.amount);
      const paid = a.payments.reduce((s, p) => s + Number(p.amount), 0);
      outstandingPaise += Math.max(Math.round((due - paid) * 100), 0);
    }
    const outstandingRupees = outstandingPaise / 100;

    const cls = student.section.class;
    const prog = cls.batch.branch.program;

    return {
      student: {
        id: student.id,
        fullName: student.user.fullName,
        rollNumber: student.rollNumber
      },
      section: {
        id: student.section.id,
        name: student.section.name,
        code: student.section.code,
        classLabel: cls.label,
        semesterNumber: cls.semesterNumber,
        batchCode: cls.batch.batchCode,
        branchName: cls.batch.branch.name,
        departmentName: prog.name,
        campusName: prog.campus.name
      },
      attendance: {
        thisMonthPercentage: monthPct,
        semesterPercentage: semesterPct,
        thisMonthRecorded: monthEntries.length,
        semesterRecorded: entriesForSection.length
      },
      fees: {
        outstandingRupees,
        currency: "INR" as const
      },
      todayClasses: todaySlots.map((slot) => ({
        id: slot.id,
        startTime: formatTime24Label(slot.startTime),
        endTime: formatTime24Label(slot.endTime),
        room: slot.room,
        subjectName: slot.subject ? `${slot.subject.code} — ${slot.subject.name}` : "General",
        teacherName: slot.teacherProfile?.user.fullName ?? null
      })),
      announcements
    };
  }

  async getAttendanceSummary(user: AuthUser, historyLimit: number) {
    this.assertStudent(user);
    const student = await this.loadStudent(user.id);
    const sectionId = student.sectionId;
    const month = istMonthRange(new Date());

    const [semesterEntries, monthEntries, history] = await Promise.all([
      this.prisma.attendanceEntry.findMany({
        where: { studentProfileId: student.id, session: { sectionId } },
        select: { status: true }
      }),
      this.prisma.attendanceEntry.findMany({
        where: {
          studentProfileId: student.id,
          session: { sectionId, attendanceDate: { gte: month.start, lte: month.end } }
        },
        select: { status: true }
      }),
      this.prisma.attendanceEntry.findMany({
        where: { studentProfileId: student.id, session: { sectionId } },
        include: {
          session: {
            select: {
              attendanceDate: true
            }
          }
        },
        orderBy: { session: { attendanceDate: "desc" } },
        take: Math.min(Math.max(historyLimit, 1), 120)
      })
    ]);

    return {
      semester: {
        percentage: this.attendancePercentage(semesterEntries),
        recordedSessions: semesterEntries.length,
        presentCount: semesterEntries.filter((e) => e.status === AttendanceEntryStatus.PRESENT).length
      },
      thisMonth: {
        percentage: this.attendancePercentage(monthEntries),
        recordedSessions: monthEntries.length,
        presentCount: monthEntries.filter((e) => e.status === AttendanceEntryStatus.PRESENT).length,
        monthLabel: month.label
      },
      history: history.map((row) => ({
        id: row.id,
        date: formatIstDate(row.session.attendanceDate),
        status: row.status
      }))
    };
  }

  async getFeeSummary(user: AuthUser) {
    this.assertStudent(user);
    const student = await this.loadStudent(user.id);

    const assignments = await this.prisma.studentFeeAssignment.findMany({
      where: {
        studentId: student.id,
        feeStructure: { isActive: true, isArchived: false }
      },
      include: {
        feeStructure: { include: { feeHead: true } },
        payments: { where: { status: FeePaymentStatus.ACTIVE }, select: { amount: true } }
      },
      orderBy: { assignedAt: "desc" }
    });

    let totalOutstanding = 0;
    const lines = assignments.map((a) => {
      const due = Number(a.feeStructure.amount);
      const paid = a.payments.reduce((s, p) => s + Number(p.amount), 0);
      const balance = Math.max(due - paid, 0);
      totalOutstanding += balance;
      return {
        assignmentId: a.id,
        feeHeadName: a.feeStructure.feeHeadName ?? a.feeStructure.feeHead.name,
        dueRupees: due,
        paidRupees: paid,
        balanceRupees: balance,
        paymentStatus: a.paymentStatus,
        dueDate: a.feeStructure.dueDate ? formatIstDate(a.feeStructure.dueDate) : null
      };
    });

    return {
      currency: "INR" as const,
      totalOutstandingRupees: totalOutstanding,
      assignments: lines
    };
  }

  private loadStudent(userId: string) {
    return loadStudentPortalProfile(this.prisma, userId);
  }

  private studentToScope(student: Awaited<ReturnType<StudentPortalDashboardService["loadStudent"]>>): ScopeRef {
    return studentProfileToScope(student);
  }

  private announcementToScope(announcement: {
    campusId: string | null;
    programId: string | null;
    branchId: string | null;
    batchId: string | null;
    classId: string | null;
    sectionId: string | null;
  }) {
    return {
      campusId: announcement.campusId ?? undefined,
      programId: announcement.programId ?? undefined,
      branchId: announcement.branchId ?? undefined,
      batchId: announcement.batchId ?? undefined,
      classId: announcement.classId ?? undefined,
      sectionId: announcement.sectionId ?? undefined
    };
  }

  private scopeMatchesAnnouncement(
    scope: ScopeRef,
    campusIds: string[],
    announcement: {
      campusId: string | null;
      programId: string | null;
      branchId: string | null;
      batchId: string | null;
      classId: string | null;
      sectionId: string | null;
    }
  ) {
    const target = this.announcementToScope(announcement) as Record<string, string | undefined>;
    return (Object.keys(target) as (keyof ScopeRef)[]).every((key) => {
      const v = target[key];
      if (!v) return true;
      if (key === "campusId") return campusIds.includes(v);
      return scope[key] === v;
    });
  }

  private attendancePercentage(rows: { status: AttendanceEntryStatus }[]) {
    if (!rows.length) return null;
    const present = rows.filter((r) => r.status === AttendanceEntryStatus.PRESENT).length;
    return Math.round((present / rows.length) * 10000) / 100;
  }

  private todayDayOfWeek() {
    const day = istDayOfWeek();
    return day === 0 ? 7 : day;
  }
}
