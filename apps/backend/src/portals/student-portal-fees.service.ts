import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { formatIstDate, formatIstDateTime } from "../common/ist-time.util";
import {
  FeePaymentStatus,
  StudentFeePaymentStatus,
  UserType
} from "@prisma/client";
import PDFDocument from "pdfkit";
import {
  drawPdfInstitutionalHeader,
  drawPdfSectionHeading,
  drawPdfTable,
  formatPdfInr,
  formatPdfPaymentMode,
  formatPdfTimestamp
} from "../common/pdf-institutional.util";
import { AuthUser } from "../auth/auth.types";
import { computeFeeOverdue, type FeeOverdueStatus } from "../common/fee-overdue.util";
import { PrismaService } from "../prisma/prisma.service";
import { loadStudentPortalProfile } from "./student-portal-load-student";
import { StudentPortalReceiptsService } from "./student-portal-receipts.service";
import {
  buildStudentFeeYearBlocks,
  deriveFeeAssignmentUiStatus,
  resolveFeeStructureYear,
  type StudentFeeAssignmentItem
} from "./student-fee-breakdown.util";
import { buildStudentReceiptPdfBuffer, formatReceiptAcademicYear } from "./student-receipt-pdf.util";

type AssignmentRow = {
  id: string;
  feeHead: string;
  amountRupees: number;
  paidRupees: number;
  balanceRupees: number;
  paymentStatus: StudentFeePaymentStatus;
  uiStatus: "PAID" | "PAY_NOW";
  dueDate: string | null;
  /** Computed on read: "paid" | "pending" | "overdue". */
  feeStatus: FeeOverdueStatus;
  daysOverdue: number;
};

@Injectable()
export class StudentPortalFeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly studentPortalReceipts: StudentPortalReceiptsService
  ) {}

  async getFeeStatusPage(user: AuthUser) {
    this.assertStudent(user);
    const student = await loadStudentPortalProfile(this.prisma, user.id);
    const payload = await this.buildFeePayload(student.id, student);
    return { ...payload, generatedAt: new Date().toISOString() };
  }

  async exportFeeStatusPdf(user: AuthUser) {
    this.assertStudent(user);
    const student = await loadStudentPortalProfile(this.prisma, user.id);
    const payload = await this.buildFeePayload(student.id, student);
    const generatedAt = new Date();
    const buffer = await this.buildFeeStatusPdfBuffer(student, payload, generatedAt);
    const safeRoll = student.rollNumber.replace(/[^\w.-]+/g, "_");
    return {
      buffer,
      contentType: "application/pdf",
      filename: `fee-status-${safeRoll}.pdf`
    };
  }

  async exportPaymentReceiptPdf(user: AuthUser, paymentId: string) {
    return this.studentPortalReceipts.exportPaymentReceiptPdf(user, paymentId);
  }

  async exportAssignmentReceiptPdf(user: AuthUser, assignmentId: string) {
    this.assertStudent(user);
    const student = await loadStudentPortalProfile(this.prisma, user.id);
    const branch = student.section.class.batch.branch;
    const batch = student.section.class.batch;
    const academicYear = formatReceiptAcademicYear(batch.startYear, batch.endYear);

    const assignment = await this.prisma.studentFeeAssignment.findFirst({
      where: { id: assignmentId, studentId: student.id },
      include: {
        feeStructure: { include: { feeHead: true, class: { select: { yearNumber: true, semesterNumber: true } } } },
        payments: {
          where: { status: FeePaymentStatus.ACTIVE },
          orderBy: { paidAt: "desc" },
          include: { receivedBy: { select: { fullName: true } } }
        }
      }
    });
    if (!assignment || !assignment.feeStructure.isActive || assignment.feeStructure.isArchived) {
      throw new NotFoundException("Fee assignment not found.");
    }

    const latestPayment = assignment.payments[0];
    if (!latestPayment) {
      throw new BadRequestException("No payment recorded for this fee head yet.");
    }

    const totalFeeRupees = Number(assignment.feeStructure.amount);
    const paidRupees = assignment.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const balanceRupees = Math.max(totalFeeRupees - paidRupees, 0);
    const isPartial = balanceRupees > 0 && paidRupees > 0;
    const feeCategory = assignment.feeStructure.feeHead.name;
    const feeType = assignment.feeStructure.feeHeadName ?? feeCategory;
    const remarks = latestPayment.note?.trim() || assignment.feeStructure.remarks?.trim() || null;

    const generatedAt = new Date();
    const buffer = await buildStudentReceiptPdfBuffer(
      {
        paymentId: latestPayment.id,
        receiptNo: latestPayment.receiptNo,
        transactionId: latestPayment.transactionId,
        studentName: student.user.fullName,
        rollNumber: student.rollNumber,
        admissionNumber: null,
        branchName: branch.name,
        academicYear,
        feeCategory,
        feeType,
        amountPaidRupees: isPartial ? paidRupees : Number(latestPayment.amount),
        totalFeeRupees: isPartial ? totalFeeRupees : null,
        remainingRupees: isPartial ? balanceRupees : null,
        paidAt: latestPayment.paidAt,
        paymentMode: latestPayment.paymentMode,
        paymentStatusLabel: isPartial ? "Partially paid" : "Paid",
        collectedBy: latestPayment.receivedBy.fullName,
        remarks,
        isPartial
      },
      generatedAt
    );

    const safeReceipt = latestPayment.receiptNo.replace(/[^\w.-]+/g, "_");
    return {
      buffer,
      contentType: "application/pdf",
      filename: `receipt-${safeReceipt}.pdf`
    };
  }

  /** Prepares PaymentDesk checkout payload — SDK wiring lands in a follow-up task. */
  async initiateOnlinePayment(user: AuthUser, assignmentId: string) {
    this.assertStudent(user);
    const student = await loadStudentPortalProfile(this.prisma, user.id);
    const assignment = await this.prisma.studentFeeAssignment.findFirst({
      where: { id: assignmentId, studentId: student.id },
      include: { feeStructure: { include: { feeHead: true } } }
    });
    if (!assignment || !assignment.feeStructure.isActive || assignment.feeStructure.isArchived) {
      throw new NotFoundException("Fee assignment not found.");
    }

    const due = Number(assignment.feeStructure.amount);
    const paidAgg = await this.prisma.feePayment.aggregate({
      where: { studentFeeAssignmentId: assignment.id, status: FeePaymentStatus.ACTIVE },
      _sum: { amount: true }
    });
    const paid = Number(paidAgg._sum.amount ?? 0);
    const balanceRupees = Math.max(due - paid, 0);
    if (balanceRupees <= 0) {
      throw new BadRequestException("This fee is already fully paid.");
    }

    const merchantId = process.env.PAYMENTDESK_MERCHANT_ID?.trim();
    const apiKey = process.env.PAYMENTDESK_API_KEY?.trim();
    const configured = Boolean(merchantId && apiKey);

    const feeHead = assignment.feeStructure.feeHeadName ?? assignment.feeStructure.feeHead.name;

    if (!configured) {
      return {
        provider: "PAYMENTDESK",
        configured: false,
        status: "NOT_CONFIGURED" as const,
        message:
          "Online payment is not enabled yet. PaymentDesk credentials are missing — use the accounts office or pay in person.",
        paymentIntent: {
          assignmentId: assignment.id,
          studentProfileId: student.id,
          amountRupees: balanceRupees,
          currency: "INR" as const,
          feeHead,
          rollNumber: student.rollNumber
        },
        checkout: null
      };
    }

    return {
      provider: "PAYMENTDESK",
      configured: true,
      status: "READY_FOR_SDK" as const,
      message:
        "PaymentDesk SDK integration is pending. Use paymentIntent when wiring the client checkout — do not simulate payment here.",
      paymentIntent: {
        assignmentId: assignment.id,
        studentProfileId: student.id,
        amountRupees: balanceRupees,
        currency: "INR" as const,
        feeHead,
        rollNumber: student.rollNumber,
        merchantId,
        reference: `ERP-${assignment.id.slice(-8)}-${Date.now()}`
      },
      checkout: null
    };
  }

  private assertStudent(user: AuthUser) {
    if (user.type !== UserType.STUDENT) {
      throw new ForbiddenException("Only student accounts can access fee status.");
    }
  }

  private async buildFeePayload(
    studentProfileId: string,
    student: Awaited<ReturnType<typeof loadStudentPortalProfile>>
  ) {
    const currentYearNumber = student.section.class.yearNumber;
    const batch = student.section.class.batch;

    const assignments = await this.prisma.studentFeeAssignment.findMany({
      where: {
        studentId: studentProfileId,
        feeStructure: { isActive: true, isArchived: false }
      },
      include: {
        feeStructure: {
          include: {
            feeHead: true,
            class: { select: { yearNumber: true, semesterNumber: true } }
          }
        },
        payments: {
          where: { status: FeePaymentStatus.ACTIVE },
          select: { id: true, amount: true, paidAt: true },
          orderBy: { paidAt: "desc" }
        }
      },
      orderBy: [{ feeStructure: { feeHead: { name: "asc" } } }, { assignedAt: "asc" }]
    });

    const assignmentItems: StudentFeeAssignmentItem[] = assignments.map((a) => {
      const amountRupees = Number(a.feeStructure.amount);
      const paidRupees = a.payments.reduce((s, p) => s + Number(p.amount), 0);
      const balanceRupees = Math.max(amountRupees - paidRupees, 0);
      const status = deriveFeeAssignmentUiStatus(amountRupees, paidRupees, a.paymentStatus);
      const overdue = computeFeeOverdue(balanceRupees, a.feeStructure.dueDate);
      const latestPaymentId = a.payments[0]?.id ?? null;
      return {
        id: a.id,
        yearNumber: resolveFeeStructureYear(a.feeStructure, currentYearNumber),
        feeHead: a.feeStructure.feeHeadName ?? a.feeStructure.feeHead.name,
        feeCategory: a.feeStructure.feeHead.name,
        feeType: a.feeStructure.feeHeadName ?? a.feeStructure.feeHead.name,
        amountRupees,
        paidRupees,
        balanceRupees,
        status,
        feeStatus: overdue.status,
        daysOverdue: overdue.daysOverdue,
        dueDate: a.feeStructure.dueDate ? formatIstDate(a.feeStructure.dueDate) : null,
        latestPaymentId,
        canPay: balanceRupees > 0,
        canDownloadReceipt: paidRupees > 0 && latestPaymentId !== null
      };
    });

    const yearBreakdown = buildStudentFeeYearBlocks(assignmentItems, currentYearNumber);

    // Raw due dates by assignment id, to compute overdue status on read.
    const dueDateById = new Map(assignments.map((a) => [a.id, a.feeStructure.dueDate]));

    const breakdown: AssignmentRow[] = assignmentItems.map((item) => {
      const overdue = computeFeeOverdue(item.balanceRupees, dueDateById.get(item.id) ?? null);
      return {
        id: item.id,
        feeHead: item.feeHead,
        amountRupees: item.amountRupees,
        paidRupees: item.paidRupees,
        balanceRupees: item.balanceRupees,
        paymentStatus:
          item.status === "PAID"
            ? StudentFeePaymentStatus.PAID
            : item.status === "PARTIAL"
              ? StudentFeePaymentStatus.PARTIAL
              : StudentFeePaymentStatus.UNPAID,
        uiStatus: item.canPay ? "PAY_NOW" : "PAID",
        dueDate: item.dueDate,
        feeStatus: overdue.status,
        daysOverdue: overdue.daysOverdue
      };
    });

    const totalFeeRupees = breakdown.reduce((s, r) => s + r.amountRupees, 0);
    const paidRupees = breakdown.reduce((s, r) => s + r.paidRupees, 0);
    const pendingRupees = Math.max(totalFeeRupees - paidRupees, 0);

    const payments = await this.prisma.feePayment.findMany({
      where: { studentProfileId, status: FeePaymentStatus.ACTIVE },
      include: {
        feeHead: true,
        studentFeeAssignment: { include: { feeStructure: { include: { feeHead: true } } } }
      },
      orderBy: { paidAt: "desc" }
    });

    const assignmentDue = new Map(
      assignments.map((a) => [a.id, { due: Number(a.feeStructure.amount), feeHead: a.feeStructure.feeHeadName ?? a.feeStructure.feeHead.name }])
    );

    const paymentHistory = payments.map((p) => {
      const feeHead =
        p.studentFeeAssignment?.feeStructure.feeHeadName ??
        p.studentFeeAssignment?.feeStructure.feeHead.name ??
        p.feeHead.name;
      const assignId = p.studentFeeAssignmentId;
      const due = assignId ? assignmentDue.get(assignId)?.due : null;
      const amountRupees = Number(p.amount);
      const paidPercentOfFee =
        due && due > 0 ? Math.min(100, Math.round((amountRupees / due) * 10000) / 100) : null;
      const coverageLabel =
        paidPercentOfFee !== null && paidPercentOfFee >= 99.99 ? "Full" : paidPercentOfFee !== null ? "Partial" : "—";

      return {
        id: p.id,
        receiptNo: p.receiptNo,
        feeHead,
        amountRupees,
        paymentMode: p.paymentMode,
        paymentRecordStatus: p.status,
        paidPercentOfFee,
        coverageLabel,
        paidAt: p.paidAt.toISOString(),
        canDownloadReceipt: true
      };
    });

    const cls = student.section.class;
    const campus = cls.batch.branch.program.campus;

    return {
      currency: "INR" as const,
      student: {
        fullName: student.user.fullName,
        rollNumber: student.rollNumber
      },
      section: {
        name: student.section.name,
        code: student.section.code,
        classLabel: cls.label,
        yearNumber: cls.yearNumber,
        semesterNumber: cls.semesterNumber,
        campusName: campus.name,
        campusCode: campus.code
      },
      academicYear: formatReceiptAcademicYear(batch.startYear, batch.endYear),
      summary: {
        outstandingRupees: pendingRupees,
        totalFeeRupees,
        paidRupees,
        pendingRupees
      },
      yearBreakdown,
      breakdown,
      paymentHistory
    };
  }

  private async buildFeeStatusPdfBuffer(
    student: Awaited<ReturnType<typeof loadStudentPortalProfile>>,
    payload: Awaited<ReturnType<StudentPortalFeesService["buildFeePayload"]>>,
    generatedAt: Date
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 44, size: "A4" });
      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c as Buffer));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const left = doc.page.margins.left;

      drawPdfInstitutionalHeader(doc, "Fee status statement");
      doc.moveDown(0.4);
      this.drawStudentBlock(doc, student, payload.section);
      doc.moveDown(0.5);

      let y = drawPdfSectionHeading(doc, "Summary");
      doc.font("Helvetica").fontSize(10).fillColor("#111");
      doc.text(`Total fee: ${formatPdfInr(payload.summary.totalFeeRupees)}`, left, y);
      y = doc.y;
      doc.text(`Paid: ${formatPdfInr(payload.summary.paidRupees)}`, left, y);
      y = doc.y;
      doc.text(`Pending: ${formatPdfInr(payload.summary.pendingRupees)}`, left, y);
      y = doc.y;
      doc.text(`Outstanding balance: ${formatPdfInr(payload.summary.outstandingRupees)}`, left, y);
      y = doc.y + 14;

      y = drawPdfSectionHeading(doc, "Fee structure breakdown", y);
      y = drawPdfTable(
        doc,
        y,
        left,
        [
          { header: "Fee head", width: 220 },
          { header: "Amount", width: 100, align: "right" },
          { header: "Status", width: 80 }
        ],
        payload.breakdown.map((row) => [
          row.feeHead,
          formatPdfInr(row.amountRupees),
          row.uiStatus === "PAID" ? "Paid" : "Pay Now"
        ])
      );

      y = drawPdfSectionHeading(doc, "Payment history", y + 6);
      drawPdfTable(
        doc,
        y,
        left,
        [
          { header: "Receipt", width: 90 },
          { header: "Fee", width: 130 },
          { header: "Amount", width: 90, align: "right" },
          { header: "Mode", width: 60 },
          { header: "Paid at (IST)", width: 120 }
        ],
        payload.paymentHistory.slice(0, 40).map((p) => [
          p.receiptNo,
          p.feeHead,
          formatPdfInr(p.amountRupees),
          formatPdfPaymentMode(p.paymentMode),
          formatIstDateTime(new Date(p.paidAt))
        ])
      );

      doc.fontSize(8).fillColor("#555").text(`Generated at (IST): ${formatPdfTimestamp(generatedAt)}`, left, doc.page.height - 50, {
        align: "left"
      });
      doc.end();
    });
  }

  private drawStudentBlock(
    doc: InstanceType<typeof PDFDocument>,
    student: Awaited<ReturnType<typeof loadStudentPortalProfile>>,
    section: { name: string; code: string | null; classLabel: string; campusName: string }
  ) {
    const left = doc.page.margins.left;
    doc.font("Helvetica").fontSize(10).fillColor("#111");
    doc.text(`Student: ${student.user.fullName}`, left, doc.y, { align: "left" });
    doc.text(`Roll number: ${student.rollNumber}`, left, doc.y, { align: "left" });
    doc.text(`Section: ${section.code ?? section.name} · ${section.classLabel}`, left, doc.y, { align: "left" });
    doc.text(`Campus: ${section.campusName}`, left, doc.y, { align: "left" });
    doc.x = left;
  }
}
