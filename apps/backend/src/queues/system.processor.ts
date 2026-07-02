import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, forwardRef } from "@nestjs/common";
import { PermissionAction, Prisma, UserStatus } from "@prisma/client";
import { Job } from "bullmq";
import { readFile, unlink } from "fs/promises";
import { PDFParse } from "pdf-parse";
import { AuthUser } from "../auth/auth.types";
import { PermissionsService } from "../permissions/permissions.service";
import { studentProfileToScope, studentScopeProfileInclude } from "../permissions/operational-scope.util";
import { PrismaService } from "../prisma/prisma.service";
import { ParsedResultRow, parseResultRows } from "../results/result-pdf-parser";
import {
  loadTeacherResultImportSectionIds,
  shouldScopeResultImportToTeacherSections
} from "../results/results-import-scope.util";
import { resolveResultSubjectByCodeForSemesters } from "../results/results-subject.util";
import { StudentsService } from "../students/students.service";
import type { CreateStudentDto } from "../students/students.dto";
import { RESULT_PDF_IMPORT_JOB, SESSION_CLEANUP_JOB, STUDENT_BULK_IMPORT_JOB, SYSTEM_QUEUE } from "./queue.constants";
import { RESULTS_IMPORT_INTERRUPTED_MESSAGE } from "../results/results-import.constants";

type StudentBulkImportPayload = {
  students: CreateStudentDto[];
  requestedById: string;
};

type ImportProgress = {
  phase: "queued" | "parsing" | "importing";
  processed: number;
  total: number;
  percent: number;
};

function importingPercent(processed: number, total: number) {
  if (!total) return 15;
  return Math.min(99, 15 + Math.round((processed / total) * 84));
}

const IMPORT_PROGRESS_WRITE_MS = 350;
const IMPORT_CANCEL_CHECK_EVERY = 40;

type ResultPdfImportPayload = {
  filePath: string;
  originalName: string;
  examType: string;
  user: AuthUser;
};

type ImportStudent = Prisma.StudentProfileGetPayload<{ include: typeof studentScopeProfileInclude }>;

@Processor(SYSTEM_QUEUE)
export class SystemProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    @Inject(forwardRef(() => StudentsService))
    private readonly students: StudentsService
  ) {
    super();
  }

  async process(job: Job) {
    // Repeatable housekeeping job has no BackgroundJobRecord — handle before the
    // import-record machinery below.
    if (job.name === SESSION_CLEANUP_JOB) {
      return this.cleanupExpiredSessions();
    }
    await this.assertImportActive(String(job.id));
    await this.prisma.backgroundJobRecord.updateMany({
      where: { externalId: job.id },
      data: {
        status: "running",
        result: {
          progress: { phase: "parsing", processed: 0, total: 0, percent: 10 } satisfies ImportProgress
        } as Prisma.InputJsonObject
      }
    });

    try {
      const result =
        job.name === RESULT_PDF_IMPORT_JOB
          ? await this.processResultPdf(String(job.id), job.data as ResultPdfImportPayload)
          : job.name === STUDENT_BULK_IMPORT_JOB
            ? await this.processStudentBulkImport(String(job.id), job.data as StudentBulkImportPayload)
            : { ok: true, jobName: job.name };
      await this.assertImportActive(String(job.id));
      const summary = result as {
        parsed?: number;
        imported?: number;
        skipped?: number;
      };
      const parsedTotal = summary.parsed ?? 0;
      await this.prisma.backgroundJobRecord.updateMany({
        where: { externalId: job.id },
        data: {
          status: "completed",
          result: {
            ...(result as Record<string, unknown>),
            progress: {
              phase: "importing",
              processed: parsedTotal,
              total: parsedTotal,
              percent: 100
            } satisfies ImportProgress
          } as Prisma.InputJsonObject
        }
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Background job failed.";
      const cancelled = message.includes("interrupted") || message.includes("cancelled");
      await this.prisma.backgroundJobRecord.updateMany({
        where: { externalId: job.id },
        data: {
          status: "failed",
          error: cancelled ? RESULTS_IMPORT_INTERRUPTED_MESSAGE : message
        }
      });
      throw error;
    }
  }

  /** Delete AuthSession rows past expiry (cascades to linked rows by schema design). */
  private async cleanupExpiredSessions() {
    const { count } = await this.prisma.authSession.deleteMany({
      where: { expiresAt: { lt: new Date() } }
    });
    return { ok: true, deletedSessions: count };
  }

  private async assertImportActive(importJobId: string) {
    const job = await this.prisma.backgroundJobRecord.findUnique({
      where: { id: importJobId },
      select: { status: true, result: true }
    });
    if (!job) throw new Error(RESULTS_IMPORT_INTERRUPTED_MESSAGE);
    if (job.status === "failed") throw new Error(RESULTS_IMPORT_INTERRUPTED_MESSAGE);
    if ((job.result as { cancelled?: boolean } | null)?.cancelled) {
      throw new Error(RESULTS_IMPORT_INTERRUPTED_MESSAGE);
    }
  }

  private async processResultPdf(importJobId: string, payload: ResultPdfImportPayload) {
    const recordId = await this.resolveImportRecordId(importJobId);
    await this.updateImportProgress(recordId, { phase: "parsing", processed: 0, total: 0, percent: 10 });
    await this.assertImportActive(recordId);

    let parsedRows: ParsedResultRow[] = [];
    try {
      if (payload.filePath.toLowerCase().endsWith(".txt")) {
        const text = await readFile(payload.filePath, "utf8");
        parsedRows = parseResultRows(text);
      } else {
        const file = await readFile(payload.filePath);
        const parser = new PDFParse({ data: file });
        try {
          const parsed = await parser.getText();
          parsedRows = parseResultRows(parsed.text);
        } finally {
          await parser.destroy();
        }
      }
    } finally {
      await unlink(payload.filePath).catch(() => undefined);
    }

    await this.assertImportActive(recordId);

    const total = parsedRows.length;
    await this.updateImportProgress(
      recordId,
      { phase: "importing", processed: 0, total, percent: 15 },
      { parsed: total, imported: 0, skipped: 0 }
    );

    const teacherSectionIds = shouldScopeResultImportToTeacherSections(payload.user)
      ? await loadTeacherResultImportSectionIds(this.prisma, payload.user.id)
      : null;

    const uniqueRolls = [...new Set(parsedRows.map((row) => row.rollNumber.toUpperCase()))];
    const studentByRoll = new Map<string, ImportStudent>();
    for (let index = 0; index < uniqueRolls.length; index += 400) {
      const chunk = uniqueRolls.slice(index, index + 400);
      const batch = await this.prisma.studentProfile.findMany({
        where: {
          currentStatus: UserStatus.ACTIVE,
          ...(teacherSectionIds ? { sectionId: { in: teacherSectionIds.length ? teacherSectionIds : ["__none__"] } } : {}),
          OR: chunk.map((rollNumber) => ({ rollNumber: { equals: rollNumber, mode: "insensitive" as const } }))
        },
        include: studentScopeProfileInclude
      });
      for (const student of batch) {
        studentByRoll.set(student.rollNumber.toUpperCase(), student);
      }
    }
    const subjectCache = new Map<string, Awaited<ReturnType<typeof resolveResultSubjectByCodeForSemesters>>>();
    const permissionCache = new Map<string, boolean>();

    const summary = {
      parsed: total,
      imported: 0,
      skipped: 0,
      errors: [] as string[],
      importedRollNumbers: [] as string[],
      missingRollNumbersFromPdf: [] as string[]
    };
    let processed = 0;
    let lastProgressWrite = 0;

    for (const row of parsedRows) {
      if (processed > 0 && processed % IMPORT_CANCEL_CHECK_EVERY === 0) {
        await this.assertImportActive(recordId);
      }

      try {
        const student = studentByRoll.get(row.rollNumber.toUpperCase());
        if (!student) {
          summary.skipped += 1;
          if (summary.errors.length < 50) {
            summary.errors.push(
              teacherSectionIds
                ? `${row.rollNumber}: roll not found in your assigned sections`
                : `${row.rollNumber}: student not found or inactive`
            );
          }
        } else {
          const branchId = student.section.class.batch.branchId;
          const currentSemester = student.section.class.semesterNumber;
          const allowedSemesters = [currentSemester, currentSemester - 1].filter((sem) => sem >= 1);
          const subjectKey = `${branchId}:${allowedSemesters.join("-")}:${row.subjectCode.toUpperCase()}`;
          let subject = subjectCache.get(subjectKey);
          if (subject === undefined) {
            subject = await resolveResultSubjectByCodeForSemesters(this.prisma, {
              branchId,
              subjectCode: row.subjectCode,
              semesterNumbers: allowedSemesters
            });
            subjectCache.set(subjectKey, subject);
          }
          if (!subject) {
            summary.skipped += 1;
            if (summary.errors.length < 50) {
              summary.errors.push(
                `${row.rollNumber}/${row.subjectCode}: subject not in semester ${allowedSemesters.join(" or ")}`
              );
            }
          } else {
          const semesterNumber = subject.semesterNumber;

          const scope = studentProfileToScope(student, subject.id);
          const scopeKey = JSON.stringify(scope);
          let allowed = permissionCache.get(scopeKey);
          if (allowed === undefined) {
            allowed = this.permissions.can(payload.user, { action: PermissionAction.UPLOAD_RESULTS, scope }).allowed;
            permissionCache.set(scopeKey, allowed);
          }
          if (!allowed) {
            summary.skipped += 1;
            if (summary.errors.length < 50) {
              summary.errors.push(`${row.rollNumber}/${row.subjectCode}: upload permission denied`);
            }
          } else {
            await this.prisma.resultEntry.upsert({
              where: {
                studentProfileId_subjectId_examType: {
                  studentProfileId: student.id,
                  subjectId: subject.id,
                  examType: payload.examType
                }
              },
              create: {
                studentProfileId: student.id,
                subjectId: subject.id,
                semesterNumber,
                examType: payload.examType,
                internals: row.internals,
                grade: row.grade,
                credits: row.credits,
                status: row.status,
                isPublished: true,
                importJobId: recordId,
                createdById: payload.user.id
              },
              update: {
                semesterNumber,
                internals: row.internals,
                grade: row.grade,
                credits: row.credits,
                status: row.status,
                isPublished: true,
                importJobId: recordId
              }
            });
            summary.imported += 1;
            summary.importedRollNumbers.push(student.rollNumber.toUpperCase());
          }
          }
        }
      } catch (error) {
        summary.skipped += 1;
        if (summary.errors.length < 50) {
          summary.errors.push(`${row.rollNumber}/${row.subjectCode}: ${error instanceof Error ? error.message : "import failed"}`);
        }
      }

      processed += 1;
      const now = Date.now();
      const shouldWriteProgress =
        processed === total ||
        processed === 1 ||
        now - lastProgressWrite >= IMPORT_PROGRESS_WRITE_MS ||
        processed % 25 === 0;
      if (total && shouldWriteProgress) {
        lastProgressWrite = now;
        await this.updateImportProgress(
          recordId,
          {
            phase: "importing",
            processed,
            total,
            percent: importingPercent(processed, total)
          },
          { parsed: total, imported: summary.imported, skipped: summary.skipped }
        );
      }
    }

    summary.importedRollNumbers = [...new Set(summary.importedRollNumbers)];
    summary.missingRollNumbersFromPdf = uniqueRolls.filter((roll) => !studentByRoll.has(roll)).sort();
    const publishedCount = await this.prisma.resultEntry.count({ where: { importJobId: recordId, isPublished: true } });

    return {
      ok: true,
      originalName: payload.originalName,
      importJobId: recordId,
      ...summary,
      errors: summary.errors.slice(0, 50),
      publishedCount,
      autoPublished: true,
      pushed: true,
      pushedAt: new Date().toISOString()
    };
  }

  private async processStudentBulkImport(importJobId: string, payload: StudentBulkImportPayload) {
    const recordId = await this.resolveImportRecordId(importJobId);
    await this.assertImportActive(recordId);
    return this.students.executeBulkImport(recordId, payload.students, payload.requestedById);
  }

  private async resolveImportRecordId(importJobId: string) {
    const record = await this.prisma.backgroundJobRecord.findFirst({
      where: { OR: [{ id: importJobId }, { externalId: importJobId }] },
      select: { id: true }
    });
    if (!record) throw new Error(RESULTS_IMPORT_INTERRUPTED_MESSAGE);
    return record.id;
  }

  private async updateImportProgress(
    importJobId: string,
    progress: ImportProgress,
    counters?: { parsed?: number; imported?: number; skipped?: number }
  ) {
    const existing = await this.prisma.backgroundJobRecord.findUnique({
      where: { id: importJobId },
      select: { result: true }
    });
    const prev = (existing?.result ?? {}) as Record<string, unknown>;
    await this.prisma.backgroundJobRecord.update({
      where: { id: importJobId },
      data: {
        result: {
          ...prev,
          ...(counters ?? {}),
          progress
        } as Prisma.InputJsonObject
      }
    });
  }
}
