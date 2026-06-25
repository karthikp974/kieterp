import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { FeedbackFormStatus, Prisma, StudentPortalNotificationKind, UserType } from "@prisma/client";
import { AuthUser, ScopeRef } from "../auth/auth.types";
import { FeedbackService } from "../feedback/feedback.service";
import { SubmitFeedbackDto } from "../feedback/feedback.dto";
import { toPagination } from "../common/pagination.dto";
import { PrismaService } from "../prisma/prisma.service";
import { campusIdsForSharedMatching, studentProfileToScope } from "../permissions/operational-scope.util";
import { loadStudentPortalProfile, type StudentPortalLoadedStudent } from "./student-portal-load-student";
import { StudentFeedbackFormsQueryDto } from "./student-feedback-portal.dto";

export type StudentFeedbackLifecycle = "UPCOMING" | "PENDING" | "SUBMITTED" | "EXPIRED";

@Injectable()
export class StudentPortalFeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly feedback: FeedbackService
  ) {}

  async listForms(user: AuthUser, query: StudentFeedbackFormsQueryDto) {
    this.assertStudent(user);
    const student = await loadStudentPortalProfile(this.prisma, user.id);
    const pagination = toPagination(query);
    const now = new Date();
    const structural = this.buildStructuralWhere(student);

    const searchPart: Prisma.FeedbackFormWhereInput[] = [];
    if (query.search?.trim()) {
      const s = query.search.trim();
      searchPart.push({
        OR: [
          { title: { contains: s, mode: "insensitive" } },
          { description: { contains: s, mode: "insensitive" } }
        ]
      });
    }

    const where: Prisma.FeedbackFormWhereInput = {
      AND: [
        structural,
        {
          OR: [
            { status: FeedbackFormStatus.ACTIVE },
            { submissions: { some: { studentProfileId: student.id } } }
          ]
        },
        ...searchPart
      ]
    };

    const [rows, total] = await Promise.all([
      this.prisma.feedbackForm.findMany({
        where,
        include: {
          createdBy: { select: { fullName: true } },
          questions: { select: { id: true } },
          submissions: {
            where: { studentProfileId: student.id },
            orderBy: { submittedAt: "desc" },
            take: 1,
            select: { id: true, submittedAt: true }
          }
        },
        orderBy: [{ endsAt: "desc" }, { startsAt: "desc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.feedbackForm.count({ where })
    ]);

    const items = rows
      .map((row) => this.toListItem(row, now))
      .sort((a, b) => lifecycleSort(a.lifecycleStatus) - lifecycleSort(b.lifecycleStatus));

    await this.syncPendingNotifications(user.id, items.filter((i) => i.lifecycleStatus === "PENDING"));

    const grouped = {
      pending: items.filter((i) => i.lifecycleStatus === "PENDING" || i.lifecycleStatus === "UPCOMING"),
      submitted: items.filter((i) => i.lifecycleStatus === "SUBMITTED"),
      expired: items.filter((i) => i.lifecycleStatus === "EXPIRED")
    };

    return {
      items,
      grouped,
      total,
      page: pagination.page,
      pageSize: pagination.pageSize
    };
  }

  async getForm(user: AuthUser, formId: string) {
    this.assertStudent(user);
    const student = await loadStudentPortalProfile(this.prisma, user.id);
    const now = new Date();
    const form = await this.prisma.feedbackForm.findUnique({
      where: { id: formId },
      include: {
        questions: { orderBy: { order: "asc" } },
        createdBy: { select: { id: true, fullName: true } },
        submissions: {
          where: { studentProfileId: student.id },
          orderBy: { submittedAt: "desc" },
          take: 1,
          include: { answers: true }
        }
      }
    });
    if (!form) throw new NotFoundException("Feedback form not found.");
    if (!this.studentSeesForm(student, form)) {
      throw new ForbiddenException("This feedback form is not assigned to you.");
    }

    const latestSubmission = form.submissions[0] ?? null;
    const lifecycleStatus = this.resolveLifecycle(form, now, Boolean(latestSubmission));
    const canSubmit = lifecycleStatus === "PENDING" && (!latestSubmission || form.allowMultiple);
    const readOnly = !canSubmit;

    return {
      form: {
        id: form.id,
        title: form.title,
        description: form.description,
        formType: form.formType,
        customType: form.customType,
        startsAt: form.startsAt.toISOString(),
        endsAt: form.endsAt.toISOString(),
        anonymous: form.anonymous,
        allowMultiple: form.allowMultiple,
        status: form.status,
        assignedBy: form.anonymous ? "Institution" : form.createdBy.fullName,
        questions: form.questions.map((q) => ({
          id: q.id,
          order: q.order,
          type: q.type,
          prompt: q.prompt,
          required: q.required,
          options: q.options
        }))
      },
      lifecycleStatus,
      canSubmit,
      readOnly,
      submission: latestSubmission
        ? {
            id: latestSubmission.id,
            submittedAt: latestSubmission.submittedAt.toISOString(),
            answers: latestSubmission.answers.map((a) => ({
              questionId: a.questionId,
              value: a.valueJson
            }))
          }
        : null
    };
  }

  async submit(user: AuthUser, formId: string, dto: SubmitFeedbackDto) {
    this.assertStudent(user);
    const detail = await this.getForm(user, formId);
    if (!detail.canSubmit) {
      throw new BadRequestException("This form cannot be submitted.");
    }
    const result = await this.feedback.submit(user, formId, dto);
    await this.markFeedbackNotificationRead(user.id, formId);
    return result;
  }

  private toListItem(
    row: Prisma.FeedbackFormGetPayload<{
      include: {
        createdBy: { select: { fullName: true } };
        questions: { select: { id: true } };
        submissions: { select: { id: true; submittedAt: true } };
      };
    }>,
    now: Date
  ) {
    const hasSubmission = row.submissions.length > 0;
    const lifecycleStatus = this.resolveLifecycle(row, now, hasSubmission);
    return {
      id: row.id,
      title: row.title,
      descriptionPreview: row.description.length > 200 ? `${row.description.slice(0, 200)}…` : row.description,
      formType: row.formType,
      customType: row.customType,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      assignedBy: row.anonymous ? "Institution" : row.createdBy.fullName,
      questionCount: row.questions.length,
      allowMultiple: row.allowMultiple,
      lifecycleStatus,
      canSubmit: lifecycleStatus === "PENDING" && (!hasSubmission || row.allowMultiple),
      submittedAt: row.submissions[0]?.submittedAt.toISOString() ?? null
    };
  }

  private resolveLifecycle(
    form: { status: FeedbackFormStatus; startsAt: Date; endsAt: Date; allowMultiple: boolean },
    now: Date,
    hasSubmission: boolean
  ): StudentFeedbackLifecycle {
    if (form.status === FeedbackFormStatus.ARCHIVED || form.endsAt < now) {
      return hasSubmission ? "SUBMITTED" : "EXPIRED";
    }
    if (form.startsAt > now) return "UPCOMING";
    if (hasSubmission && !form.allowMultiple) return "SUBMITTED";
    if (form.startsAt <= now && form.endsAt >= now) return "PENDING";
    return "EXPIRED";
  }

  private async syncPendingNotifications(
    userId: string,
    pending: { id: string; title: string; endsAt: string }[]
  ) {
    for (const form of pending) {
      const existing = await this.prisma.studentPortalNotification.findFirst({
        where: { userId, feedbackFormId: form.id, kind: StudentPortalNotificationKind.FEEDBACK }
      });
      if (!existing) {
        const deadline = new Date(form.endsAt).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric"
        });
        await this.prisma.studentPortalNotification.create({
          data: {
            userId,
            kind: StudentPortalNotificationKind.FEEDBACK,
            feedbackFormId: form.id,
            title: `Feedback: ${form.title}`,
            body: `Please submit before ${deadline}.`
          }
        });
      }
    }
  }

  private async markFeedbackNotificationRead(userId: string, formId: string) {
    await this.prisma.studentPortalNotification.updateMany({
      where: { userId, feedbackFormId: formId, readAt: null },
      data: { readAt: new Date() }
    });
  }

  private buildStructuralWhere(student: StudentPortalLoadedStudent) {
    const s = studentProfileToScope(student);
    const campusIds = campusIdsForSharedMatching(student);
    return {
      AND: [
        { OR: [{ campusId: null }, { campusId: { in: campusIds } }] },
        { OR: [{ programId: null }, { programId: s.programId }] },
        { OR: [{ branchId: null }, { branchId: s.branchId }] },
        { OR: s.batchId ? [{ batchId: null }, { batchId: s.batchId }] : [{ batchId: null }] },
        { OR: [{ classId: null }, { classId: s.classId }] },
        { OR: [{ sectionId: null }, { sectionId: s.sectionId }] }
      ]
    } satisfies Prisma.FeedbackFormWhereInput;
  }

  private studentSeesForm(
    student: StudentPortalLoadedStudent,
    form: {
      campusId: string | null;
      programId: string | null;
      branchId: string | null;
      batchId: string | null;
      classId: string | null;
      sectionId: string | null;
    }
  ) {
    const s = studentProfileToScope(student);
    const campusIds = campusIdsForSharedMatching(student);
    const target: ScopeRef = {
      campusId: form.campusId ?? undefined,
      programId: form.programId ?? undefined,
      branchId: form.branchId ?? undefined,
      batchId: form.batchId ?? undefined,
      classId: form.classId ?? undefined,
      sectionId: form.sectionId ?? undefined
    };
    if (target.campusId && !campusIds.includes(target.campusId)) return false;
    if (target.programId && target.programId !== s.programId) return false;
    if (target.branchId && target.branchId !== s.branchId) return false;
    if (target.batchId && target.batchId !== s.batchId) return false;
    if (target.classId && target.classId !== s.classId) return false;
    if (target.sectionId && target.sectionId !== s.sectionId) return false;
    return true;
  }

  private assertStudent(user: AuthUser) {
    if (user.type !== UserType.STUDENT) {
      throw new ForbiddenException("Only student accounts can access student portal feedback.");
    }
  }

}

function lifecycleSort(status: StudentFeedbackLifecycle) {
  const order: StudentFeedbackLifecycle[] = ["PENDING", "UPCOMING", "SUBMITTED", "EXPIRED"];
  return order.indexOf(status);
}
