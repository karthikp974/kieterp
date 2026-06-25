import { BadRequestException, ForbiddenException, Injectable, NotFoundException, StreamableFile } from "@nestjs/common";
import {
  AnnouncementAudience,
  AnnouncementPriority,
  AnnouncementStatus,
  AnnouncementTeacherScope,
  FeedbackFormStatus,
  FeedbackFormType,
  FeedbackQuestionType,
  PermissionAction,
  Prisma,
  StructureStatus,
  UserStatus,
  UserType
} from "@prisma/client";
import { AuthUser, ScopeRef } from "../auth/auth.types";
import { toPagination } from "../common/pagination.dto";
import { PermissionsService } from "../permissions/permissions.service";
import { campusIdsForSharedMatching, studentProfileToScope, studentScopeProfileInclude } from "../permissions/operational-scope.util";
import { PrismaService } from "../prisma/prisma.service";
import {
  assertTeacherCanAccessSectionScope,
  formMatchesSectionIds,
  getActiveTeacherProfile,
  loadTeacherAssignedSections,
  resolveTeacherEngageContext,
  scopeForSectionId,
  sectionScopedWhere
} from "../portals/teacher-portal-section-scope.util";
import {
  CreateFeedbackFormDto,
  FeedbackExportQueryDto,
  FeedbackFormQueryDto,
  ParagraphAnswersQueryDto,
  SubmitFeedbackDto,
  UpdateFeedbackFormDto
} from "./feedback.dto";

@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService
  ) {}

  private readonly studentInclude = studentScopeProfileInclude;

  async listAdmin(user: AuthUser, query: FeedbackFormQueryDto) {
    if (user.type === UserType.TEACHER) {
      return this.listTeacherForms(user, query);
    }
    this.assertAllowed(user, PermissionAction.MANAGE_FEEDBACK, {});
    const pagination = toPagination(query);
    const parts: Prisma.FeedbackFormWhereInput[] = [];
    if (query.status) parts.push({ status: query.status });
    if (query.formType) parts.push({ formType: query.formType });
    const where = parts.length ? { AND: parts } : {};
    const orderField = query.orderBy === "createdAt" ? "createdAt" : "updatedAt";
    const [rows, total] = await Promise.all([
      this.prisma.feedbackForm.findMany({
        where,
        include: {
          createdBy: { select: { id: true, fullName: true } },
          _count: { select: { submissions: true } }
        },
        orderBy: { [orderField]: "desc" },
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.feedbackForm.count({ where })
    ]);
    return {
      items: rows.map((r) => this.toAdminListDto(r)),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize
    };
  }

  private async listTeacherForms(user: AuthUser, query: FeedbackFormQueryDto) {
    const canManage = this.permissions.can(user, { action: PermissionAction.MANAGE_FEEDBACK }).allowed;
    const canView = this.permissions.can(user, { action: PermissionAction.VIEW_FEEDBACK_ANALYTICS }).allowed;
    if (!canManage && !canView) throw new ForbiddenException("You cannot access feedback forms.");

    const teacher = await getActiveTeacherProfile(this.prisma, user.id);
    const permissionAction = canManage ? PermissionAction.MANAGE_FEEDBACK : PermissionAction.VIEW_FEEDBACK_ANALYTICS;
    const sections = await loadTeacherAssignedSections(this.prisma, this.permissions, user, teacher, permissionAction);
    const ctx = resolveTeacherEngageContext(user, this.permissions, teacher, sections, query.sectionId);
    if (!ctx.sectionIds.length) {
      return { items: [], total: 0, page: query.page ?? 1, pageSize: query.pageSize ?? 25 };
    }

    const pagination = toPagination(query);
    const parts: Prisma.FeedbackFormWhereInput[] = [sectionScopedWhere(ctx.sectionIds)];
    if (query.status) parts.push({ status: query.status });
    if (query.formType) parts.push({ formType: query.formType });
    const where = { AND: parts };
    const orderField = query.orderBy === "createdAt" ? "createdAt" : "updatedAt";
    const [rows, total] = await Promise.all([
      this.prisma.feedbackForm.findMany({
        where,
        include: {
          createdBy: { select: { id: true, fullName: true } },
          _count: { select: { submissions: true } }
        },
        orderBy: { [orderField]: "desc" },
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.feedbackForm.count({ where })
    ]);
    return {
      items: rows.map((r) => this.toAdminListDto(r)),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize
    };
  }

  async listActiveAdmin(user: AuthUser, query: FeedbackFormQueryDto) {
    return this.listAdmin(user, { ...query, status: FeedbackFormStatus.ACTIVE });
  }

  async listArchivedAdmin(user: AuthUser, query: FeedbackFormQueryDto) {
    return this.listAdmin(user, { ...query, status: FeedbackFormStatus.ARCHIVED });
  }

  async listAvailableForStudent(user: AuthUser, query: FeedbackFormQueryDto) {
    if (user.type !== UserType.STUDENT) throw new ForbiddenException("Students only.");
    this.assertAllowed(user, PermissionAction.SUBMIT_FEEDBACK, {});
    const student = await this.prisma.studentProfile.findUnique({ where: { userId: user.id }, include: this.studentInclude });
    if (!student) return { items: [], total: 0, page: 1, pageSize: query.pageSize ?? 25 };
    const pagination = toPagination(query);
    const now = new Date();
    const where = this.buildStudentFormWhere(student, now);
    const [rows, total] = await Promise.all([
      this.prisma.feedbackForm.findMany({
        where,
        include: { questions: { orderBy: { order: "asc" } } },
        orderBy: { endsAt: "asc" },
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.feedbackForm.count({ where })
    ]);
    const submittedIds = await this.prisma.feedbackSubmission.findMany({
      where: { studentProfileId: student.id, formId: { in: rows.map((r) => r.id) } },
      select: { formId: true }
    });
    const submitted = new Set(submittedIds.map((s) => s.formId));
    return {
      items: rows.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description.slice(0, 200) + (r.description.length > 200 ? "…" : ""),
        formType: r.formType,
        customType: r.customType,
        startsAt: r.startsAt,
        endsAt: r.endsAt,
        anonymous: r.anonymous,
        allowMultiple: r.allowMultiple,
        questionCount: r.questions.length,
        alreadySubmitted: submitted.has(r.id)
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize
    };
  }

  async getOne(user: AuthUser, id: string) {
    const form = await this.prisma.feedbackForm.findUnique({
      where: { id },
      include: {
        questions: { orderBy: { order: "asc" } },
        createdBy: { select: { id: true, fullName: true } },
        _count: { select: { submissions: true } }
      }
    });
    if (!form) throw new NotFoundException("Feedback form not found.");
    if (user.type === UserType.ADMIN) {
      this.assertAllowed(user, PermissionAction.MANAGE_FEEDBACK, this.formToScope(form));
      return { form: this.toAdminDetailDto(form) };
    }
    if (user.type === UserType.STUDENT) {
      this.assertAllowed(user, PermissionAction.SUBMIT_FEEDBACK, {});
      const student = await this.prisma.studentProfile.findUnique({ where: { userId: user.id }, include: this.studentInclude });
      if (!student) throw new ForbiddenException("Student profile missing.");
      if (!this.studentSeesForm(student, form)) throw new ForbiddenException("This feedback form is not available to you.");
      const now = new Date();
      if (form.status !== FeedbackFormStatus.ACTIVE || form.startsAt > now || form.endsAt < now) {
        throw new BadRequestException("This form is not open for responses.");
      }
      return { form: this.toStudentDetailDto(form) };
    }
    if (user.type === UserType.TEACHER) {
      await this.assertTeacherCanAccessForm(user, form);
      return { form: this.toAdminDetailDto(form) };
    }
    throw new ForbiddenException("Forbidden.");
  }

  async create(user: AuthUser, dto: CreateFeedbackFormDto) {
    if (user.type === UserType.STUDENT) throw new ForbiddenException("Students cannot create forms.");
    if (user.type === UserType.TEACHER) {
      await this.assertTeacherManageFeedback(user);
      dto = this.normalizeTeacherFeedbackDto(dto);
    } else {
      this.assertAllowed(user, PermissionAction.MANAGE_FEEDBACK, {});
    }
    if (dto.formType === FeedbackFormType.OTHER && !dto.customType?.trim()) {
      throw new BadRequestException("Specify feedback type when choosing Other.");
    }
    const structural = await this.validateScope({
      campusId: dto.campusId,
      programId: dto.programId,
      branchId: dto.branchId,
      batchId: dto.batchId,
      classId: dto.classId,
      sectionId: dto.sectionId
    });
    if (user.type === UserType.TEACHER) {
      await this.assertTeacherSectionPayload(user, structural.sectionId);
    } else {
      this.assertAllowed(user, PermissionAction.MANAGE_FEEDBACK, structural);
    }
    if (!dto.questions?.length) throw new BadRequestException("Add at least one question.");
    this.validateQuestions(dto.questions);
    const status = dto.status ?? FeedbackFormStatus.DRAFT;
    const form = await this.prisma.$transaction(async (tx) => {
      const f = await tx.feedbackForm.create({
        data: {
          title: dto.title.trim(),
          description: dto.description.trim(),
          formType: dto.formType,
          customType: dto.formType === FeedbackFormType.OTHER ? dto.customType?.trim() : null,
          campusId: structural.campusId ?? null,
          programId: structural.programId ?? null,
          branchId: structural.branchId ?? null,
          batchId: structural.batchId ?? null,
          classId: structural.classId ?? null,
          sectionId: structural.sectionId ?? null,
          startsAt: new Date(dto.startsAt),
          endsAt: new Date(dto.endsAt),
          anonymous: dto.anonymous ?? false,
          allowMultiple: dto.allowMultiple ?? false,
          status,
          createdById: user.id
        }
      });
      await tx.feedbackQuestion.createMany({
        data: dto.questions.map((q) => ({
          formId: f.id,
          order: q.order,
          type: q.type,
          prompt: q.prompt.trim(),
          required: q.required ?? true,
          options: (q.options ?? Prisma.JsonNull) as Prisma.InputJsonValue
        }))
      });
      return tx.feedbackForm.findUniqueOrThrow({
        where: { id: f.id },
        include: { questions: { orderBy: { order: "asc" } }, createdBy: { select: { id: true, fullName: true } }, _count: { select: { submissions: true } } }
      });
    });
    await this.audit(user, "CREATE_FEEDBACK_FORM", "FeedbackForm", form.id, { status });
    return { form: this.toAdminDetailDto(form) };
  }

  async update(user: AuthUser, id: string, dto: UpdateFeedbackFormDto) {
    const existing = await this.prisma.feedbackForm.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Feedback form not found.");
    if (user.type === UserType.TEACHER) {
      await this.assertTeacherManageFeedback(user);
      await this.assertTeacherCanAccessForm(user, existing);
      if (dto.campusId !== undefined || dto.programId !== undefined || dto.branchId !== undefined || dto.batchId !== undefined || dto.classId !== undefined) {
        throw new BadRequestException("Teachers can only target a section.");
      }
      if (dto.sectionId !== undefined && !dto.sectionId) {
        throw new BadRequestException("Section is required.");
      }
    } else {
      this.assertAllowed(user, PermissionAction.MANAGE_FEEDBACK, this.formToScope(existing));
    }
    if (user.type === UserType.STUDENT) throw new ForbiddenException("Forbidden.");
    const responseCount = await this.prisma.feedbackSubmission.count({ where: { formId: id } });
    if (responseCount > 0) {
      if (dto.questions) {
        throw new BadRequestException("Cannot change questions after students have submitted responses.");
      }
      if (this.scopeFieldsChanged(existing, dto)) {
        throw new BadRequestException("Cannot change audience targeting after students have submitted responses.");
      }
    }
    const mergedType = dto.formType ?? existing.formType;
    if (mergedType === FeedbackFormType.OTHER && !(dto.customType ?? existing.customType)?.trim()) {
      throw new BadRequestException("Specify feedback type when choosing Other.");
    }
    let structural = this.formToScope(existing);
    if (
      dto.campusId !== undefined ||
      dto.programId !== undefined ||
      dto.branchId !== undefined ||
      dto.batchId !== undefined ||
      dto.classId !== undefined ||
      dto.sectionId !== undefined
    ) {
      structural = await this.validateScope({
        campusId: dto.campusId !== undefined ? dto.campusId ?? undefined : existing.campusId ?? undefined,
        programId: dto.programId !== undefined ? dto.programId ?? undefined : existing.programId ?? undefined,
        branchId: dto.branchId !== undefined ? dto.branchId ?? undefined : existing.branchId ?? undefined,
        batchId: dto.batchId !== undefined ? dto.batchId ?? undefined : existing.batchId ?? undefined,
        classId: dto.classId !== undefined ? dto.classId ?? undefined : existing.classId ?? undefined,
        sectionId: dto.sectionId !== undefined ? dto.sectionId ?? undefined : existing.sectionId ?? undefined
      });
      if (user.type === UserType.TEACHER && dto.sectionId !== undefined) {
        await this.assertTeacherSectionPayload(user, structural.sectionId);
      }
    }
    if (dto.questions) {
      if (!dto.questions.length) throw new BadRequestException("Add at least one question.");
      this.validateQuestions(dto.questions);
    }
    await this.prisma.$transaction(async (tx) => {
      const data: Prisma.FeedbackFormUncheckedUpdateInput = {};
      if (dto.title !== undefined) data.title = dto.title.trim();
      if (dto.description !== undefined) data.description = dto.description.trim();
      if (dto.formType !== undefined) data.formType = dto.formType;
      if (dto.customType !== undefined || dto.formType !== undefined) {
        data.customType = mergedType === FeedbackFormType.OTHER ? (dto.customType ?? existing.customType)?.trim() ?? null : null;
      }
      if (dto.startsAt !== undefined) data.startsAt = new Date(dto.startsAt);
      if (dto.endsAt !== undefined) data.endsAt = new Date(dto.endsAt);
      if (dto.anonymous !== undefined) data.anonymous = dto.anonymous;
      if (dto.allowMultiple !== undefined) data.allowMultiple = dto.allowMultiple;
      if (dto.status !== undefined) data.status = dto.status;
      if (
        dto.campusId !== undefined ||
        dto.programId !== undefined ||
        dto.branchId !== undefined ||
        dto.batchId !== undefined ||
        dto.classId !== undefined ||
        dto.sectionId !== undefined
      ) {
        data.campusId = structural.campusId ?? null;
        data.programId = structural.programId ?? null;
        data.branchId = structural.branchId ?? null;
        data.batchId = structural.batchId ?? null;
        data.classId = structural.classId ?? null;
        data.sectionId = structural.sectionId ?? null;
      }
      await tx.feedbackForm.update({ where: { id }, data });
      if (dto.questions) {
        await tx.feedbackAnswer.deleteMany({ where: { submission: { formId: id } } });
        await tx.feedbackSubmission.deleteMany({ where: { formId: id } });
        await tx.feedbackQuestion.deleteMany({ where: { formId: id } });
        await tx.feedbackQuestion.createMany({
          data: dto.questions.map((q) => ({
            formId: id,
            order: q.order,
            type: q.type,
            prompt: q.prompt.trim(),
            required: q.required ?? true,
            options: (q.options ?? Prisma.JsonNull) as Prisma.InputJsonValue
          }))
        });
      }
    });
    const form = await this.prisma.feedbackForm.findUniqueOrThrow({
      where: { id },
      include: { questions: { orderBy: { order: "asc" } }, createdBy: { select: { id: true, fullName: true } }, _count: { select: { submissions: true } } }
    });
    await this.audit(user, "UPDATE_FEEDBACK_FORM", "FeedbackForm", id, {});
    return { form: this.toAdminDetailDto(form) };
  }

  async archive(user: AuthUser, id: string) {
    const existing = await this.prisma.feedbackForm.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Feedback form not found.");
    if (user.type === UserType.TEACHER) {
      await this.assertTeacherManageFeedback(user);
      await this.assertTeacherCanAccessForm(user, existing);
    } else {
      this.assertAllowed(user, PermissionAction.MANAGE_FEEDBACK, this.formToScope(existing));
    }
    await this.prisma.feedbackForm.update({ where: { id }, data: { status: FeedbackFormStatus.ARCHIVED } });
    await this.audit(user, "ARCHIVE_FEEDBACK_FORM", "FeedbackForm", id);
    return { ok: true };
  }

  async remove(user: AuthUser, id: string) {
    const existing = await this.prisma.feedbackForm.findUnique({
      where: { id },
      include: { _count: { select: { submissions: true } } }
    });
    if (!existing) throw new NotFoundException("Feedback form not found.");
    if (user.type === UserType.TEACHER) {
      await this.assertTeacherManageFeedback(user);
      await this.assertTeacherCanAccessForm(user, existing);
    } else {
      this.assertAllowed(user, PermissionAction.MANAGE_FEEDBACK, this.formToScope(existing));
    }
    if (user.type === UserType.STUDENT) throw new ForbiddenException("Forbidden.");
    await this.prisma.feedbackForm.delete({ where: { id } });
    await this.audit(user, "DELETE_FEEDBACK_FORM", "FeedbackForm", id, {
      submissionCount: existing._count.submissions
    });
    return { ok: true };
  }

  async submit(user: AuthUser, formId: string, dto: SubmitFeedbackDto) {
    if (user.type !== UserType.STUDENT) throw new ForbiddenException("Only students may submit.");
    this.assertAllowed(user, PermissionAction.SUBMIT_FEEDBACK, {});
    const student = await this.prisma.studentProfile.findUnique({ where: { userId: user.id }, include: this.studentInclude });
    if (!student) throw new ForbiddenException("Student profile missing.");
    const form = await this.prisma.feedbackForm.findUnique({
      where: { id: formId },
      include: { questions: { orderBy: { order: "asc" } } }
    });
    if (!form) throw new NotFoundException("Form not found.");
    if (!this.studentSeesForm(student, form)) throw new ForbiddenException("Not targeted to you.");
    const now = new Date();
    if (form.status !== FeedbackFormStatus.ACTIVE || form.startsAt > now || form.endsAt < now) {
      throw new BadRequestException("Form is not open.");
    }
    if (!form.allowMultiple) {
      const prior = await this.prisma.feedbackSubmission.findFirst({ where: { formId, studentProfileId: student.id } });
      if (prior) throw new BadRequestException("You have already submitted feedback for this form.");
    }
    const qMap = new Map(form.questions.map((q) => [q.id, q]));
    const answersPayload: { questionId: string; valueJson: Prisma.InputJsonValue }[] = [];
    for (const a of dto.answers) {
      const q = qMap.get(a.questionId);
      if (!q) throw new BadRequestException(`Unknown question ${a.questionId}.`);
      answersPayload.push({ questionId: q.id, valueJson: this.normalizeAnswer(q, a.value) });
    }
    for (const q of form.questions) {
      if (q.required && !answersPayload.find((x) => x.questionId === q.id)) {
        throw new BadRequestException(`Missing answer for: ${q.prompt}`);
      }
    }
    await this.prisma.$transaction(async (tx) => {
      const sub = await tx.feedbackSubmission.create({
        data: { formId, studentProfileId: student.id }
      });
      await tx.feedbackAnswer.createMany({
        data: answersPayload.map((row) => ({
          submissionId: sub.id,
          questionId: row.questionId,
          valueJson: row.valueJson
        }))
      });
    });
    await this.audit(user, "SUBMIT_FEEDBACK", "FeedbackForm", formId, {});
    return { ok: true };
  }

  async reportSummary(user: AuthUser, formId: string) {
    const form = await this.ensureFormForReport(user, formId);
    const questions = await this.prisma.feedbackQuestion.findMany({ where: { formId }, orderBy: { order: "asc" } });
    const total = await this.prisma.feedbackSubmission.count({ where: { formId } });
    const questionStats = [] as Record<string, unknown>[];
    for (const q of questions) {
      if (q.type === FeedbackQuestionType.RATING_SCALE) {
        const rows = await this.prisma.feedbackAnswer.findMany({
          where: { questionId: q.id },
          select: { valueJson: true }
        });
        const nums = rows.map((r) => Number(r.valueJson)).filter((n) => Number.isFinite(n) && n >= 1 && n <= 5);
        const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
        const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        for (const n of nums) dist[Math.round(n)] = (dist[Math.round(n)] ?? 0) + 1;
        questionStats.push({ questionId: q.id, prompt: q.prompt, type: q.type, average: Math.round(avg * 100) / 100, count: nums.length, distribution: dist });
      } else if (q.type === FeedbackQuestionType.YES_NO) {
        const rows = await this.prisma.feedbackAnswer.findMany({ where: { questionId: q.id }, select: { valueJson: true } });
        let yes = 0;
        let no = 0;
        for (const r of rows) {
          if (r.valueJson === true) yes += 1;
          else no += 1;
        }
        questionStats.push({ questionId: q.id, prompt: q.prompt, type: q.type, yes, no, total: yes + no });
      } else if (q.type === FeedbackQuestionType.MULTIPLE_CHOICE) {
        const rows = await this.prisma.feedbackAnswer.findMany({ where: { questionId: q.id }, select: { valueJson: true } });
        const counts: Record<string, number> = {};
        for (const r of rows) {
          const s = String(r.valueJson);
          counts[s] = (counts[s] ?? 0) + 1;
        }
        questionStats.push({ questionId: q.id, prompt: q.prompt, type: q.type, choiceCounts: counts, total: rows.length });
      } else {
        const c = await this.prisma.feedbackAnswer.count({ where: { questionId: q.id } });
        questionStats.push({ questionId: q.id, prompt: q.prompt, type: q.type, responseCount: c });
      }
    }
    const insights = this.buildInsights(questionStats, total);
    return {
      formId: form.id,
      title: form.title,
      anonymous: form.anonymous,
      totalSubmissions: total,
      questionStats,
      insights
    };
  }

  async paragraphAnswers(user: AuthUser, formId: string, questionId: string, query: ParagraphAnswersQueryDto) {
    await this.ensureFormForReport(user, formId);
    const q = await this.prisma.feedbackQuestion.findFirst({ where: { id: questionId, formId } });
    if (!q || q.type !== FeedbackQuestionType.PARAGRAPH) throw new BadRequestException("Not a paragraph question.");
    const pagination = toPagination(query);
    const where: Prisma.FeedbackAnswerWhereInput = { questionId, submission: { formId } };
    const anonymous = (await this.prisma.feedbackForm.findUnique({ where: { id: formId }, select: { anonymous: true } }))!.anonymous;
    const search = query.answerSearch?.trim().toLowerCase();
    const include = {
      submission: {
        include: {
          studentProfile: {
            include: { user: { select: { id: true, fullName: true, email: true } }, section: { select: { name: true, code: true } } }
          }
        }
      }
    } as const;

    if (!search) {
      const [rows, total] = await Promise.all([
        this.prisma.feedbackAnswer.findMany({
          where,
          include,
          orderBy: { submission: { submittedAt: "desc" } },
          skip: pagination.skip,
          take: pagination.take
        }),
        this.prisma.feedbackAnswer.count({ where })
      ]);
      return {
        items: rows.map((r) => ({
          id: r.id,
          text: String(r.valueJson ?? ""),
          submittedAt: r.submission.submittedAt,
          student: anonymous
            ? null
            : {
                fullName: r.submission.studentProfile.user.fullName,
                email: r.submission.studentProfile.user.email,
                section: r.submission.studentProfile.section.name
              }
        })),
        total,
        page: pagination.page,
        pageSize: pagination.pageSize
      };
    }

    const cap = 2000;
    const all = await this.prisma.feedbackAnswer.findMany({
      where,
      include,
      orderBy: { submission: { submittedAt: "desc" } },
      take: cap
    });
    const filtered = all.filter((r) => String(r.valueJson ?? "").toLowerCase().includes(search));
    const total = filtered.length;
    const paged = filtered.slice(pagination.skip, pagination.skip + pagination.take);
    return {
      items: paged.map((r) => ({
        id: r.id,
        text: String(r.valueJson ?? ""),
        submittedAt: r.submission.submittedAt,
        student: anonymous
          ? null
          : {
              fullName: r.submission.studentProfile.user.fullName,
              email: r.submission.studentProfile.user.email,
              section: r.submission.studentProfile.section.name
            }
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize
    };
  }

  async formCompletion(user: AuthUser, formId: string) {
    const form = await this.prisma.feedbackForm.findUnique({ where: { id: formId } });
    if (!form) throw new NotFoundException("Feedback form not found.");
    await this.assertTeacherCanAccessForm(user, form);
    const scope = this.formToScope(form);
    const students = await this.prisma.studentProfile.findMany({
      where: this.buildStudentTargetWhere(scope),
      include: {
        user: { select: { fullName: true, email: true } },
        section: { select: { name: true, code: true } }
      },
      orderBy: [{ section: { name: "asc" } }, { rollNumber: "asc" }]
    });
    const submissions = await this.prisma.feedbackSubmission.findMany({
      where: { formId },
      select: { studentProfileId: true, submittedAt: true },
      orderBy: { submittedAt: "desc" }
    });
    const latestByStudent = new Map<string, Date>();
    for (const row of submissions) {
      if (!latestByStudent.has(row.studentProfileId)) {
        latestByStudent.set(row.studentProfileId, row.submittedAt);
      }
    }
    const submitted: {
      studentProfileId: string;
      rollNumber: string;
      fullName: string;
      email: string;
      sectionName: string;
      submittedAt: string;
    }[] = [];
    const pending: {
      studentProfileId: string;
      rollNumber: string;
      fullName: string;
      email: string;
      sectionName: string;
    }[] = [];
    for (const student of students) {
      const base = {
        studentProfileId: student.id,
        rollNumber: student.rollNumber,
        fullName: student.user.fullName,
        email: student.user.email,
        sectionName: student.section.name
      };
      const at = latestByStudent.get(student.id);
      if (at) submitted.push({ ...base, submittedAt: at.toISOString() });
      else pending.push(base);
    }
    return {
      formId: form.id,
      title: form.title,
      anonymous: form.anonymous,
      totalTargeted: students.length,
      submittedCount: submitted.length,
      pendingCount: pending.length,
      submitted,
      pending
    };
  }

  async sendReminders(user: AuthUser, formId: string) {
    const form = await this.prisma.feedbackForm.findUnique({ where: { id: formId } });
    if (!form) throw new NotFoundException("Feedback form not found.");
    if (user.type === UserType.TEACHER) {
      await this.assertTeacherManageFeedback(user);
      await this.assertTeacherCanAccessForm(user, form);
    } else {
      this.assertAllowed(user, PermissionAction.MANAGE_FEEDBACK, this.formToScope(form));
    }
    if (form.status !== FeedbackFormStatus.ACTIVE) {
      throw new BadRequestException("Reminders can only be sent for active forms.");
    }
    const now = new Date();
    if (form.endsAt < now) throw new BadRequestException("This form has already closed.");
    const completion = await this.formCompletion(user, formId);
    if (!completion.pendingCount) {
      return { ok: true, remindedCount: 0, announcementId: null as string | null };
    }
    const deadline = form.endsAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    const announcement = await this.prisma.announcement.create({
      data: {
        title: `Reminder: ${form.title}`,
        body: `Please complete the feedback form “${form.title}” before ${deadline}. Open Feedback in your student portal if you have not submitted yet.`,
        audience: AnnouncementAudience.STUDENTS,
        status: AnnouncementStatus.PUBLISHED,
        priority: AnnouncementPriority.IMPORTANT,
        campusId: form.campusId,
        programId: form.programId,
        branchId: form.branchId,
        batchId: form.batchId,
        classId: form.classId,
        sectionId: form.sectionId,
        teacherScope: AnnouncementTeacherScope.NONE,
        createdById: user.id,
        publishedAt: new Date(),
        expiresAt: form.endsAt
      }
    });
    await this.audit(user, "FEEDBACK_REMINDER", "FeedbackForm", formId, {
      pendingCount: completion.pendingCount,
      announcementId: announcement.id
    });
    return { ok: true, remindedCount: completion.pendingCount, announcementId: announcement.id };
  }

  async exportCsv(user: AuthUser, formId: string, query: FeedbackExportQueryDto = {}) {
    const variant = query.variant ?? "responses";
    if (variant === "completion") {
      return this.exportCompletionCsv(user, formId);
    }
    const form = await this.ensureFormForReport(user, formId);
    const questions = await this.prisma.feedbackQuestion.findMany({ where: { formId }, orderBy: { order: "asc" } });
    const submissions = await this.prisma.feedbackSubmission.findMany({
      where: { formId },
      include: {
        answers: true,
        studentProfile: {
          include: { user: { select: { fullName: true, email: true } }, section: { select: { name: true, code: true } } }
        }
      },
      orderBy: { submittedAt: "desc" },
      take: 5000
    });
    const headers = [
      "submissionId",
      "submittedAt",
      ...(form.anonymous ? [] : ["studentName", "email", "section"]),
      ...questions.map((q, i) => `Q${i + 1}_${q.type}`)
    ];
    const lines = [headers.join(",")];
    for (const s of submissions) {
      const map = new Map(s.answers.map((a) => [a.questionId, a.valueJson]));
      const base = [
        s.id,
        s.submittedAt.toISOString(),
        ...(form.anonymous ? [] : [this.csvEscape(s.studentProfile.user.fullName), this.csvEscape(s.studentProfile.user.email), this.csvEscape(s.studentProfile.section.name)])
      ];
      const vals = questions.map((q) => this.csvEscape(JSON.stringify(map.get(q.id) ?? "")));
      lines.push([...base, ...vals].join(","));
    }
    const body = lines.join("\n");
    const filename = this.exportFilename(form.title, "responses");
    return new StreamableFile(Buffer.from(body, "utf-8"), {
      type: "text/csv; charset=utf-8",
      disposition: `attachment; filename="${filename}"`
    });
  }

  private async exportCompletionCsv(user: AuthUser, formId: string) {
    const form = await this.prisma.feedbackForm.findUnique({ where: { id: formId } });
    if (!form) throw new NotFoundException("Form not found.");
    await this.assertTeacherCanAccessForm(user, form);
    const completion = await this.formCompletion(user, formId);
    const headers = ["status", "rollNumber", "fullName", "email", "section", "submittedAt"];
    const lines = [headers.join(",")];
    for (const row of completion.submitted) {
      lines.push(
        [
          "submitted",
          this.csvEscape(row.rollNumber),
          this.csvEscape(row.fullName),
          this.csvEscape(row.email),
          this.csvEscape(row.sectionName),
          row.submittedAt
        ].join(",")
      );
    }
    for (const row of completion.pending) {
      lines.push(
        [
          "pending",
          this.csvEscape(row.rollNumber),
          this.csvEscape(row.fullName),
          this.csvEscape(row.email),
          this.csvEscape(row.sectionName),
          ""
        ].join(",")
      );
    }
    const body = lines.join("\n");
    const filename = this.exportFilename(form.title, "completion");
    return new StreamableFile(Buffer.from(body, "utf-8"), {
      type: "text/csv; charset=utf-8",
      disposition: `attachment; filename="${filename}"`
    });
  }

  private exportFilename(title: string, suffix: string) {
    const slug =
      title
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 80) || "feedback";
    return `${slug}-${suffix}.csv`;
  }

  private buildStudentTargetWhere(scope: ScopeRef): Prisma.StudentProfileWhereInput {
    const sectionFilter: Prisma.SectionWhereInput = { status: StructureStatus.ACTIVE, isArchived: false };
    const classFilter: Prisma.AcademicClassWhereInput = { status: StructureStatus.ACTIVE, isArchived: false };
    const branchFilter: Prisma.BranchWhereInput = { status: StructureStatus.ACTIVE, isArchived: false };
    const programFilter: Prisma.ProgramWhereInput = { status: StructureStatus.ACTIVE, isArchived: false };
    const base: Prisma.StudentProfileWhereInput = {
      isArchived: false,
      currentStatus: UserStatus.ACTIVE
    };
    if (scope.sectionId) {
      return { ...base, sectionId: scope.sectionId, section: sectionFilter };
    }
    if (scope.classId) {
      return { ...base, section: { ...sectionFilter, classId: scope.classId, class: classFilter } };
    }
    if (scope.batchId) {
      return { ...base, section: { ...sectionFilter, class: { ...classFilter, batchId: scope.batchId } } };
    }
    if (scope.branchId) {
      return { ...base, section: { ...sectionFilter, class: { ...classFilter, branchId: scope.branchId } } };
    }
    if (scope.programId) {
      return {
        ...base,
        section: { ...sectionFilter, class: { ...classFilter, branch: { ...branchFilter, programId: scope.programId } } }
      };
    }
    if (scope.campusId) {
      return {
        ...base,
        section: {
          ...sectionFilter,
          class: { ...classFilter, branch: { ...branchFilter, program: { ...programFilter, campusId: scope.campusId } } }
        }
      };
    }
    return {
      ...base,
      section: { ...sectionFilter, class: { ...classFilter, branch: { ...branchFilter, program: programFilter } } }
    };
  }

  private csvEscape(s: string) {
    const v = String(s ?? "");
    if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  }

  private buildInsights(questionStats: Record<string, unknown>[], total: number): string[] {
    const insights: string[] = [];
    if (!total) {
      insights.push("No submissions yet.");
      return insights;
    }
    let best: { prompt: string; avg: number } | null = null;
    for (const q of questionStats) {
      if (q.type === FeedbackQuestionType.RATING_SCALE && typeof q.average === "number") {
        if (!best || q.average > best.avg) best = { prompt: String(q.prompt), avg: q.average as number };
      }
    }
    if (best) insights.push(`Highest average rating: “${best.prompt.slice(0, 80)}” (${best.avg.toFixed(2)}/5).`);
    insights.push(`Total submissions recorded: ${total}.`);
    return insights;
  }

  private async ensureFormForReport(user: AuthUser, formId: string) {
    const form = await this.prisma.feedbackForm.findUnique({ where: { id: formId } });
    if (!form) throw new NotFoundException("Form not found.");
    await this.assertTeacherCanAccessForm(user, form);
    return form;
  }

  private async assertTeacherManageFeedback(user: AuthUser) {
    if (!this.permissions.can(user, { action: PermissionAction.MANAGE_FEEDBACK }).allowed) {
      throw new ForbiddenException("You cannot manage feedback forms.");
    }
  }

  private normalizeTeacherFeedbackDto(dto: CreateFeedbackFormDto): CreateFeedbackFormDto {
    if (dto.campusId || dto.programId || dto.branchId || dto.batchId || dto.classId) {
      throw new BadRequestException("Teachers can only target a section.");
    }
    if (!dto.sectionId?.trim()) {
      throw new BadRequestException("Section is required.");
    }
    return dto;
  }

  private async assertTeacherSectionPayload(user: AuthUser, sectionId?: string) {
    if (!sectionId) throw new BadRequestException("Section is required.");
    const teacher = await getActiveTeacherProfile(this.prisma, user.id);
    const sections = await loadTeacherAssignedSections(
      this.prisma,
      this.permissions,
      user,
      teacher,
      PermissionAction.MANAGE_FEEDBACK
    );
    const ctx = resolveTeacherEngageContext(user, this.permissions, teacher, sections);
    if (!ctx.sectionIds.includes(sectionId)) {
      throw new ForbiddenException("You cannot target this section.");
    }
    const scope = await scopeForSectionId(this.prisma, sectionId);
    assertTeacherCanAccessSectionScope(user, this.permissions, scope, PermissionAction.MANAGE_FEEDBACK);
  }

  private async assertTeacherCanAccessForm(
    user: AuthUser,
    form: { campusId: string | null; programId: string | null; branchId: string | null; batchId: string | null; classId: string | null; sectionId: string | null }
  ) {
    if (user.type === UserType.ADMIN) {
      this.assertAllowed(user, PermissionAction.VIEW_FEEDBACK_ANALYTICS, this.formToScope(form));
      return;
    }
    if (user.type !== UserType.TEACHER) throw new ForbiddenException("Forbidden.");

    const canManage = this.permissions.can(user, { action: PermissionAction.MANAGE_FEEDBACK }).allowed;
    const canView = this.permissions.can(user, { action: PermissionAction.VIEW_FEEDBACK_ANALYTICS }).allowed;
    if (!canManage && !canView) throw new ForbiddenException("You cannot access this feedback form.");

    const teacher = await getActiveTeacherProfile(this.prisma, user.id);
    const permissionAction = canManage ? PermissionAction.MANAGE_FEEDBACK : PermissionAction.VIEW_FEEDBACK_ANALYTICS;
    const sections = await loadTeacherAssignedSections(this.prisma, this.permissions, user, teacher, permissionAction);
    const ctx = resolveTeacherEngageContext(user, this.permissions, teacher, sections);
    if (!form.sectionId || !formMatchesSectionIds(form, ctx.sectionIds)) {
      throw new ForbiddenException("This feedback form is outside your assigned scope.");
    }
    const scope = await scopeForSectionId(this.prisma, form.sectionId);
    assertTeacherCanAccessSectionScope(user, this.permissions, scope, permissionAction);
  }

  private normalizeAnswer(
    q: { type: FeedbackQuestionType; options: Prisma.JsonValue | null; prompt: string },
    value: unknown
  ): Prisma.InputJsonValue {
    if (q.type === FeedbackQuestionType.RATING_SCALE) {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 1 || n > 5) throw new BadRequestException(`Invalid rating for: ${q.prompt}`);
      return n;
    }
    if (q.type === FeedbackQuestionType.YES_NO) {
      if (typeof value !== "boolean") throw new BadRequestException(`Invalid yes/no for: ${q.prompt}`);
      return value;
    }
    if (q.type === FeedbackQuestionType.MULTIPLE_CHOICE) {
      const s = String(value ?? "").trim();
      if (!s) throw new BadRequestException(`Select an option for: ${q.prompt}`);
      return s;
    }
    const s = String(value ?? "").trim();
    if (s.length < 1) throw new BadRequestException(`Enter text for: ${q.prompt}`);
    if (s.length > 8000) throw new BadRequestException("Paragraph too long.");
    return s;
  }

  private validateQuestions(questions: { type: FeedbackQuestionType; options?: Record<string, unknown>; prompt: string }[]) {
    for (const q of questions) {
      if (q.type === FeedbackQuestionType.MULTIPLE_CHOICE) {
        const choices = (q.options as { choices?: string[] } | undefined)?.choices;
        if (!choices?.length) throw new BadRequestException("Multiple choice questions need options.choices.");
      }
    }
  }

  private buildStudentFormWhere(
    student: Prisma.StudentProfileGetPayload<{ include: FeedbackService["studentInclude"] }>,
    now: Date
  ): Prisma.FeedbackFormWhereInput {
    const s = this.studentToScope(student);
    const campusIds = campusIdsForSharedMatching(student);
    const structural: Prisma.FeedbackFormWhereInput[] = [
      { OR: [{ campusId: null }, { campusId: { in: campusIds } }] },
      { OR: [{ programId: null }, { programId: s.programId }] },
      { OR: [{ branchId: null }, { branchId: s.branchId }] },
      { OR: s.batchId ? [{ batchId: null }, { batchId: s.batchId }] : [{ batchId: null }] },
      { OR: [{ classId: null }, { classId: s.classId }] },
      { OR: [{ sectionId: null }, { sectionId: s.sectionId }] }
    ];
    return {
      AND: [{ status: FeedbackFormStatus.ACTIVE }, { startsAt: { lte: now } }, { endsAt: { gte: now } }, ...structural]
    };
  }

  private studentSeesForm(student: Prisma.StudentProfileGetPayload<{ include: FeedbackService["studentInclude"] }>, form: { campusId: string | null; programId: string | null; branchId: string | null; batchId: string | null; classId: string | null; sectionId: string | null }) {
    const s = this.studentToScope(student);
    const target = this.formToScope(form);
    return Object.entries(target).every(([key, value]) => !value || s[key as keyof ScopeRef] === value);
  }

  private studentToScope(student: Prisma.StudentProfileGetPayload<{ include: FeedbackService["studentInclude"] }>): ScopeRef {
    return studentProfileToScope(student);
  }

  private scopeFieldsChanged(
    existing: { campusId: string | null; programId: string | null; branchId: string | null; batchId: string | null; classId: string | null; sectionId: string | null },
    dto: UpdateFeedbackFormDto
  ) {
    const keys = ["campusId", "programId", "branchId", "batchId", "classId", "sectionId"] as const;
    return keys.some((key) => dto[key] !== undefined && (dto[key] ?? null) !== (existing[key] ?? null));
  }

  private formToScope(form: { campusId: string | null; programId: string | null; branchId: string | null; batchId: string | null; classId: string | null; sectionId: string | null }): ScopeRef {
    return {
      campusId: form.campusId ?? undefined,
      programId: form.programId ?? undefined,
      branchId: form.branchId ?? undefined,
      batchId: form.batchId ?? undefined,
      classId: form.classId ?? undefined,
      sectionId: form.sectionId ?? undefined
    };
  }

  private async validateScope(scope: ScopeRef): Promise<ScopeRef> {
    if (!scope.campusId && !scope.programId && !scope.branchId && !scope.batchId && !scope.classId && !scope.sectionId) {
      return {};
    }
    if (scope.sectionId) {
      const section = await this.prisma.section.findUnique({
        where: { id: scope.sectionId },
        include: { class: { include: { branch: { include: { program: true } }, batch: true } } }
      });
      if (!section || section.status !== StructureStatus.ACTIVE) throw new BadRequestException("Invalid section.");
      return {
        campusId: section.class.branch.program.campusId,
        programId: section.class.branch.programId,
        branchId: section.class.branchId,
        batchId: section.class.batchId ?? undefined,
        classId: section.classId,
        sectionId: section.id
      };
    }
    if (scope.classId) {
      const cls = await this.prisma.academicClass.findUnique({ where: { id: scope.classId }, include: { branch: { include: { program: true } }, batch: true } });
      if (!cls || cls.status !== StructureStatus.ACTIVE) throw new BadRequestException("Invalid class.");
      return { campusId: cls.branch.program.campusId, programId: cls.branch.programId, branchId: cls.branchId, batchId: cls.batchId ?? undefined, classId: cls.id };
    }
    if (scope.batchId) {
      const batch = await this.prisma.batch.findUnique({ where: { id: scope.batchId }, include: { branch: { include: { program: true } } } });
      if (!batch || batch.status !== StructureStatus.ACTIVE) throw new BadRequestException("Invalid batch.");
      return { campusId: batch.branch.program.campusId, programId: batch.branch.programId, branchId: batch.branchId, batchId: batch.id };
    }
    if (scope.branchId) {
      const branch = await this.prisma.branch.findUnique({ where: { id: scope.branchId }, include: { program: true } });
      if (!branch || branch.status !== StructureStatus.ACTIVE) throw new BadRequestException("Invalid branch.");
      return { campusId: branch.program.campusId, programId: branch.programId, branchId: branch.id };
    }
    if (scope.programId) {
      const program = await this.prisma.program.findUnique({ where: { id: scope.programId } });
      if (!program || program.status !== StructureStatus.ACTIVE) throw new BadRequestException("Invalid program.");
      return { campusId: program.campusId, programId: program.id };
    }
    if (scope.campusId) {
      const campus = await this.prisma.campus.findUnique({ where: { id: scope.campusId } });
      if (!campus || campus.status !== StructureStatus.ACTIVE) throw new BadRequestException("Invalid campus.");
      return { campusId: campus.id };
    }
    return {};
  }

  private toAdminListDto(row: {
    id: string;
    title: string;
    formType: FeedbackFormType;
    customType: string | null;
    status: FeedbackFormStatus;
    startsAt: Date;
    endsAt: Date;
    anonymous: boolean;
    createdAt: Date;
    _count: { submissions: number };
  }) {
    return {
      id: row.id,
      title: row.title,
      formType: row.formType,
      customType: row.customType,
      status: row.status,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      anonymous: row.anonymous,
      createdAt: row.createdAt,
      totalResponses: row._count.submissions
    };
  }

  private toAdminDetailDto(
    form: Prisma.FeedbackFormGetPayload<{
      include: { questions: true; createdBy: { select: { id: true; fullName: true } }; _count: { select: { submissions: true } } };
    }>
  ) {
    return {
      id: form.id,
      title: form.title,
      description: form.description,
      formType: form.formType,
      customType: form.customType,
      scope: this.formToScope(form),
      startsAt: form.startsAt,
      endsAt: form.endsAt,
      anonymous: form.anonymous,
      allowMultiple: form.allowMultiple,
      status: form.status,
      createdBy: form.createdBy.fullName,
      totalResponses: form._count.submissions,
      questions: form.questions.map((q) => ({
        id: q.id,
        order: q.order,
        type: q.type,
        prompt: q.prompt,
        required: q.required,
        options: q.options
      }))
    };
  }

  private toStudentDetailDto(form: Prisma.FeedbackFormGetPayload<{ include: { questions: true; createdBy: { select: { id: true; fullName: true } }; _count: { select: { submissions: true } } } }>) {
    const f = this.toAdminDetailDto(form);
    return { ...f, createdBy: form.anonymous ? "Institution" : f.createdBy };
  }

  private assertAllowed(user: AuthUser, action: PermissionAction, scope?: ScopeRef) {
    const decision = this.permissions.can(user, { action, scope });
    if (!decision.allowed) throw new ForbiddenException(decision.reason);
  }

  private audit(user: AuthUser, action: string, entity: string, entityId: string, metadata?: Prisma.InputJsonObject) {
    return this.prisma.auditLog.create({ data: { userId: user.auditUserId, action, entity, entityId, metadata } });
  }
}
