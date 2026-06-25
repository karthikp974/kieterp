import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PermissionAction, Prisma, StudentApplicationStatus, UserStatus, UserType } from "@prisma/client";
import { AuthUser, ScopeRef } from "../auth/auth.types";
import { toPagination } from "../common/pagination.dto";
import { PermissionsService } from "../permissions/permissions.service";
import { studentProfileToScope, studentScopeProfileInclude } from "../permissions/operational-scope.util";
import { SharedGroupAcademicService } from "../permissions/shared-group-academic.service";
import { PrismaService } from "../prisma/prisma.service";
import { ApplicationQueryDto, CreateApplicationDto, ReviewApplicationDto } from "./applications.dto";

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly sharedGroup: SharedGroupAcademicService
  ) {}

  async list(user: AuthUser, query: ApplicationQueryDto) {
    if (user.type === UserType.STUDENT) return this.myApplications(user, query);
    const pagination = toPagination(query);
    const scope = await this.scopeForQuery(query);
    if (user.type === UserType.TEACHER && !scope) {
      throw new ForbiddenException("Teacher application lists must be filtered by assigned scope.");
    }
    this.assertAllowed(user, PermissionAction.VIEW_APPLICATIONS, scope);

    const where: Prisma.StudentApplicationWhereInput = {
      status: query.status,
      category: query.category,
      studentProfileId: query.studentProfileId,
      studentProfile: {
        sectionId: query.sectionId,
        ...(query.branchId ? { section: { class: { branchId: query.branchId } } } : {}),
        ...(query.campusId ? this.sharedGroup.studentProfileWhereOperationalCampus(query.campusId) : {}),
        ...(query.search
          ? {
              OR: [
                { rollNumber: { contains: query.search, mode: "insensitive" } },
                { user: { fullName: { contains: query.search, mode: "insensitive" } } }
              ]
            }
          : {})
      },
      ...(query.search
        ? {
            OR: [
              { subject: { contains: query.search, mode: "insensitive" } },
              { message: { contains: query.search, mode: "insensitive" } }
            ]
          }
        : {})
    };

    const [items, total] = await Promise.all([
      this.prisma.studentApplication.findMany({
        where,
        include: this.include,
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.studentApplication.count({ where })
    ]);
    const visibleItems = user.type === UserType.TEACHER ? items.filter((item) => this.canViewApplication(user, item)) : items;
    return { items: visibleItems.map((item) => this.toApplicationObject(item)), total: user.type === UserType.TEACHER ? visibleItems.length : total, page: pagination.page, pageSize: pagination.pageSize };
  }

  async create(user: AuthUser, dto: CreateApplicationDto) {
    if (user.type !== UserType.STUDENT) throw new ForbiddenException("Only students can submit applications.");
    const student = await this.prisma.studentProfile.findUnique({ where: { userId: user.id }, include: this.studentInclude });
    if (!student) throw new NotFoundException("Student profile not found.");
    if (student.currentStatus !== UserStatus.ACTIVE || student.user.status !== UserStatus.ACTIVE) {
      throw new BadRequestException("Inactive students cannot submit applications.");
    }

    const application = await this.prisma.studentApplication.create({
      data: {
        studentProfileId: student.id,
        category: dto.category,
        subject: dto.subject.trim(),
        message: dto.message.trim()
      },
      include: this.include
    });
    await this.audit(user, "CREATE_STUDENT_APPLICATION", "StudentApplication", application.id, { category: dto.category });
    return { application: this.toApplicationObject(application) };
  }

  async review(user: AuthUser, id: string, dto: ReviewApplicationDto) {
    if (dto.status === StudentApplicationStatus.PENDING) {
      throw new BadRequestException("Reviewed application cannot be moved back to pending.");
    }
    const application = await this.prisma.studentApplication.findUnique({ where: { id }, include: this.include });
    if (!application) throw new NotFoundException("Application not found.");
    this.assertAllowed(user, PermissionAction.MANAGE_APPLICATIONS, this.applicationToScope(application));

    const updated = await this.prisma.studentApplication.update({
      where: { id },
      data: {
        status: dto.status,
        response: dto.response?.trim(),
        reviewedById: user.id,
        reviewedAt: new Date()
      },
      include: this.include
    });
    await this.audit(user, "REVIEW_STUDENT_APPLICATION", "StudentApplication", id, { status: dto.status });
    return { application: this.toApplicationObject(updated) };
  }

  async myApplications(user: AuthUser, query: ApplicationQueryDto) {
    if (user.type !== UserType.STUDENT) throw new ForbiddenException("Only students can use personal application endpoint.");
    const student = await this.prisma.studentProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!student) throw new NotFoundException("Student profile not found.");
    const pagination = toPagination(query);
    const where: Prisma.StudentApplicationWhereInput = {
      studentProfileId: student.id,
      status: query.status,
      category: query.category
    };
    const [items, total] = await Promise.all([
      this.prisma.studentApplication.findMany({
        where,
        include: this.include,
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.studentApplication.count({ where })
    ]);
    return { items: items.map((item) => this.toApplicationObject(item)), total, page: pagination.page, pageSize: pagination.pageSize };
  }

  private async scopeForQuery(query: ApplicationQueryDto): Promise<ScopeRef | undefined> {
    if (query.studentProfileId) return studentProfileToScope(await this.getStudent(query.studentProfileId));
    if (query.branchId) return { branchId: query.branchId };
    if (query.campusId || query.sectionId) return { campusId: query.campusId, sectionId: query.sectionId };
    return undefined;
  }

  private async getStudent(studentProfileId: string) {
    const student = await this.prisma.studentProfile.findUnique({ where: { id: studentProfileId }, include: this.studentInclude });
    if (!student) throw new NotFoundException("Student not found.");
    return student;
  }

  private studentToScope(student: Awaited<ReturnType<ApplicationsService["getStudent"]>>): ScopeRef {
    return studentProfileToScope(student);
  }

  private applicationToScope(application: Prisma.StudentApplicationGetPayload<{ include: ApplicationsService["include"] }>): ScopeRef {
    return this.studentToScope(application.studentProfile);
  }

  private canViewApplication(user: AuthUser, application: Prisma.StudentApplicationGetPayload<{ include: ApplicationsService["include"] }>) {
    return this.permissions.can(user, { action: PermissionAction.VIEW_APPLICATIONS, scope: this.applicationToScope(application) }).allowed;
  }

  private toApplicationObject(application: Prisma.StudentApplicationGetPayload<{ include: ApplicationsService["include"] }>) {
    return {
      id: application.id,
      category: application.category,
      subject: application.subject,
      message: application.message,
      status: application.status,
      response: application.response,
      createdAt: application.createdAt,
      reviewedAt: application.reviewedAt,
      reviewedBy: application.reviewedBy?.fullName ?? null,
      student: {
        id: application.studentProfile.id,
        rollNumber: application.studentProfile.rollNumber,
        fullName: application.studentProfile.user.fullName,
        section: application.studentProfile.section.name,
        semester: application.studentProfile.section.class.semesterNumber
      }
    };
  }

  private assertAllowed(user: AuthUser, action: PermissionAction, scope?: ScopeRef) {
    const decision = this.permissions.can(user, { action, scope });
    if (!decision.allowed) throw new ForbiddenException(decision.reason);
  }

  private audit(user: AuthUser, action: string, entity: string, entityId: string, metadata?: Prisma.InputJsonObject) {
    return this.prisma.auditLog.create({ data: { userId: user.auditUserId, action, entity, entityId, metadata } });
  }

  private readonly studentInclude = studentScopeProfileInclude;

  private readonly include = {
    studentProfile: { include: studentScopeProfileInclude },
    reviewedBy: { select: { fullName: true } }
  } satisfies Prisma.StudentApplicationInclude;
}
