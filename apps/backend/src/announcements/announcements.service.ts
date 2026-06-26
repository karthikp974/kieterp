import { BadRequestException, ForbiddenException, Injectable, NotFoundException, OnModuleInit, StreamableFile } from "@nestjs/common";
import {
  AnnouncementAudience,
  AnnouncementPriority,
  AnnouncementStatus,
  AnnouncementTeacherRoleFilter,
  AnnouncementTeacherScope,
  PermissionAction,
  Prisma,
  StructureStatus,
  TeacherRoleKind,
  UserType
} from "@prisma/client";
import { createReadStream, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { AuthUser, ScopeRef, TeacherAssignmentContext } from "../auth/auth.types";
import { toPagination } from "../common/pagination.dto";
import { bufferMatchesMime } from "../common/file-signature.util";
import { isPathWithinRoot } from "../common/safe-path.util";
import { PermissionsService } from "../permissions/permissions.service";
import { campusIdsForSharedMatching, studentProfileToScope, studentScopeProfileInclude } from "../permissions/operational-scope.util";
import { PrismaService } from "../prisma/prisma.service";
import {
  announcementSectionScopedWhere,
  assertTeacherCanAccessSectionScope,
  getActiveTeacherProfile,
  loadTeacherAssignedSections,
  resolveTeacherEngageContext,
  scopeForSectionId
} from "../portals/teacher-portal-section-scope.util";
import { AnnouncementQueryDto, CreateAnnouncementDto, UpdateAnnouncementDto } from "./announcements.dto";

const UPLOAD_ROOT = join(process.cwd(), "uploads", "announcements");
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif"
]);

@Injectable()
export class AnnouncementsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService
  ) {}

  onModuleInit() {
    if (!existsSync(UPLOAD_ROOT)) mkdirSync(UPLOAD_ROOT, { recursive: true });
  }

  async list(user: AuthUser, query: AnnouncementQueryDto) {
    const pagination = toPagination(query);
    const now = new Date();
    const expiry: Prisma.AnnouncementWhereInput = { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };

    if (user.type === UserType.ADMIN) {
      const where = this.buildAdminWhere(query);
      const [rows, total] = await this.fetchPage(where, pagination, query.includeReadStatus === true, user.id);
      return { items: rows.map((r) => this.toListDto(r, user.id)), total, page: pagination.page, pageSize: pagination.pageSize };
    }

    if (user.type === UserType.STUDENT) {
      const student = await this.prisma.studentProfile.findUnique({ where: { userId: user.id }, include: this.studentInclude });
      if (!student) return { items: [], total: 0, page: pagination.page, pageSize: pagination.pageSize };
      const where = this.buildStudentWhere(student, query, expiry);
      const [rows, total] = await this.fetchPage(where, pagination, true, user.id);
      return { items: rows.map((r) => this.toListDto(r, user.id)), total, page: pagination.page, pageSize: pagination.pageSize };
    }

    return this.listTeacherEngage(user, query, pagination, expiry);
  }

  private async listTeacherEngage(
    user: AuthUser,
    query: AnnouncementQueryDto,
    pagination: ReturnType<typeof toPagination>,
    expiry: Prisma.AnnouncementWhereInput
  ) {
    const canManage = this.permissions.can(user, { action: PermissionAction.MANAGE_ANNOUNCEMENTS }).allowed;
    const teacher = await getActiveTeacherProfile(this.prisma, user.id);
    const sections = await loadTeacherAssignedSections(
      this.prisma,
      this.permissions,
      user,
      teacher,
      PermissionAction.VIEW_ANNOUNCEMENTS
    );
    const ctx = resolveTeacherEngageContext(user, this.permissions, teacher, sections, query.sectionId);
    if (!ctx.sectionIds.length) {
      return { items: [], total: 0, page: pagination.page, pageSize: pagination.pageSize };
    }

    const parts: Prisma.AnnouncementWhereInput[] = [
      expiry,
      announcementSectionScopedWhere(ctx.sectionIds),
      { audience: { in: [AnnouncementAudience.STUDENTS, AnnouncementAudience.BOTH, AnnouncementAudience.ALL] } }
    ];
    if (query.status) parts.push({ status: query.status });
    else if (!canManage) parts.push({ status: AnnouncementStatus.PUBLISHED });
    if (query.audience) parts.push({ audience: query.audience });
    if (query.priority) parts.push({ priority: query.priority });
    if (query.search?.trim()) {
      const s2 = query.search.trim();
      parts.push({
        OR: [{ title: { contains: s2, mode: "insensitive" } }, { body: { contains: s2, mode: "insensitive" } }, { id: { startsWith: s2, mode: "insensitive" } }]
      });
    }
    const where = { AND: parts };
    const [rows, total] = await this.fetchPage(where, pagination, query.includeReadStatus === true, user.id);
    return { items: rows.map((r) => this.toListDto(r, user.id)), total, page: pagination.page, pageSize: pagination.pageSize };
  }

  async getOne(user: AuthUser, id: string) {
    const row = await this.prisma.announcement.findUnique({
      where: { id },
      include: this.listInclude(true, user.id)
    });
    if (!row) throw new NotFoundException("Announcement not found.");
    await this.assertCanView(user, row);
    return { announcement: this.toDetailDto(row, user.id) };
  }

  async create(user: AuthUser, dto: CreateAnnouncementDto) {
    if (user.type === UserType.STUDENT) throw new ForbiddenException("Students cannot publish announcements.");
    if (user.type === UserType.TEACHER) {
      await this.assertTeacherManageAnnouncements(user);
      this.normalizeTeacherAnnouncementDto(dto);
    }
    const includesStudents =
      dto.audience === AnnouncementAudience.STUDENTS || dto.audience === AnnouncementAudience.BOTH || dto.audience === AnnouncementAudience.ALL;
    const includesTeachers =
      dto.audience === AnnouncementAudience.TEACHERS || dto.audience === AnnouncementAudience.BOTH || dto.audience === AnnouncementAudience.ALL;

    let structuralData: ScopeRef = {};
    if (includesStudents && dto.audience !== AnnouncementAudience.TEACHERS) {
      structuralData = await this.validateScope({
        campusId: dto.campusId,
        programId: dto.programId,
        branchId: dto.branchId,
        batchId: dto.batchId,
        classId: dto.classId,
        sectionId: dto.sectionId
      });
    }

    const teacher = includesTeachers
      ? await this.normalizeTeacherFields(dto.audience, dto)
      : {
          teacherScope: AnnouncementTeacherScope.NONE,
          teacherCampusId: undefined,
          teacherProgramId: undefined,
          teacherBranchId: undefined,
          teacherRoleFilter: AnnouncementTeacherRoleFilter.ALL
        };

    if (user.type === UserType.TEACHER && includesStudents && !Object.values(structuralData).some(Boolean)) {
      throw new ForbiddenException("Teachers must publish student-targeted announcements inside an assigned scope.");
    }
    if (user.type === UserType.TEACHER && includesStudents && structuralData.sectionId) {
      await this.assertTeacherSectionPayload(user, structuralData.sectionId);
    }
    if (user.type === UserType.TEACHER && includesTeachers && teacher.teacherScope === AnnouncementTeacherScope.NONE) {
      throw new ForbiddenException("Teachers must choose a teacher audience scope.");
    }
    if (user.type === UserType.TEACHER && includesTeachers) {
      throw new ForbiddenException("Teachers can only publish student-targeted section announcements.");
    }
    this.assertAllowed(user, PermissionAction.MANAGE_ANNOUNCEMENTS, this.mergeScope(structuralData, teacher));
    const status = dto.status ?? AnnouncementStatus.PUBLISHED;
    const pinned = dto.pinned ?? false;
    const announcement = await this.prisma.announcement.create({
      data: {
        title: dto.title.trim(),
        body: dto.body.trim(),
        audience: dto.audience,
        status,
        priority: dto.priority ?? AnnouncementPriority.NORMAL,
        pinned,
        pinnedAt: pinned ? new Date() : null,
        campusId: structuralData.campusId ?? null,
        programId: structuralData.programId ?? null,
        branchId: structuralData.branchId ?? null,
        batchId: structuralData.batchId ?? null,
        classId: structuralData.classId ?? null,
        sectionId: structuralData.sectionId ?? null,
        teacherScope: teacher.teacherScope,
        teacherCampusId: teacher.teacherCampusId ?? null,
        teacherProgramId: teacher.teacherProgramId ?? null,
        teacherBranchId: teacher.teacherBranchId ?? null,
        teacherRoleFilter: teacher.teacherRoleFilter,
        createdById: user.id,
        publishedAt: status === AnnouncementStatus.PUBLISHED ? new Date() : undefined,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined
      },
      include: this.listInclude(false, user.id)
    });
    await this.audit(user, "CREATE_ANNOUNCEMENT", "Announcement", announcement.id, {
      status,
      audience: dto.audience,
      teacherRoleFilter: teacher.teacherRoleFilter
    });
    return { announcement: this.toDetailDto(announcement as never, user.id) };
  }

  async update(user: AuthUser, id: string, dto: UpdateAnnouncementDto) {
    const existing = await this.prisma.announcement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Announcement not found.");
    if (user.type === UserType.TEACHER) {
      await this.assertTeacherManageAnnouncements(user);
      await this.assertTeacherCanAccessAnnouncement(user, existing as never);
      if (dto.campusId !== undefined || dto.programId !== undefined || dto.branchId !== undefined || dto.batchId !== undefined || dto.classId !== undefined) {
        throw new BadRequestException("Teachers can only target a section.");
      }
    } else {
      this.assertAllowed(user, PermissionAction.MANAGE_ANNOUNCEMENTS, this.announcementToScope(existing as never));
    }

    const mergedAudience = dto.audience ?? existing.audience;
    const mergedScope: ScopeRef = {
      campusId: dto.campusId !== undefined ? dto.campusId ?? undefined : existing.campusId ?? undefined,
      programId: dto.programId !== undefined ? dto.programId ?? undefined : existing.programId ?? undefined,
      branchId: dto.branchId !== undefined ? dto.branchId ?? undefined : existing.branchId ?? undefined,
      batchId: dto.batchId !== undefined ? dto.batchId ?? undefined : existing.batchId ?? undefined,
      classId: dto.classId !== undefined ? dto.classId ?? undefined : existing.classId ?? undefined,
      sectionId: dto.sectionId !== undefined ? dto.sectionId ?? undefined : existing.sectionId ?? undefined
    };
    const structural =
      dto.campusId !== undefined ||
      dto.programId !== undefined ||
      dto.branchId !== undefined ||
      dto.batchId !== undefined ||
      dto.classId !== undefined ||
      dto.sectionId !== undefined
        ? await this.validateScope(mergedScope)
        : this.announcementToScope(existing as never);
    if (user.type === UserType.TEACHER && dto.sectionId !== undefined && structural.sectionId) {
      await this.assertTeacherSectionPayload(user, structural.sectionId);
    }
    const teacher = await this.normalizeTeacherFields(mergedAudience, { ...existing, ...dto, audience: mergedAudience } as CreateAnnouncementDto);

    const data: Prisma.AnnouncementUncheckedUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.body !== undefined) data.body = dto.body.trim();
    if (dto.audience !== undefined) data.audience = dto.audience;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.expiresAt !== undefined) data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (dto.pinned !== undefined) {
      data.pinned = dto.pinned;
      data.pinnedAt = dto.pinned ? new Date() : null;
    }
    if (dto.campusId !== undefined || dto.programId !== undefined || dto.branchId !== undefined || dto.batchId !== undefined || dto.classId !== undefined || dto.sectionId !== undefined) {
      data.campusId = structural.campusId ?? null;
      data.programId = structural.programId ?? null;
      data.branchId = structural.branchId ?? null;
      data.batchId = structural.batchId ?? null;
      data.classId = structural.classId ?? null;
      data.sectionId = structural.sectionId ?? null;
    }
    if (dto.teacherScope !== undefined || dto.audience !== undefined || dto.teacherRoleFilter !== undefined) {
      data.teacherScope = teacher.teacherScope;
      data.teacherCampusId = teacher.teacherCampusId ?? null;
      data.teacherProgramId = teacher.teacherProgramId ?? null;
      data.teacherBranchId = teacher.teacherBranchId ?? null;
      data.teacherRoleFilter = teacher.teacherRoleFilter;
    }

    const announcement = await this.prisma.announcement.update({ where: { id }, data, include: this.listInclude(false, user.id) });
    await this.audit(user, "UPDATE_ANNOUNCEMENT", "Announcement", id, {});
    return { announcement: this.toDetailDto(announcement as never, user.id) };
  }

  async archive(user: AuthUser, id: string) {
    const announcement = await this.prisma.announcement.findUnique({ where: { id } });
    if (!announcement) throw new NotFoundException("Announcement not found.");
    if (user.type === UserType.TEACHER) {
      await this.assertTeacherManageAnnouncements(user);
      await this.assertTeacherCanAccessAnnouncement(user, announcement as never);
    } else {
      this.assertAllowed(user, PermissionAction.MANAGE_ANNOUNCEMENTS, this.announcementToScope(announcement as never));
    }
    await this.prisma.announcement.update({ where: { id }, data: { status: AnnouncementStatus.ARCHIVED } });
    await this.audit(user, "ARCHIVE_ANNOUNCEMENT", "Announcement", id);
    return { ok: true };
  }

  async countUnreadForTeacher(user: AuthUser) {
    const rows = await this.listTeacherInbox(user);
    return rows.filter((row) => !row.reads?.[0]?.readAt).length;
  }

  /** Published teacher-audience announcements visible to this teacher (notification feed). */
  async listTeacherInbox(user: AuthUser, search?: string) {
    if (user.type !== UserType.TEACHER || !user.assignments.length) return [];
    const now = new Date();
    const expiry: Prisma.AnnouncementWhereInput = { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
    const query = { search } as AnnouncementQueryDto;
    const where = this.buildTeacherWhere(user, query, expiry);
    const candidates = await this.prisma.announcement.findMany({
      where: { AND: [where, { status: AnnouncementStatus.PUBLISHED }] },
      include: this.listInclude(true, user.id),
      orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
      take: 200
    });
    return candidates.filter((row) => this.teacherSeesAnnouncement(user, row));
  }

  async markAllTeacherInboxRead(user: AuthUser) {
    if (user.type !== UserType.TEACHER) throw new ForbiddenException("Teacher only.");
    const rows = await this.listTeacherInbox(user);
    const unread = rows.filter((row) => !row.reads?.[0]?.readAt);
    if (!unread.length) return { ok: true, marked: 0 };
    const now = new Date();
    await this.prisma.$transaction(
      unread.map((row) =>
        this.prisma.announcementRead.upsert({
          where: { announcementId_userId: { announcementId: row.id, userId: user.id } },
          create: { announcementId: row.id, userId: user.id, readAt: now },
          update: { readAt: now }
        })
      )
    );
    return { ok: true, marked: unread.length };
  }

  async countUnreadForStudent(user: AuthUser) {
    if (user.type !== UserType.STUDENT) return 0;
    const student = await this.prisma.studentProfile.findUnique({ where: { userId: user.id }, include: this.studentInclude });
    if (!student) return 0;
    const now = new Date();
    const expiry: Prisma.AnnouncementWhereInput = { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
    const where = this.buildStudentWhere(student, {} as AnnouncementQueryDto, expiry);
    return this.prisma.announcement.count({
      where: { AND: [where, { reads: { none: { userId: user.id } } }] }
    });
  }

  async markRead(user: AuthUser, id: string) {
    const row = await this.prisma.announcement.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Announcement not found.");
    await this.assertCanView(user, row as never);
    await this.prisma.announcementRead.upsert({
      where: { announcementId_userId: { announcementId: id, userId: user.id } },
      create: { announcementId: id, userId: user.id },
      update: { readAt: new Date() }
    });
    return { ok: true };
  }

  async addAttachment(user: AuthUser, announcementId: string, file: Express.Multer.File) {
    if (!file?.buffer?.length) throw new BadRequestException("Missing file.");
    if (file.size > MAX_ATTACHMENT_BYTES) throw new BadRequestException("Attachment too large (max 10MB).");
    if (!ALLOWED_MIME.has(file.mimetype)) throw new BadRequestException("Unsupported file type.");
    if (!bufferMatchesMime(file.buffer, file.mimetype)) throw new BadRequestException("File contents do not match the declared file type.");
    const announcement = await this.prisma.announcement.findUnique({ where: { id: announcementId } });
    if (!announcement) throw new NotFoundException("Announcement not found.");
    this.assertAllowed(user, PermissionAction.MANAGE_ANNOUNCEMENTS, this.announcementToScope(announcement as never));

    const dir = join(UPLOAD_ROOT, announcementId);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const ext = this.extFromMime(file.mimetype);
    const storageKey = `${announcementId}/${randomUUID()}${ext}`;
    const full = join(UPLOAD_ROOT, storageKey);
    const fs = await import("fs/promises");
    await fs.writeFile(full, file.buffer);

    const att = await this.prisma.announcementAttachment.create({
      data: {
        announcementId,
        originalName: file.originalname.slice(0, 240),
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storageKey
      }
    });
    return { attachment: { id: att.id, originalName: att.originalName, mimeType: att.mimeType, sizeBytes: att.sizeBytes } };
  }

  async downloadAttachment(user: AuthUser, attachmentId: string) {
    const att = await this.prisma.announcementAttachment.findUnique({ where: { id: attachmentId }, include: { announcement: true } });
    if (!att) throw new NotFoundException("Attachment not found.");
    await this.assertCanView(user, att.announcement as never);
    const full = join(UPLOAD_ROOT, att.storageKey);
    if (!isPathWithinRoot(UPLOAD_ROOT, full)) throw new NotFoundException("Attachment not found.");
    if (!existsSync(full)) throw new NotFoundException("File missing on disk.");
    const stream = createReadStream(full);
    return new StreamableFile(stream, { type: att.mimeType, disposition: `attachment; filename="${encodeURIComponent(att.originalName)}"` });
  }

  private extFromMime(mime: string) {
    if (mime === "application/pdf") return ".pdf";
    if (mime.includes("wordprocessingml")) return ".docx";
    if (mime === "image/png") return ".png";
    if (mime === "image/jpeg") return ".jpg";
    if (mime === "image/webp") return ".webp";
    if (mime === "image/gif") return ".gif";
    return "";
  }

  private async fetchPage(where: Prisma.AnnouncementWhereInput, pagination: ReturnType<typeof toPagination>, withRead: boolean, userId: string) {
    const include = this.listInclude(withRead, userId);
    const orderBy: Prisma.AnnouncementOrderByWithRelationInput[] = [{ pinned: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }];
    return Promise.all([
      this.prisma.announcement.findMany({ where, include, orderBy, skip: pagination.skip, take: pagination.take }),
      this.prisma.announcement.count({ where })
    ]);
  }

  private listInclude(withRead: boolean, userId: string): Prisma.AnnouncementInclude {
    return {
      createdBy: { select: { id: true, fullName: true } },
      attachments: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true } },
      ...(withRead ? { reads: { where: { userId }, take: 1, select: { readAt: true } } } : {})
    };
  }

  private buildAdminWhere(query: AnnouncementQueryDto): Prisma.AnnouncementWhereInput {
    const parts: Prisma.AnnouncementWhereInput[] = [];
    if (query.audience) parts.push({ audience: query.audience });
    if (query.status) parts.push({ status: query.status });
    if (query.priority) parts.push({ priority: query.priority });
    if (query.campusId) parts.push({ campusId: query.campusId });
    if (query.sectionId) parts.push({ sectionId: query.sectionId });
    if (query.createdById) parts.push({ createdById: query.createdById });
    if (query.search?.trim()) {
      const s = query.search.trim();
      parts.push({
        OR: [{ title: { contains: s, mode: "insensitive" } }, { body: { contains: s, mode: "insensitive" } }, { id: { startsWith: s, mode: "insensitive" } }]
      });
    }
    return parts.length ? { AND: parts } : {};
  }

  private buildStudentWhere(
    student: Prisma.StudentProfileGetPayload<{ include: AnnouncementsService["studentInclude"] }>,
    query: AnnouncementQueryDto,
    expiry: Prisma.AnnouncementWhereInput
  ): Prisma.AnnouncementWhereInput {
    const s = this.studentToScope(student);
    const campusIds = campusIdsForSharedMatching(student);
    const structural: Prisma.AnnouncementWhereInput[] = [
      { OR: [{ campusId: null }, { campusId: { in: campusIds } }] },
      { OR: [{ programId: null }, { programId: s.programId }] },
      { OR: [{ branchId: null }, { branchId: s.branchId }] },
      { OR: s.batchId ? [{ batchId: null }, { batchId: s.batchId }] : [{ batchId: null }] },
      { OR: [{ classId: null }, { classId: s.classId }] },
      { OR: [{ sectionId: null }, { sectionId: s.sectionId }] }
    ];
    const parts: Prisma.AnnouncementWhereInput[] = [
      expiry,
      { status: AnnouncementStatus.PUBLISHED },
      { audience: { in: [AnnouncementAudience.STUDENTS, AnnouncementAudience.BOTH, AnnouncementAudience.ALL] } },
      ...structural
    ];
    if (query.search?.trim()) {
      const s2 = query.search.trim();
      parts.push({
        OR: [{ title: { contains: s2, mode: "insensitive" } }, { body: { contains: s2, mode: "insensitive" } }, { id: { startsWith: s2, mode: "insensitive" } }]
      });
    }
    return { AND: parts };
  }

  private buildTeacherWhere(user: AuthUser, query: AnnouncementQueryDto, expiry: Prisma.AnnouncementWhereInput): Prisma.AnnouncementWhereInput {
    const structuralOr = this.structuralOrFromAssignments(user.assignments);
    const campusIds = [...new Set(user.assignments.map((a) => a.campusId).filter(Boolean))] as string[];
    const programIds = [...new Set(user.assignments.map((a) => a.programId).filter(Boolean))] as string[];
    const branchIds = [...new Set(user.assignments.map((a) => a.branchId).filter(Boolean))] as string[];

    const teacherTargetOr: Prisma.AnnouncementWhereInput[] = [
      { teacherScope: AnnouncementTeacherScope.INSTITUTION },
      { AND: [{ teacherScope: AnnouncementTeacherScope.NONE }, { OR: structuralOr }] }
    ];
    if (campusIds.length) teacherTargetOr.push({ teacherScope: AnnouncementTeacherScope.CAMPUS, teacherCampusId: { in: campusIds } });
    if (programIds.length) teacherTargetOr.push({ teacherScope: AnnouncementTeacherScope.DEPARTMENT, teacherProgramId: { in: programIds } });
    if (branchIds.length) teacherTargetOr.push({ teacherScope: AnnouncementTeacherScope.BRANCH, teacherBranchId: { in: branchIds } });

    const parts: Prisma.AnnouncementWhereInput[] = [
      expiry,
      { status: AnnouncementStatus.PUBLISHED },
      { audience: { in: [AnnouncementAudience.TEACHERS, AnnouncementAudience.BOTH, AnnouncementAudience.ALL] } },
      { OR: teacherTargetOr }
    ];
    if (query.search?.trim()) {
      const s2 = query.search.trim();
      parts.push({
        OR: [{ title: { contains: s2, mode: "insensitive" } }, { body: { contains: s2, mode: "insensitive" } }, { id: { startsWith: s2, mode: "insensitive" } }]
      });
    }
    return { AND: parts };
  }

  private structuralOrFromAssignments(assignments: TeacherAssignmentContext[]): Prisma.AnnouncementWhereInput[] {
    const rows: Prisma.AnnouncementWhereInput[] = [
      { campusId: null, programId: null, branchId: null, batchId: null, classId: null, sectionId: null }
    ];
    for (const a of assignments) {
      rows.push({
        campusId: a.campusId ?? undefined,
        programId: a.programId ?? undefined,
        branchId: a.branchId ?? undefined,
        batchId: a.batchId ?? undefined,
        classId: a.classId ?? undefined,
        sectionId: a.sectionId ?? undefined
      });
    }
    return rows;
  }

  private mergeScope(
    s: ScopeRef,
    t: {
      teacherScope: AnnouncementTeacherScope;
      teacherCampusId?: string;
      teacherProgramId?: string;
      teacherBranchId?: string;
    }
  ): ScopeRef {
    return {
      ...s,
      campusId: t.teacherCampusId ?? s.campusId,
      programId: t.teacherProgramId ?? s.programId,
      branchId: t.teacherBranchId ?? s.branchId
    };
  }

  private async normalizeTeacherFields(
    audience: AnnouncementAudience,
    dto: Pick<
      CreateAnnouncementDto,
      "teacherScope" | "teacherCampusId" | "teacherProgramId" | "teacherBranchId" | "teacherRoleFilter"
    >
  ) {
    const teacherRoleFilter = dto.teacherRoleFilter ?? AnnouncementTeacherRoleFilter.ALL;

    if (audience === AnnouncementAudience.STUDENTS) {
      return {
        teacherScope: AnnouncementTeacherScope.NONE,
        teacherCampusId: undefined,
        teacherProgramId: undefined,
        teacherBranchId: undefined,
        teacherRoleFilter: AnnouncementTeacherRoleFilter.ALL
      };
    }

    if (audience === AnnouncementAudience.ALL) {
      return {
        teacherScope: AnnouncementTeacherScope.INSTITUTION,
        teacherCampusId: undefined,
        teacherProgramId: undefined,
        teacherBranchId: undefined,
        teacherRoleFilter
      };
    }

    if (audience === AnnouncementAudience.TEACHERS || audience === AnnouncementAudience.BOTH) {
      const derived = await this.deriveTeacherTargeting({
        teacherCampusId: dto.teacherCampusId,
        teacherProgramId: dto.teacherProgramId,
        teacherBranchId: dto.teacherBranchId,
        teacherScope: dto.teacherScope
      });
      return { ...derived, teacherRoleFilter };
    }

    return {
      teacherScope: AnnouncementTeacherScope.NONE,
      teacherCampusId: undefined,
      teacherProgramId: undefined,
      teacherBranchId: undefined,
      teacherRoleFilter
    };
  }

  /** Campus → department → branch depth defines teacher reach; empty chain = entire institution. */
  private async deriveTeacherTargeting(input: {
    teacherCampusId?: string;
    teacherProgramId?: string;
    teacherBranchId?: string;
    teacherScope?: AnnouncementTeacherScope;
  }) {
    let teacherCampusId = input.teacherCampusId;
    let teacherProgramId = input.teacherProgramId;
    let teacherBranchId = input.teacherBranchId;
    let teacherScope = input.teacherScope ?? AnnouncementTeacherScope.NONE;

    if (teacherBranchId) {
      const branch = await this.prisma.branch.findUnique({
        where: { id: teacherBranchId },
        include: { program: true }
      });
      if (!branch || branch.status !== StructureStatus.ACTIVE) throw new BadRequestException("Teacher branch target is invalid or archived.");
      teacherScope = AnnouncementTeacherScope.BRANCH;
      teacherBranchId = branch.id;
      teacherProgramId = branch.programId;
      teacherCampusId = branch.program.campusId;
    } else if (teacherProgramId) {
      const program = await this.prisma.program.findUnique({ where: { id: teacherProgramId } });
      if (!program || program.status !== StructureStatus.ACTIVE) throw new BadRequestException("Teacher department target is invalid or archived.");
      teacherScope = AnnouncementTeacherScope.DEPARTMENT;
      teacherProgramId = program.id;
      teacherCampusId = program.campusId;
      teacherBranchId = undefined;
    } else if (teacherCampusId) {
      const campus = await this.prisma.campus.findUnique({ where: { id: teacherCampusId } });
      if (!campus || campus.status !== StructureStatus.ACTIVE) throw new BadRequestException("Teacher campus target is invalid or archived.");
      teacherScope = AnnouncementTeacherScope.CAMPUS;
      teacherCampusId = campus.id;
      teacherProgramId = undefined;
      teacherBranchId = undefined;
    } else if (teacherScope === AnnouncementTeacherScope.INSTITUTION || teacherScope === AnnouncementTeacherScope.NONE) {
      teacherScope = AnnouncementTeacherScope.INSTITUTION;
      teacherCampusId = undefined;
      teacherProgramId = undefined;
      teacherBranchId = undefined;
    } else {
      throw new BadRequestException("Teacher targeting requires campus, department, or branch selection.");
    }

    return { teacherScope, teacherCampusId, teacherProgramId, teacherBranchId };
  }

  private async assertCanView(user: AuthUser, row: any) {
    if (user.type === UserType.ADMIN) {
      this.assertAllowed(user, PermissionAction.VIEW_ANNOUNCEMENTS, this.announcementToScope(row as never));
      return;
    }
    if (user.type === UserType.TEACHER) {
      await this.assertTeacherCanAccessAnnouncement(user, row as never);
      return;
    }
    const items = await this.filterVisible(user, [row as never]);
    if (!items.length) throw new ForbiddenException("You cannot view this announcement.");
  }

  private async assertTeacherManageAnnouncements(user: AuthUser) {
    if (!this.permissions.can(user, { action: PermissionAction.MANAGE_ANNOUNCEMENTS }).allowed) {
      throw new ForbiddenException("You cannot manage announcements.");
    }
  }

  private normalizeTeacherAnnouncementDto(dto: CreateAnnouncementDto) {
    if (dto.audience !== AnnouncementAudience.STUDENTS) {
      throw new BadRequestException("Teachers can only publish student announcements for their section.");
    }
    if (dto.campusId || dto.programId || dto.branchId || dto.batchId || dto.classId) {
      throw new BadRequestException("Teachers can only target a section.");
    }
    if (!dto.sectionId?.trim()) {
      throw new BadRequestException("Section is required.");
    }
  }

  private async assertTeacherSectionPayload(user: AuthUser, sectionId: string) {
    const teacher = await getActiveTeacherProfile(this.prisma, user.id);
    const sections = await loadTeacherAssignedSections(
      this.prisma,
      this.permissions,
      user,
      teacher,
      PermissionAction.MANAGE_ANNOUNCEMENTS
    );
    const ctx = resolveTeacherEngageContext(user, this.permissions, teacher, sections);
    if (!ctx.sectionIds.includes(sectionId)) {
      throw new ForbiddenException("You cannot target this section.");
    }
    const scope = await scopeForSectionId(this.prisma, sectionId);
    assertTeacherCanAccessSectionScope(user, this.permissions, scope, PermissionAction.MANAGE_ANNOUNCEMENTS);
  }

  private async assertTeacherCanAccessAnnouncement(
    user: AuthUser,
    announcement: {
      sectionId: string | null;
      campusId: string | null;
      programId: string | null;
      branchId: string | null;
      batchId: string | null;
      classId: string | null;
      audience: AnnouncementAudience;
    }
  ) {
    const canManage = this.permissions.can(user, { action: PermissionAction.MANAGE_ANNOUNCEMENTS }).allowed;
    const canView = this.permissions.can(user, { action: PermissionAction.VIEW_ANNOUNCEMENTS }).allowed;
    if (!canManage && !canView) throw new ForbiddenException("You cannot access announcements.");

    if (
      announcement.audience !== AnnouncementAudience.STUDENTS &&
      announcement.audience !== AnnouncementAudience.BOTH &&
      announcement.audience !== AnnouncementAudience.ALL
    ) {
      throw new ForbiddenException("This announcement is outside your assigned scope.");
    }
    if (!announcement.sectionId) {
      throw new ForbiddenException("This announcement is outside your assigned scope.");
    }

    const teacher = await getActiveTeacherProfile(this.prisma, user.id);
    const permissionAction = canManage ? PermissionAction.MANAGE_ANNOUNCEMENTS : PermissionAction.VIEW_ANNOUNCEMENTS;
    const sections = await loadTeacherAssignedSections(this.prisma, this.permissions, user, teacher, permissionAction);
    const ctx = resolveTeacherEngageContext(user, this.permissions, teacher, sections);
    if (!ctx.sectionIds.includes(announcement.sectionId)) {
      throw new ForbiddenException("This announcement is outside your assigned scope.");
    }
    const scope = await scopeForSectionId(this.prisma, announcement.sectionId);
    assertTeacherCanAccessSectionScope(user, this.permissions, scope, permissionAction);
  }

  private async filterVisible(user: AuthUser, items: any[]) {
    if (user.type === UserType.ADMIN) return items;
    if (user.type === UserType.STUDENT) {
      const student = await this.prisma.studentProfile.findUnique({ where: { userId: user.id }, include: this.studentInclude });
      if (!student) return [];
      const studentScope = this.studentToScope(student);
      return items.filter(
        (item) =>
          (item.audience === AnnouncementAudience.ALL ||
            item.audience === AnnouncementAudience.STUDENTS ||
            item.audience === AnnouncementAudience.BOTH) && this.scopeMatchesAnnouncement(studentScope, item)
      );
    }
    return items.filter((item) => {
      if (!(item.audience === AnnouncementAudience.ALL || item.audience === AnnouncementAudience.TEACHERS || item.audience === AnnouncementAudience.BOTH)) {
        return false;
      }
      return this.teacherSeesAnnouncement(user, item);
    });
  }

  private teacherSeesAnnouncement(user: AuthUser, item: any) {
    if (!this.teacherMatchesRoleFilter(user, item.teacherRoleFilter as AnnouncementTeacherRoleFilter)) return false;

    if (item.teacherScope === AnnouncementTeacherScope.INSTITUTION) return true;
    if (item.teacherScope === AnnouncementTeacherScope.CAMPUS && item.teacherCampusId) {
      return user.assignments.some((a) => a.campusId === item.teacherCampusId);
    }
    if (item.teacherScope === AnnouncementTeacherScope.DEPARTMENT && item.teacherProgramId) {
      return user.assignments.some((a) => a.programId === item.teacherProgramId);
    }
    if (item.teacherScope === AnnouncementTeacherScope.BRANCH && item.teacherBranchId) {
      return user.assignments.some((a) => a.branchId === item.teacherBranchId);
    }
    if (item.teacherScope === AnnouncementTeacherScope.NONE) {
      return this.permissions.can(user, { action: PermissionAction.VIEW_ANNOUNCEMENTS, scope: this.announcementToScope(item) }).allowed;
    }
    return false;
  }

  private teacherMatchesRoleFilter(user: AuthUser, filter: AnnouncementTeacherRoleFilter) {
    if (filter === AnnouncementTeacherRoleFilter.ALL) return true;
    const role = filter as unknown as TeacherRoleKind;
    return user.assignments.some((a) => a.role === role);
  }

  private toListDto(row: any, userId: string) {
    const readAt = row.reads?.[0]?.readAt ?? null;
    return {
      id: row.id,
      title: row.title,
      body: row.body.slice(0, 280) + (row.body.length > 280 ? "…" : ""),
      audience: row.audience,
      status: row.status,
      priority: row.priority,
      pinned: row.pinned,
      scope: this.announcementToScope(row as never),
      teacherScope: row.teacherScope,
      teacherRoleFilter: row.teacherRoleFilter,
      teacherCampusId: row.teacherCampusId,
      teacherProgramId: row.teacherProgramId,
      teacherBranchId: row.teacherBranchId,
      createdBy: row.createdBy.fullName,
      createdById: row.createdBy.id,
      publishedAt: row.publishedAt,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      attachments: row.attachments,
      readAt
    };
  }

  private toDetailDto(row: any, userId: string) {
    const base = this.toListDto(row, userId);
    return { ...base, body: row.body };
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
      if (!section || section.status !== StructureStatus.ACTIVE) throw new BadRequestException("Announcement section is invalid or archived.");
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
      if (!cls || cls.status !== StructureStatus.ACTIVE) throw new BadRequestException("Announcement class is invalid or archived.");
      return { campusId: cls.branch.program.campusId, programId: cls.branch.programId, branchId: cls.branchId, batchId: cls.batchId ?? undefined, classId: cls.id };
    }
    if (scope.batchId) {
      const batch = await this.prisma.batch.findUnique({ where: { id: scope.batchId }, include: { branch: { include: { program: true } } } });
      if (!batch || batch.status !== StructureStatus.ACTIVE) throw new BadRequestException("Announcement batch is invalid or archived.");
      return { campusId: batch.branch.program.campusId, programId: batch.branch.programId, branchId: batch.branchId, batchId: batch.id };
    }
    if (scope.branchId) {
      const branch = await this.prisma.branch.findUnique({ where: { id: scope.branchId }, include: { program: true } });
      if (!branch || branch.status !== StructureStatus.ACTIVE) throw new BadRequestException("Announcement branch is invalid or archived.");
      return { campusId: branch.program.campusId, programId: branch.programId, branchId: branch.id };
    }
    if (scope.programId) {
      const program = await this.prisma.program.findUnique({ where: { id: scope.programId } });
      if (!program || program.status !== StructureStatus.ACTIVE) throw new BadRequestException("Announcement program is invalid or archived.");
      return { campusId: program.campusId, programId: program.id };
    }
    if (scope.campusId) {
      const campus = await this.prisma.campus.findUnique({ where: { id: scope.campusId } });
      if (!campus || campus.status !== StructureStatus.ACTIVE) throw new BadRequestException("Announcement campus is invalid or archived.");
      return { campusId: campus.id };
    }
    return {};
  }

  private studentToScope(student: Prisma.StudentProfileGetPayload<{ include: AnnouncementsService["studentInclude"] }>): ScopeRef {
    return studentProfileToScope(student);
  }

  private announcementToScope(announcement: { campusId: string | null; programId: string | null; branchId: string | null; batchId: string | null; classId: string | null; sectionId: string | null }): ScopeRef {
    return {
      campusId: announcement.campusId ?? undefined,
      programId: announcement.programId ?? undefined,
      branchId: announcement.branchId ?? undefined,
      batchId: announcement.batchId ?? undefined,
      classId: announcement.classId ?? undefined,
      sectionId: announcement.sectionId ?? undefined
    };
  }

  private scopeMatchesAnnouncement(scope: ScopeRef, announcement: { campusId: string | null; programId: string | null; branchId: string | null; batchId: string | null; classId: string | null; sectionId: string | null }) {
    const target = this.announcementToScope(announcement);
    return Object.entries(target).every(([key, value]) => !value || scope[key as keyof ScopeRef] === value);
  }

  private assertAllowed(user: AuthUser, action: PermissionAction, scope?: ScopeRef) {
    const decision = this.permissions.can(user, { action, scope });
    if (!decision.allowed) throw new ForbiddenException(decision.reason);
  }

  private audit(user: AuthUser, action: string, entity: string, entityId: string, metadata?: Prisma.InputJsonObject) {
    return this.prisma.auditLog.create({ data: { userId: user.auditUserId, action, entity, entityId, metadata } });
  }

  private readonly studentInclude = studentScopeProfileInclude;
}
