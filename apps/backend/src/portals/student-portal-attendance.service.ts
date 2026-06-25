import { ForbiddenException, BadRequestException, Injectable } from "@nestjs/common";
import { AttendanceEntryStatus, UserType } from "@prisma/client";
import ExcelJS from "exceljs";
import * as fs from "fs";
import * as path from "path";
import PDFDocument from "pdfkit";
import { AuthUser } from "../auth/auth.types";
import { toPagination } from "../common/pagination.dto";
import {
  formatIstDate,
  formatIstDateTime,
  istDayRangeFromIso,
  istMonthBucketLabel,
  istMonthLabelsBetween,
  istMonthRange,
  istMonthsAgoStart
} from "../common/ist-time.util";
import { formatSemesterLabel } from "../common/semester-label.util";
import { PrismaService } from "../prisma/prisma.service";
import { StudentAttendanceExportQueryDto, StudentAttendanceExportRange, StudentAttendanceMonthPeriod, StudentAttendancePageQueryDto } from "./student-attendance-portal.dto";
import { loadStudentPortalProfile } from "./student-portal-load-student";

const EXPORT_ROW_CAP = 5000;

type EntryRow = {
  id: string;
  status: AttendanceEntryStatus;
  session: {
    attendanceDate: Date;
    markedBy: { fullName: string };
    class: { semesterNumber: number; label: string };
    programId: string;
  };
};

type AttendanceStatBlock = { total: number; present: number; absent: number; percentage: number | null };

@Injectable()
export class StudentPortalAttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  assertStudent(user: AuthUser) {
    if (user.type !== UserType.STUDENT) {
      throw new ForbiddenException("Only student accounts can access student attendance.");
    }
  }

  async getAttendancePage(user: AuthUser, query: StudentAttendancePageQueryDto) {
    this.assertStudent(user);
    const student = await loadStudentPortalProfile(this.prisma, user.id);
    const pagination = toPagination(query);
    const now = new Date();
    const month = istMonthRange(now);
    const programId = student.section.class.batch.branch.programId;
    const currentSemesterNumber = student.section.class.semesterNumber;

    const sixMonthsStart = istMonthsAgoStart(5, now);

    const [monthEntries, overallEntries, semesterEntries, trendEntries, breakdownEntries, chartEntries, historyTotal, historyItems] =
      await Promise.all([
        this.prisma.attendanceEntry.findMany({
          where: {
            studentProfileId: student.id,
            session: { attendanceDate: { gte: month.start, lte: month.end } }
          },
          select: { status: true }
        }),
        this.prisma.attendanceEntry.findMany({
          where: { studentProfileId: student.id },
          select: { status: true }
        }),
        this.prisma.attendanceEntry.findMany({
          where: {
            studentProfileId: student.id,
            session: { programId, class: { semesterNumber: currentSemesterNumber } }
          },
          select: { status: true }
        }),
        this.prisma.attendanceEntry.findMany({
          where: {
            studentProfileId: student.id,
            session: { attendanceDate: { gte: sixMonthsStart, lte: month.end } }
          },
          select: { status: true, session: { select: { attendanceDate: true } } }
        }),
        this.prisma.attendanceEntry.findMany({
          where: { studentProfileId: student.id },
          select: {
            status: true,
            session: { select: { class: { select: { semesterNumber: true, label: true } } } }
          }
        }),
        this.prisma.attendanceEntry.findMany({
          where: { studentProfileId: student.id },
          select: {
            status: true,
            session: {
              select: {
                attendanceDate: true,
                class: { select: { semesterNumber: true } }
              }
            }
          }
        }),
        this.prisma.attendanceEntry.count({ where: { studentProfileId: student.id } }),
        this.prisma.attendanceEntry.findMany({
          where: { studentProfileId: student.id },
          include: {
            session: {
              select: {
                attendanceDate: true,
                programId: true,
                markedBy: { select: { fullName: true } },
                class: { select: { semesterNumber: true, label: true } }
              }
            }
          },
          orderBy: { session: { attendanceDate: "desc" } },
          skip: pagination.skip,
          take: pagination.take
        })
      ]);

    const thisMonth = this.attendanceStats(monthEntries);
    const overall = this.attendanceStats(overallEntries);
    const semester = this.attendanceStats(semesterEntries);

    const monthlyTrend = this.bucketMonthlyTrend(trendEntries, sixMonthsStart, month.end);
    const semesterBreakdown = this.bucketSemesterBreakdown(breakdownEntries);

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
      thisMonth: {
        ...thisMonth,
        monthLabel: month.label
      },
      overall: { ...overall, label: "All recorded days" },
      semester: {
        ...semester,
        semesterNumber: currentSemesterNumber,
        classLabel: cls.label,
        label: `Semester ${currentSemesterNumber} (same program)`
      },
      semesterBreakdown,
      monthlyTrend,
      chartEntries: chartEntries.map((row) => ({
        date: formatIstDate(row.session.attendanceDate),
        status: row.status,
        semesterNumber: row.session.class.semesterNumber
      })),
      history: {
        total: historyTotal,
        page: pagination.page,
        pageSize: pagination.pageSize,
        items: historyItems.map((row) => this.toHistoryItem(row as EntryRow))
      }
    };
  }

  async exportAttendance(user: AuthUser, query: StudentAttendanceExportQueryDto) {
    this.assertStudent(user);
    const student = await loadStudentPortalProfile(this.prisma, user.id);
    const rowLimit = Math.min(query.rowLimit ?? 2000, EXPORT_ROW_CAP);
    const now = new Date();
    const month = istMonthRange(now);
    const programId = student.section.class.batch.branch.programId;
    const currentSemesterNumber = student.section.class.semesterNumber;

    const where = this.exportWhere(query, student.id, { month, programId, currentSemesterNumber, now });

    const rows = (await this.prisma.attendanceEntry.findMany({
      where,
      include: {
        session: {
          select: {
            attendanceDate: true,
            programId: true,
            markedBy: { select: { fullName: true } },
            class: { select: { semesterNumber: true, label: true } }
          }
        }
      },
      orderBy: { session: { attendanceDate: "desc" } },
      take: rowLimit
    })) as EntryRow[];

    const monthEntries = await this.prisma.attendanceEntry.findMany({
      where: {
        studentProfileId: student.id,
        session: { attendanceDate: { gte: month.start, lte: month.end } }
      },
      select: { status: true }
    });
    const overallEntries = await this.prisma.attendanceEntry.findMany({
      where: { studentProfileId: student.id },
      select: { status: true }
    });
    const exportSemesterNumber = this.resolveExportSemesterNumber(query, currentSemesterNumber);

    const semesterEntries = await this.prisma.attendanceEntry.findMany({
      where: {
        studentProfileId: student.id,
        session: { programId, class: { semesterNumber: exportSemesterNumber } }
      },
      select: { status: true }
    });

    const summaries = {
      thisMonth: this.attendanceStats(monthEntries),
      overall: this.attendanceStats(overallEntries),
      semester: this.attendanceStats(semesterEntries)
    };

    const monthRange = this.resolveMonthExportRange(query.monthPeriod, now, query.dateFrom, query.dateTo);
    const semesterExportLabel = this.semesterExportLabel(exportSemesterNumber, currentSemesterNumber);

    const meta = {
      studentName: student.user.fullName,
      rollNumber: student.rollNumber,
      sectionLabel: `${student.section.class.label} · ${student.section.name}`,
      campus: student.section.class.batch.branch.program.campus.name,
      rangeLabel:
        query.range === "month"
          ? `Monthly export (${monthRange.label})`
          : query.range === "semester"
            ? `Semester ${semesterExportLabel}`
            : "Overall (all days)",
      generatedAt: new Date()
    };

    const fileTag =
      query.range === "month"
        ? `month-${query.monthPeriod ?? "last_1_month"}`
        : query.range === "semester"
          ? `semester-${exportSemesterNumber}`
          : "overall";

    if (query.format === "xlsx") {
      const buffer = await this.buildXlsxBuffer(meta, summaries, rows, query.range);
      return {
        buffer,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename: `attendance-${fileTag}.xlsx`
      };
    }

    const buffer = await this.buildPdfBuffer(meta, summaries, rows, query.range);
    return {
      buffer,
      contentType: "application/pdf",
      filename: `attendance-${fileTag}.pdf`
    };
  }

  private resolveMonthExportRange(
    period: StudentAttendanceMonthPeriod | undefined,
    now: Date,
    dateFrom?: string,
    dateTo?: string
  ) {
    const current = istMonthRange(now);
    if (period === "last_3_months") {
      const start = istMonthsAgoStart(2, now);
      return { start, end: current.end, label: "Last 3 months" };
    }
    if (period === "last_6_months") {
      const start = istMonthsAgoStart(5, now);
      return { start, end: current.end, label: "Last 6 months" };
    }
    if (period === "custom" && dateFrom) {
      const { start, end } = istDayRangeFromIso(dateFrom, dateTo);
      return {
        start,
        end,
        label: dateTo && dateTo !== dateFrom ? `${dateFrom} to ${dateTo}` : dateFrom
      };
    }
    return { start: current.start, end: current.end, label: current.label };
  }

  private exportWhere(
    query: StudentAttendanceExportQueryDto,
    studentProfileId: string,
    ctx: {
      month: { start: Date; end: Date };
      programId: string;
      currentSemesterNumber: number;
      now: Date;
    }
  ) {
    if (query.range === "month") {
      const range = this.resolveMonthExportRange(query.monthPeriod, ctx.now, query.dateFrom, query.dateTo);
      return {
        studentProfileId,
        session: { attendanceDate: { gte: range.start, lte: range.end } }
      };
    }
    if (query.range === "semester") {
      const semesterNumber = this.resolveExportSemesterNumber(query, ctx.currentSemesterNumber);
      return {
        studentProfileId,
        session: { programId: ctx.programId, class: { semesterNumber } }
      };
    }
    return { studentProfileId };
  }

  private toHistoryItem(row: EntryRow) {
    const s = row.session;
    return {
      id: row.id,
      date: formatIstDate(s.attendanceDate),
      status: row.status,
      facultyName: s.markedBy.fullName,
      semesterNumber: s.class.semesterNumber,
      classLabel: s.class.label
    };
  }

  private attendanceStats(rows: { status: AttendanceEntryStatus }[]): AttendanceStatBlock {
    const total = rows.length;
    const present = rows.filter((r) => r.status === AttendanceEntryStatus.PRESENT).length;
    const absent = total - present;
    const percentage = total ? Math.round((present / total) * 10000) / 100 : null;
    return { total, present, absent, percentage };
  }

  private bucketMonthlyTrend(
    rows: { status: AttendanceEntryStatus; session: { attendanceDate: Date } }[],
    rangeStart: Date,
    rangeEnd: Date
  ) {
    const labels = istMonthLabelsBetween(rangeStart, rangeEnd);
    const map = new Map<string, { total: number; present: number }>();
    for (const label of labels) map.set(label, { total: 0, present: 0 });

    for (const row of rows) {
      const label = istMonthBucketLabel(row.session.attendanceDate);
      const bucket = map.get(label);
      if (!bucket) continue;
      bucket.total += 1;
      if (row.status === AttendanceEntryStatus.PRESENT) bucket.present += 1;
    }

    return labels.map((monthLabel) => {
      const b = map.get(monthLabel)!;
      const percentage = b.total ? Math.round((b.present / b.total) * 10000) / 100 : null;
      return { monthLabel, total: b.total, present: b.present, absent: b.total - b.present, percentage };
    });
  }

  private bucketSemesterBreakdown(rows: { status: AttendanceEntryStatus; session: { class: { semesterNumber: number; label: string } } }[]) {
    const map = new Map<number, { total: number; present: number; classLabel: string }>();
    for (const row of rows) {
      const sem = row.session.class.semesterNumber;
      const cur = map.get(sem) ?? { total: 0, present: 0, classLabel: row.session.class.label };
      cur.total += 1;
      if (row.status === AttendanceEntryStatus.PRESENT) cur.present += 1;
      cur.classLabel = row.session.class.label;
      map.set(sem, cur);
    }
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([semesterNumber, v]) => ({
        semesterNumber,
        classLabel: v.classLabel,
        total: v.total,
        present: v.present,
        absent: v.total - v.present,
        percentage: v.total ? Math.round((v.present / v.total) * 10000) / 100 : null
      }));
  }

  private resolveExportSemesterNumber(
    query: StudentAttendanceExportQueryDto,
    currentSemesterNumber: number
  ): number {
    const target = query.semesterNumber ?? currentSemesterNumber;
    if (!Number.isInteger(target) || target < 1 || target > currentSemesterNumber) {
      throw new BadRequestException("Choose a valid semester for export.");
    }
    return target;
  }

  private semesterExportLabel(semesterNumber: number, currentSemesterNumber: number) {
    const label = formatSemesterLabel(semesterNumber);
    return semesterNumber === currentSemesterNumber ? `${label} (ongoing sem)` : label;
  }

  private resolveLogoPath(): string | null {
    const candidates = [
      path.join(__dirname, "..", "assets", "kiet-logo.png"),
      path.join(process.cwd(), "src", "assets", "kiet-logo.png"),
      path.join(process.cwd(), "assets", "kiet-logo.png"),
      path.join(process.cwd(), "..", "frontend", "public", "kiet-logo.png")
    ];
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) return p;
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  private async buildPdfBuffer(
    meta: {
      studentName: string;
      rollNumber: string;
      sectionLabel: string;
      campus: string;
      rangeLabel: string;
      generatedAt: Date;
    },
    summaries: { thisMonth: AttendanceStatBlock; overall: AttendanceStatBlock; semester: AttendanceStatBlock },
    rows: EntryRow[],
    range: StudentAttendanceExportRange
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 44, size: "A4" });
      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c as Buffer));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const logoPath = this.resolveLogoPath();
      let y = doc.y;
      if (logoPath) {
        try {
          doc.image(logoPath, doc.x, y, { width: 110 });
          y = doc.y + 8;
        } catch {
          y = doc.y;
        }
      }

      doc.fontSize(16).fillColor("#004b8d").text("Attendance report", { align: "center" });
      doc.moveDown(0.4);
      doc.fontSize(10).fillColor("#333333").text(meta.rangeLabel, { align: "center" });
      doc.moveDown(1);

      doc.fontSize(11).fillColor("#111111");
      doc.text(`Student: ${meta.studentName}`);
      doc.text(`Roll number: ${meta.rollNumber ?? "—"}`);
      doc.text(`Section: ${meta.sectionLabel}`);
      doc.text(`Campus: ${meta.campus}`);
      doc.moveDown(0.6);
      doc.fontSize(9).fillColor("#555555").text(`Generated at (IST): ${formatIstDateTime(meta.generatedAt)}`);
      doc.moveDown(1);

      doc.fontSize(12).fillColor("#004b8d").text("Summary");
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor("#111111");
      doc.text(
        `This month: ${summaries.thisMonth.percentage ?? "—"}% (${summaries.thisMonth.present}/${summaries.thisMonth.total} present)`
      );
      doc.text(
        `Current semester: ${summaries.semester.percentage ?? "—"}% (${summaries.semester.present}/${summaries.semester.total} present)`
      );
      doc.text(`Overall: ${summaries.overall.percentage ?? "—"}% (${summaries.overall.present}/${summaries.overall.total} present)`);
      doc.moveDown(1);

      doc.fontSize(12).fillColor("#004b8d").text(`Attendance detail (${range})`);
      doc.moveDown(0.4);
      doc.fontSize(9).fillColor("#111111");

      const tableTop = doc.y;
      const colDate = 72;
      const colFac = 200;
      const colSt = 460;

      doc.font("Helvetica-Bold").fontSize(9).fillColor("#004b8d");
      doc.text("Date", colDate, tableTop, { width: 96 });
      doc.text("Faculty", colFac, tableTop, { width: 240 });
      doc.text("Status", colSt, tableTop, { width: 60 });
      let rowY = tableTop + 14;
      doc.moveTo(44, rowY).lineTo(550, rowY).strokeColor("#dbe3ef").lineWidth(0.5).stroke();
      rowY += 6;

      doc.font("Helvetica").fontSize(9).fillColor("#222222");
      for (const row of rows) {
        if (rowY > 720) {
          doc.addPage();
          rowY = 50;
        }
        const s = row.session;
        const dateStr = formatIstDate(s.attendanceDate);
        const status = row.status === AttendanceEntryStatus.PRESENT ? "Present" : "Absent";
        doc.text(dateStr, colDate, rowY, { width: 96 });
        doc.text(s.markedBy.fullName.slice(0, 36), colFac, rowY, { width: 240 });
        doc.text(status, colSt, rowY, { width: 60 });
        rowY += 16;
      }

      doc.end();
    });
  }

  private async buildXlsxBuffer(
    meta: {
      studentName: string;
      rollNumber: string;
      sectionLabel: string;
      campus: string;
      rangeLabel: string;
      generatedAt: Date;
    },
    summaries: { thisMonth: AttendanceStatBlock; overall: AttendanceStatBlock; semester: AttendanceStatBlock },
    rows: EntryRow[],
    range: StudentAttendanceExportRange
  ) {
    const wb = new ExcelJS.Workbook();
    wb.creator = "College ERP";
    const ws = wb.addWorksheet("Attendance", { views: [{ state: "frozen", ySplit: 14 }] });

    ws.getCell("A1").value = "KIET Group of Institutions";
    ws.getCell("A1").font = { size: 14, bold: true, color: { argb: "FF004B8D" } };
    ws.mergeCells("A1:C1");
    ws.getCell("A2").value = meta.rangeLabel;
    ws.mergeCells("A2:C2");
    ws.getCell("A4").value = "Student";
    ws.getCell("B4").value = meta.studentName;
    ws.getCell("A5").value = "Roll number";
    ws.getCell("B5").value = meta.rollNumber ?? "—";
    ws.getCell("A6").value = "Section / class";
    ws.getCell("B6").value = meta.sectionLabel;
    ws.getCell("A7").value = "Campus";
    ws.getCell("B7").value = meta.campus;
    ws.getCell("A8").value = "Generated at (IST)";
    ws.getCell("B8").value = formatIstDateTime(meta.generatedAt, false);

    ws.getCell("A10").value = "This month %";
    ws.getCell("B10").value = summaries.thisMonth.percentage ?? "—";
    ws.getCell("C10").value = `${summaries.thisMonth.present} / ${summaries.thisMonth.total}`;

    ws.getCell("A11").value = "Semester %";
    ws.getCell("B11").value = summaries.semester.percentage ?? "—";
    ws.getCell("C11").value = `${summaries.semester.present} / ${summaries.semester.total}`;

    ws.getCell("A12").value = "Overall %";
    ws.getCell("B12").value = summaries.overall.percentage ?? "—";
    ws.getCell("C12").value = `${summaries.overall.present} / ${summaries.overall.total}`;

    const headerRow = 14;
    const headers = ["Date", "Faculty", "Status"];
    headers.forEach((h, i) => {
      const cell = ws.getCell(headerRow, i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF004B8D" } };
    });

    let r = headerRow + 1;
    for (const row of rows) {
      const s = row.session;
      ws.getCell(r, 1).value = formatIstDate(s.attendanceDate);
      ws.getCell(r, 2).value = s.markedBy.fullName;
      ws.getCell(r, 3).value = row.status === AttendanceEntryStatus.PRESENT ? "Present" : "Absent";
      r += 1;
    }

    ws.columns = [{ width: 12 }, { width: 28 }, { width: 10 }];

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }
}
