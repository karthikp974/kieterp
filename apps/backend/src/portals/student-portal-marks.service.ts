import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, ResultEntryStatus, UserType } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import PDFDocument from "pdfkit";
import { AuthUser } from "../auth/auth.types";
import { formatIstDateTime } from "../common/ist-time.util";
import {
  computeJntukCgpa,
  computeJntukSemesterSgpa,
  jntukCgpaToPercentage,
  jntukGradePoints,
  toResultCredits
} from "../common/jntuk-gpa.util";
import { PrismaService } from "../prisma/prisma.service";
import { StudentMarksPdfQueryDto } from "./student-marks-portal.dto";
import { loadStudentPortalProfile } from "./student-portal-load-student";

type ResultEntryRow = Prisma.ResultEntryGetPayload<{
  include: { subject: { select: { id: true; code: true; name: true } } };
}>;

type ResultLine = {
  id: string;
  examType: string;
  subjectCode: string;
  subjectName: string;
  internals: number | null;
  externals: number | null;
  totalMarks: number | null;
  grade: string | null;
  credits: number | null;
  status: ResultEntryStatus;
  passFail: string;
};

@Injectable()
export class StudentPortalMarksService {
  constructor(private readonly prisma: PrismaService) {}

  assertStudent(user: AuthUser) {
    if (user.type !== UserType.STUDENT) {
      throw new ForbiddenException("Only student accounts can access marks and grades.");
    }
  }

  /** Grouped by `ResultEntry.semesterNumber`; rows are created via manual upsert or `RESULT_PDF_IMPORT` worker (`parseResultRows`). */
  async getMarksPage(user: AuthUser) {
    this.assertStudent(user);
    const student = await loadStudentPortalProfile(this.prisma, user.id);

    const entries = await this.prisma.resultEntry.findMany({
      where: { studentProfileId: student.id, isPublished: true },
      include: {
        subject: { select: { id: true, code: true, name: true } }
      },
      orderBy: [{ semesterNumber: "asc" }, { examType: "asc" }, { subject: { code: "asc" } }]
    });

    const cls = student.section.class;
    const prog = cls.batch.branch.program;

    const semesterMap = new Map<number, ResultEntryRow[]>();
    for (const e of entries) {
      const list = semesterMap.get(e.semesterNumber) ?? [];
      list.push(e);
      semesterMap.set(e.semesterNumber, list);
    }

    const semesters = [...semesterMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([semesterNumber, rows]) => {
        const subjects = rows.map((e) => this.toLine(e));
        const summary = this.semesterSummary(subjects);
        return {
          semesterNumber,
          semesterLabel: this.formatSemesterLabel(semesterNumber),
          summary,
          subjects
        };
      });

    const cumulative = this.cumulativeSummary(entries);

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
        currentSemesterNumber: cls.semesterNumber,
        batchCode: cls.batch.batchCode,
        branchName: cls.batch.branch.name,
        departmentName: prog.name,
        campusName: prog.campus.name
      },
      ingestion: {
        pipeline:
          "Subject marks, grades, and credits are filled via PDF import or HTPO/CTPO manual entry. SGPA and CGPA are computed automatically using JNTUK formulas.",
        jobName: "RESULT_PDF_IMPORT",
        gpaPolicy: "JNTUK R23: SGPA = Σ(Ci×Gi)/ΣCi; CGPA = Σ(Ci×Si)/ΣCi (rounded to 2 decimals)."
      },
      overview: {
        totalResultRows: entries.length,
        semesterCount: semesters.length,
        passed: entries.filter((e) => e.status === ResultEntryStatus.PASS).length,
        failed: entries.filter((e) => e.status === ResultEntryStatus.FAIL).length
      },
      cumulative,
      semesters,
      chart: this.buildMarksChartSeries(entries, semesters)
    };
  }

  private buildMarksChartSeries(
    entries: ResultEntryRow[],
    semesters: { semesterNumber: number; semesterLabel: string; summary: { sgpa: number | null }; subjects: ResultLine[] }[]
  ) {
    const cumulative: ResultEntryRow[] = [];
    return semesters.map((s) => {
      const semRows = entries.filter((e) => e.semesterNumber === s.semesterNumber);
      cumulative.push(...semRows);
      return {
        semesterLabel: s.semesterLabel,
        semesterNumber: s.semesterNumber,
        sgpa: s.summary.sgpa,
        cgpa: computeJntukCgpa(
          cumulative.map((e) => ({
            grade: e.grade,
            credits: e.credits,
            status: e.status,
            semesterNumber: e.semesterNumber
          }))
        ),
        subjects: s.subjects.length
      };
    });
  }

  async exportSemesterPdf(user: AuthUser, query: StudentMarksPdfQueryDto) {
    this.assertStudent(user);
    const student = await loadStudentPortalProfile(this.prisma, user.id);

    const where = {
      studentProfileId: student.id,
      semesterNumber: query.semesterNumber,
      isPublished: true,
      ...(query.examType?.trim() ? { examType: query.examType.trim() } : {})
    };

    const entries = await this.prisma.resultEntry.findMany({
      where,
      include: { subject: { select: { id: true, code: true, name: true } } },
      orderBy: [{ examType: "asc" }, { subject: { code: "asc" } }]
    });

    if (!entries.length) {
      throw new NotFoundException("No result records found for that semester.");
    }

    const cls = student.section.class;
    const prog = cls.batch.branch.program;
    const lines = entries.map((e) => this.toLine(e));
    const summary = this.semesterSummary(lines);

    const allEntries = await this.prisma.resultEntry.findMany({
      where: { studentProfileId: student.id, isPublished: true },
      include: { subject: { select: { id: true, code: true, name: true } } }
    });
    const cumulative = this.cumulativeSummary(allEntries);

    const buffer = await this.buildMarksPdfBuffer(
      {
        studentName: student.user.fullName,
        rollNumber: student.rollNumber,
        sectionLabel: `${cls.label} · ${student.section.name}`,
        campus: prog.campus.name,
        semesterLabel: this.formatSemesterLabel(query.semesterNumber),
        examFilter: query.examType?.trim() ?? null,
        generatedAt: new Date()
      },
      summary,
      cumulative,
      lines
    );

    const safeSem = String(query.semesterNumber);
    return {
      buffer,
      contentType: "application/pdf",
      filename: `marks-semester-${safeSem}.pdf`
    };
  }

  private toLine(e: ResultEntryRow): ResultLine {
    return {
      id: e.id,
      examType: e.examType,
      subjectCode: e.subject.code,
      subjectName: e.subject.name,
      internals: e.internals === null ? null : Number(e.internals),
      externals: e.externals === null ? null : Number(e.externals),
      totalMarks: e.totalMarks === null ? null : Number(e.totalMarks),
      grade: e.grade,
      credits: e.credits === null ? null : Number(e.credits),
      status: e.status,
      passFail:
        e.status === ResultEntryStatus.PASS
          ? "Pass"
          : e.status === ResultEntryStatus.FAIL
            ? "Fail"
            : e.status === ResultEntryStatus.ABSENT
              ? "Absent"
              : "Withheld"
    };
  }

  private semesterSummary(lines: ResultLine[]) {
    const gpaLines = lines.map((r) => ({ grade: r.grade, credits: r.credits, status: r.status }));
    const creditsAttempted = gpaLines.reduce((sum, line) => {
      if (jntukGradePoints(line.grade, line.status) === null) return sum;
      const credits = toResultCredits(line.credits);
      return credits > 0 ? sum + credits : sum;
    }, 0);
    const creditsEarned = lines.reduce((s, r) => s + (r.status === ResultEntryStatus.PASS && r.credits ? r.credits : 0), 0);
    const sgpa = computeJntukSemesterSgpa(gpaLines);
    const weightedMarks = this.weightedTotalMarks(lines);
    return { creditsAttempted, creditsEarned, sgpa, weightedMarksAvg: weightedMarks.avg, weightedMarksBasis: weightedMarks.basis };
  }

  private cumulativeSummary(entries: ResultEntryRow[]) {
    const gpaLines = entries.map((e) => ({
      grade: e.grade,
      credits: e.credits,
      status: e.status,
      semesterNumber: e.semesterNumber
    }));
    const creditsEarned = entries.reduce((s, e) => s + (e.status === ResultEntryStatus.PASS && e.credits ? Number(e.credits) : 0), 0);
    const cgpa = computeJntukCgpa(gpaLines);
    const weightedMarks = this.weightedTotalMarks(entries.map((e) => this.toLine(e)));
    return {
      creditsEarned,
      cgpa,
      equivalentPercentage: jntukCgpaToPercentage(cgpa),
      weightedMarksAvg: weightedMarks.avg,
      weightedMarksBasis: weightedMarks.basis
    };
  }

  private weightedTotalMarks(lines: Pick<ResultLine, "totalMarks" | "credits" | "status">[]): { avg: number | null; basis: string } {
    let num = 0;
    let den = 0;
    for (const r of lines) {
      if (r.status !== ResultEntryStatus.PASS || r.totalMarks === null || !r.credits || r.credits <= 0) continue;
      num += r.totalMarks * r.credits;
      den += r.credits;
    }
    if (!den) return { avg: null, basis: "credit_weighted_total_marks" };
    return { avg: Math.round((num / den) * 100) / 100, basis: "credit_weighted_total_marks" };
  }

  /** e.g. semester 3 → "2.1" (year.part). */
  private formatSemesterLabel(semesterNumber: number) {
    const year = Math.floor((semesterNumber - 1) / 2) + 1;
    const part = ((semesterNumber - 1) % 2) + 1;
    return `${year}.${part}`;
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

  private async buildMarksPdfBuffer(
    meta: {
      studentName: string;
      rollNumber: string;
      sectionLabel: string;
      campus: string;
      semesterLabel: string;
      examFilter: string | null;
      generatedAt: Date;
    },
    semesterSummary: { creditsEarned: number; creditsAttempted: number; sgpa: number | null; weightedMarksAvg: number | null },
    cumulative: { creditsEarned: number; cgpa: number | null; equivalentPercentage: number | null; weightedMarksAvg: number | null },
    lines: ResultLine[]
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 44, size: "A4" });
      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c as Buffer));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const logoPath = this.resolveLogoPath();
      if (logoPath) {
        try {
          doc.image(logoPath, doc.x, doc.y, { width: 110 });
          doc.moveDown(1.2);
        } catch {
          /* no logo */
        }
      }

      doc.fontSize(16).fillColor("#004b8d").text("Statement of grades", { align: "center" });
      doc.moveDown(0.35);
      doc.fontSize(11).fillColor("#333").text(`Semester ${meta.semesterLabel}`, { align: "center" });
      if (meta.examFilter) {
        doc.fontSize(9).text(`Exam type: ${meta.examFilter}`, { align: "center" });
      }
      doc.moveDown(0.8);

      doc.font("Helvetica").fontSize(10).fillColor("#111");
      doc.text(`Student: ${meta.studentName}`);
      doc.text(`Roll number: ${meta.rollNumber}`);
      doc.text(`Section: ${meta.sectionLabel}`);
      doc.text(`Campus: ${meta.campus}`);
      doc.moveDown(0.4);
      doc.fontSize(9).fillColor("#555").text(`Generated at (IST): ${formatIstDateTime(meta.generatedAt)}`);
      doc.moveDown(0.8);

      doc.font("Helvetica-Bold").fontSize(11).fillColor("#004b8d").text("Summary");
      doc.font("Helvetica").fontSize(10).fillColor("#111");
      doc.text(`Semester SGPA (JNTUK): ${semesterSummary.sgpa ?? "—"}`);
      doc.text(`Semester credits earned / attempted: ${semesterSummary.creditsEarned} / ${semesterSummary.creditsAttempted}`);
      doc.text(`Semester weighted avg (total marks × credits): ${semesterSummary.weightedMarksAvg ?? "—"}`);
      doc.moveDown(0.3);
      doc.text(`Cumulative CGPA (JNTUK): ${cumulative.cgpa ?? "—"}`);
      if (cumulative.equivalentPercentage != null) {
        doc.text(`Equivalent percentage (R16+): ${cumulative.equivalentPercentage}%`);
      }
      doc.text(`Cumulative credits earned: ${cumulative.creditsEarned}`);
      doc.text(`Cumulative weighted avg (total marks): ${cumulative.weightedMarksAvg ?? "—"}`);
      doc.moveDown(0.9);

      doc.font("Helvetica-Bold").fontSize(11).fillColor("#004b8d").text("Subject-wise results");
      doc.moveDown(0.35);

      const c0 = 50;
      const c1 = 120;
      const c2 = 320;
      const c3 = 400;
      const c4 = 470;
      let y = doc.y;
      doc.font("Helvetica-Bold").fontSize(8);
      doc.text("Code", c0, y);
      doc.text("Subject", c1, y, { width: 190 });
      doc.text("Internals", c2, y, { width: 58 });
      doc.text("Grade", c3, y, { width: 48 });
      doc.text("Credit", c4, y, { width: 42 });
      y += 14;
      doc.moveTo(44, y).lineTo(555, y).strokeColor("#dbe3ef").lineWidth(0.4).stroke();
      y += 6;
      doc.font("Helvetica").fontSize(8).fillColor("#222");

      for (const row of lines) {
        if (y > 720) {
          doc.addPage();
          y = 50;
        }
        doc.text(row.subjectCode.slice(0, 12), c0, y, { width: 62 });
        doc.text(row.subjectName.slice(0, 42), c1, y, { width: 190 });
        doc.text(row.internals === null ? "—" : String(row.internals), c2, y, { width: 58 });
        doc.text(row.grade ?? "—", c3, y, { width: 48 });
        doc.text(row.credits === null ? "—" : String(row.credits), c4, y, { width: 42 });
        y += 14;
      }

      doc.end();
    });
  }
}
