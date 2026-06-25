import PDFDocument from "pdfkit";
import { formatIstDate, formatIstDateTime } from "../common/ist-time.util";
import {
  formatPdfInr,
  formatPdfPaymentMode,
  formatPdfTimestamp,
  resolveFeePaymentTransactionId,
  resolveFeePaymentTransactionLabel,
  resolveKietLogoPath
} from "../common/pdf-institutional.util";

export type StudentReceiptPdfInput = {
  paymentId: string;
  receiptNo: string;
  transactionId?: string | null;
  studentName: string;
  rollNumber: string;
  admissionNumber?: string | null;
  branchName: string;
  academicYear: string;
  feeCategory: string;
  feeType: string;
  amountPaidRupees: number;
  totalFeeRupees?: number | null;
  remainingRupees?: number | null;
  paidAt: Date;
  paymentMode: string;
  paymentStatusLabel: string;
  collectedBy: string;
  remarks?: string | null;
  isPartial: boolean;
};

function drawReceiptField(
  doc: InstanceType<typeof PDFDocument>,
  left: number,
  right: number,
  y: number,
  label: string,
  value: string
) {
  const labelWidth = 148;
  const valueWidth = right - left - labelWidth - 8;
  doc.font("Helvetica").fontSize(9.5).fillColor("#334155").text(`${label}`, left, y, { width: labelWidth, align: "left" });
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a").text(value, left + labelWidth + 8, y, {
    width: valueWidth,
    align: "left"
  });
  const rowHeight = Math.max(
    doc.heightOfString(label, { width: labelWidth }),
    doc.heightOfString(value, { width: valueWidth })
  );
  return y + rowHeight + 10;
}

export function buildStudentReceiptPdfBuffer(input: StudentReceiptPdfInput, generatedAt: Date): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 44, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const transactionRef = resolveFeePaymentTransactionId({
      transactionId: input.transactionId,
      receiptNo: input.receiptNo,
      paymentId: input.paymentId
    });
    const transactionLabel = resolveFeePaymentTransactionLabel(input.paymentMode);
    const modeLabel = formatPdfPaymentMode(input.paymentMode);
    const remarks = input.remarks?.trim() || "Nil";

    let y = doc.page.margins.top;
    const logoPath = resolveKietLogoPath();
    if (logoPath) {
      try {
        doc.image(logoPath, left, y, { width: 96 });
      } catch {
        /* no logo */
      }
    }

    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#64748b")
      .text(input.receiptNo, left, y, { width: right - left, align: "right" });

    y += 58;
    doc.font("Helvetica-Bold").fontSize(14).fillColor("#004b8d").text("Fee payment receipt", left, y, {
      width: right - left,
      align: "center"
    });
    y = doc.y + 16;
    doc.moveTo(left, y).lineTo(right, y).strokeColor("#cbd5e1").lineWidth(0.75).stroke();
    y += 18;

    y = drawReceiptField(doc, left, right, y, "Receipt Number", input.receiptNo);
    y = drawReceiptField(doc, left, right, y, "Student Name", input.studentName);
    y = drawReceiptField(doc, left, right, y, "Roll Number", input.rollNumber);
    y = drawReceiptField(doc, left, right, y, "Admission Number", input.admissionNumber?.trim() || "—");
    y = drawReceiptField(doc, left, right, y, "Branch", input.branchName);
    y = drawReceiptField(doc, left, right, y, "Academic Year", input.academicYear);
    y += 4;
    y = drawReceiptField(doc, left, right, y, "Fee Category", input.feeCategory);
    y = drawReceiptField(doc, left, right, y, "Fee Type", input.feeType);
    y += 4;
    y = drawReceiptField(doc, left, right, y, "Amount Paid", formatPdfInr(input.amountPaidRupees));
    if (input.isPartial && input.totalFeeRupees != null) {
      y = drawReceiptField(doc, left, right, y, "Total Fee", formatPdfInr(input.totalFeeRupees));
    }
    if (input.isPartial && input.remainingRupees != null) {
      y = drawReceiptField(doc, left, right, y, "Remaining Amount", formatPdfInr(input.remainingRupees));
    }
    y = drawReceiptField(doc, left, right, y, "Payment Mode", modeLabel);
    y = drawReceiptField(doc, left, right, y, transactionLabel, transactionRef);
    y = drawReceiptField(doc, left, right, y, "Payment Date & Time", formatIstDateTime(input.paidAt));
    y = drawReceiptField(doc, left, right, y, "Payment Status", input.paymentStatusLabel);
    y = drawReceiptField(doc, left, right, y, "Collected By", input.collectedBy);
    y = drawReceiptField(doc, left, right, y, "Remarks", remarks);

    y += 8;
    doc
      .moveTo(left, y)
      .lineTo(right, y)
      .dash(2, { space: 3 })
      .strokeColor("#cbd5e1")
      .lineWidth(0.5)
      .stroke()
      .undash();
    y += 14;
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#64748b").text("COMPUTER GENERATED · VALID WITHOUT SIGNATURE", left, y, {
      width: right - left,
      align: "center",
      characterSpacing: 0.6
    });

    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#94a3b8")
      .text(`Generated at (IST): ${formatPdfTimestamp(generatedAt)}`, left, doc.page.height - 44, {
        width: right - left,
        align: "center"
      });

    doc.end();
  });
}

/** Compact receipt for payment history lists (legacy card layout). */
export function buildStudentReceiptCardPdfBuffer(input: StudentReceiptPdfInput, generatedAt: Date): Promise<Buffer> {
  return buildStudentReceiptPdfBuffer(input, generatedAt);
}

export function formatReceiptAcademicYear(startYear: number, endYear: number) {
  const endSuffix = String(endYear).slice(-2);
  return `${startYear}-${endSuffix}`;
}

export function formatReceiptDateShort(date: Date) {
  return formatIstDate(date);
}
