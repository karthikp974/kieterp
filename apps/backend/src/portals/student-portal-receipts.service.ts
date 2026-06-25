import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { FeePaymentStatus, UserType } from "@prisma/client";
import { formatAcademicYearLabel, yearNumberFromSemester } from "../common/semester-label.util";
import { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { loadStudentPortalProfile } from "./student-portal-load-student";
import { buildStudentReceiptPdfBuffer, formatReceiptAcademicYear } from "./student-receipt-pdf.util";

export type ReceiptRowDto = {
  id: string;
  receiptNo: string;
  feeHead: string;
  amountRupees: number;
  paymentMode: string;
  paymentRecordStatus: string;
  paidPercentOfFee: number | null;
  coverageLabel: string;
  paidAt: string;
};

@Injectable()
export class StudentPortalReceiptsService {
  constructor(private readonly prisma: PrismaService) {}

  async getReceiptsPage(user: AuthUser) {
    this.assertStudent(user);
    const student = await loadStudentPortalProfile(this.prisma, user.id);
    const branch = student.section.class.batch.branch;
    const currentSemester = student.section.class.semesterNumber;
    const currentYearNumber = student.section.class.yearNumber;
    const promotionTimeline = await this.loadPromotionTimeline(student.id, currentSemester);

    const payments = await this.prisma.feePayment.findMany({
      where: { studentProfileId: student.id, status: FeePaymentStatus.ACTIVE },
      include: {
        feeHead: true,
        studentFeeAssignment: {
          include: {
            feeStructure: {
              include: {
                feeHead: true,
                class: { select: { yearNumber: true, semesterNumber: true } },
                section: { include: { class: { select: { yearNumber: true, semesterNumber: true } } } }
              }
            }
          }
        }
      },
      orderBy: { paidAt: "asc" }
    });

    const assignments = await this.prisma.studentFeeAssignment.findMany({
      where: { studentId: student.id },
      include: { feeStructure: { select: { id: true, amount: true } } }
    });
    const assignmentDue = new Map(assignments.map((a) => [a.id, Number(a.feeStructure.amount)]));

    const byYear = new Map<number, ReceiptRowDto[]>();

    for (const p of payments) {
      const feeHead =
        p.studentFeeAssignment?.feeStructure.feeHeadName ??
        p.studentFeeAssignment?.feeStructure.feeHead.name ??
        p.feeHead.name;
      const assignId = p.studentFeeAssignmentId;
      const due = assignId ? assignmentDue.get(assignId) : null;
      const amountRupees = Number(p.amount);
      const paidPercentOfFee =
        due && due > 0 ? Math.min(100, Math.round((amountRupees / due) * 10000) / 100) : null;
      const coverageLabel =
        paidPercentOfFee !== null && paidPercentOfFee >= 99.99 ? "Full" : paidPercentOfFee !== null ? "Partial" : "—";

      const yearNumber = this.resolvePaymentYear(p, p.paidAt, promotionTimeline, currentSemester, currentYearNumber);
      const row: ReceiptRowDto = {
        id: p.id,
        receiptNo: p.receiptNo,
        feeHead,
        amountRupees,
        paymentMode: p.paymentMode,
        paymentRecordStatus: p.status,
        paidPercentOfFee,
        coverageLabel,
        paidAt: p.paidAt.toISOString()
      };

      const list = byYear.get(yearNumber) ?? [];
      list.push(row);
      byYear.set(yearNumber, list);
    }

    const years = [...byYear.entries()]
      .sort(([a], [b]) => a - b)
      .map(([yearNumber, receipts]) => ({
        yearNumber,
        yearLabel: formatAcademicYearLabel(yearNumber),
        isCurrentYear: yearNumber === currentYearNumber,
        receipts: receipts.sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())
      }));

    return {
      currency: "INR" as const,
      student: {
        fullName: student.user.fullName,
        rollNumber: student.rollNumber
      },
      branch: {
        name: branch.name,
        code: branch.code
      },
      currentYearLabel: formatAcademicYearLabel(currentYearNumber),
      totalReceipts: payments.length,
      years
    };
  }

  async exportPaymentReceiptPdf(user: AuthUser, paymentId: string) {
    this.assertStudent(user);
    const student = await loadStudentPortalProfile(this.prisma, user.id);
    const branch = student.section.class.batch.branch;

    const payment = await this.prisma.feePayment.findFirst({
      where: { id: paymentId, studentProfileId: student.id, status: FeePaymentStatus.ACTIVE },
      include: {
        feeHead: true,
        receivedBy: { select: { fullName: true } },
        studentFeeAssignment: {
          include: {
            feeStructure: {
              include: { feeHead: true }
            }
          }
        }
      }
    });
    if (!payment) throw new NotFoundException("Payment receipt not found.");

    const paidAmount = Number(payment.amount);
    const assignment = payment.studentFeeAssignment;
    const totalFeeRupees = assignment ? Number(assignment.feeStructure.amount) : null;
    const paidAgg = assignment
      ? await this.prisma.feePayment.aggregate({
          where: { studentFeeAssignmentId: assignment.id, status: FeePaymentStatus.ACTIVE },
          _sum: { amount: true }
        })
      : null;
    const totalPaidOnAssignment = paidAgg ? Number(paidAgg._sum.amount ?? 0) : paidAmount;
    const balanceRupees =
      totalFeeRupees !== null ? Math.max(totalFeeRupees - totalPaidOnAssignment, 0) : 0;
    const isPartial = totalFeeRupees !== null && balanceRupees > 0 && totalPaidOnAssignment > 0;
    const feeCategory =
      assignment?.feeStructure.feeHead.name ?? payment.feeHead.name;
    const feeType =
      assignment?.feeStructure.feeHeadName ??
      assignment?.feeStructure.feeHead.name ??
      payment.feeHead.name;
    const batch = student.section.class.batch;
    const remarks = payment.note?.trim() || assignment?.feeStructure.remarks?.trim() || null;

    const generatedAt = new Date();
    const buffer = await buildStudentReceiptPdfBuffer(
      {
        paymentId: payment.id,
        receiptNo: payment.receiptNo,
        transactionId: payment.transactionId,
        studentName: student.user.fullName,
        rollNumber: student.rollNumber,
        admissionNumber: null,
        branchName: branch.name,
        academicYear: formatReceiptAcademicYear(batch.startYear, batch.endYear),
        feeCategory,
        feeType,
        amountPaidRupees: isPartial ? totalPaidOnAssignment : paidAmount,
        totalFeeRupees: isPartial ? totalFeeRupees : null,
        remainingRupees: isPartial ? balanceRupees : null,
        paidAt: payment.paidAt,
        paymentMode: payment.paymentMode,
        paymentStatusLabel: isPartial ? "Partially paid" : "Paid",
        collectedBy: payment.receivedBy.fullName,
        remarks,
        isPartial
      },
      generatedAt
    );

    return {
      buffer,
      contentType: "application/pdf",
      filename: `receipt-${payment.receiptNo.replace(/[^\w.-]+/g, "_")}.pdf`
    };
  }

  private assertStudent(user: AuthUser) {
    if (user.type !== UserType.STUDENT) {
      throw new ForbiddenException("Only student accounts can access receipts.");
    }
  }

  private async loadPromotionTimeline(studentProfileId: string, currentSemester: number) {
    const rows = await this.prisma.studentPromotionHistory.findMany({
      where: { studentProfileId },
      orderBy: { promotedAt: "asc" },
      select: { promotedAt: true, fromSemester: true, toSemester: true }
    });
    return rows.map((r) => ({
      promotedAt: r.promotedAt,
      fromSemester: r.fromSemester ?? currentSemester,
      toSemester: r.toSemester ?? currentSemester
    }));
  }

  private resolvePaymentYear(
    payment: {
      studentFeeAssignment?: {
        feeStructure: {
          class: { yearNumber: number; semesterNumber: number } | null;
          section: { class: { yearNumber: number; semesterNumber: number } } | null;
        } | null;
      } | null;
    },
    paidAt: Date,
    timeline: { promotedAt: Date; fromSemester: number; toSemester: number }[],
    currentSemester: number,
    currentYearNumber: number
  ): number {
    const feeClass =
      payment.studentFeeAssignment?.feeStructure?.class ??
      payment.studentFeeAssignment?.feeStructure?.section?.class ??
      null;
    if (feeClass?.yearNumber != null) return feeClass.yearNumber;
    if (feeClass?.semesterNumber != null) return yearNumberFromSemester(feeClass.semesterNumber);

    const semesterNumber = this.resolvePaymentSemester(payment, paidAt, timeline, currentSemester);
    if (semesterNumber) return yearNumberFromSemester(semesterNumber);
    return currentYearNumber;
  }

  private resolvePaymentSemester(
    payment: {
      studentFeeAssignment?: {
        feeStructure: {
          class: { yearNumber: number; semesterNumber: number } | null;
          section: { class: { yearNumber: number; semesterNumber: number } } | null;
        } | null;
      } | null;
    },
    paidAt: Date,
    timeline: { promotedAt: Date; fromSemester: number; toSemester: number }[],
    currentSemester: number
  ): number {
    const fromStructure =
      payment.studentFeeAssignment?.feeStructure?.class?.semesterNumber ??
      payment.studentFeeAssignment?.feeStructure?.section?.class?.semesterNumber;
    if (fromStructure) return fromStructure;

    if (!timeline.length) return currentSemester;

    const paidMs = paidAt.getTime();
    if (paidMs < timeline[0].promotedAt.getTime()) {
      return timeline[0].fromSemester;
    }

    for (let i = timeline.length - 1; i >= 0; i--) {
      if (paidMs >= timeline[i].promotedAt.getTime()) {
        return timeline[i].toSemester;
      }
    }

    return timeline[0].fromSemester;
  }
}
