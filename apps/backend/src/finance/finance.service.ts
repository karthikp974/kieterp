import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { formatIstDate, istDayRangeFromIso, todayIstDate } from "../common/ist-time.util";
import { FeePaymentMode, FeePaymentStatus, PermissionAction, Prisma, StructureStatus, StudentFeePaymentStatus, UserStatus, UserType } from "@prisma/client";
import { Response } from "express";
import { AuthUser, ScopeRef } from "../auth/auth.types";
import { buildExportBasename } from "../common/export-filename.util";
import { toPagination, PaginationQueryDto } from "../common/pagination.dto";
import { computeFeeOverdue } from "../common/fee-overdue.util";
import { sendTabularExport } from "../common/tabular-export.util";
import { CampusScopeService, isInstitutionWideAdmin } from "../permissions/campus-scope.service";
import { CacheService } from "../cache/cache.service";
import { ADMIN_DASHBOARD_CACHE_PREFIX } from "../cache/cache.constants";
import { PermissionsService } from "../permissions/permissions.service";
import { assertStudentSelfProfile, studentProfileToScope } from "../permissions/operational-scope.util";
import { SharedGroupAcademicService } from "../permissions/shared-group-academic.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  AssignFeeDto,
  CreateFeeHeadDto,
  CreateFeeStructureDto,
  FeeExportQueryDto,
  FeeQueryDto,
  FeeStudentSearchQueryDto,
  MarkFeePaymentDto,
  PaymentsRollSearchQueryDto,
  PreviewPhysicalFeeDto,
  RegisterPhysicalFeeDto,
  ReverseFeePaymentDto,
  UpdateAssignedFeeDto
} from "./finance.dto";

const financeStudentSectionInclude = {
  section: {
    include: {
      class: {
        include: {
          batch: {
            include: {
              branch: {
                include: { program: true }
              }
            }
          }
        }
      }
    }
  }
} satisfies Prisma.StudentProfileInclude;

const financeSectionTreeInclude = {
  class: {
    include: {
      batch: {
        include: {
          branch: {
            include: { program: { include: { campus: true } } }
          }
        }
      }
    }
  }
} satisfies Prisma.SectionInclude;

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly campusScope: CampusScopeService,
    private readonly sharedGroup: SharedGroupAcademicService,
    private readonly cache: CacheService
  ) {}

  /** Invalidate cached admin dashboards after a payment changes today's collections. */
  private async invalidateDashboardCache() {
    await this.cache.delByPrefix(ADMIN_DASHBOARD_CACHE_PREFIX);
  }

  async listHeads() {
    return this.prisma.feeHead.findMany({ where: { isActive: true }, orderBy: { code: "asc" } });
  }

  async createHead(user: AuthUser, dto: CreateFeeHeadDto) {
    if (user.type !== UserType.ADMIN) throw new ForbiddenException("Only admin can create fee heads.");
    try {
      const head = await this.prisma.feeHead.create({
        data: { code: dto.code.trim().toUpperCase(), name: dto.name.trim(), description: dto.description?.trim() }
      });
      await this.audit(user, "CREATE_FEE_HEAD", "FeeHead", head.id);
      return { head };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Fee head code already exists.");
      }
      throw error;
    }
  }

  async listStructures(query: FeeQueryDto, user: AuthUser) {
    if (user.type === UserType.STUDENT) {
      throw new ForbiddenException("Students must use their personal finance endpoint.");
    }
    if (user.type === UserType.ADMIN && query.campusId) await this.campusScope.assertCampusAllowed(user, query.campusId);
    const pagination = toPagination(query);
    const scopeFs = this.campusScope.feeStructureWhere(user);
    const where: Prisma.FeeStructureWhereInput = {
      isActive: true,
      isArchived: false,
      ...(query.campusId ? { campusId: query.campusId } : {}),
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      ...(Object.keys(scopeFs).length ? scopeFs : {})
    };
    const [items, total] = await Promise.all([
      this.prisma.feeStructure.findMany({
        where,
        include: { feeHead: true, campus: true, program: true, branch: true, batch: true, class: true, section: true },
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.feeStructure.count({ where })
    ]);
    return { items, total, page: pagination.page, pageSize: pagination.pageSize };
  }

  async createStructure(user: AuthUser, dto: CreateFeeStructureDto) {
    if (user.type !== UserType.ADMIN) throw new ForbiddenException("Only admin can create fee structures.");
    await this.campusScope.assertCampusAllowed(user, dto.campusId);
    if (dto.branchId) await this.campusScope.assertBranchInScope(user, dto.branchId);
    if (dto.batchId) await this.campusScope.assertBatchInScope(user, dto.batchId);
    if (dto.classId) await this.campusScope.assertAcademicClassInScope(user, dto.classId);
    if (dto.sectionId) await this.campusScope.assertSectionInScope(user, dto.sectionId);
    await this.ensureFeeHead(dto.feeHeadId);
    const structure = await this.prisma.feeStructure.create({
      data: {
        feeHeadId: dto.feeHeadId,
        campusId: dto.campusId,
        programId: dto.programId,
        branchId: dto.branchId,
        batchId: dto.batchId,
        classId: dto.classId,
        sectionId: dto.sectionId,
        createdById: user.id,
        amount: dto.amount,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined
      }
    });
    await this.audit(user, "CREATE_FEE_STRUCTURE", "FeeStructure", structure.id);
    return { structure };
  }

  async deactivateStructure(user: AuthUser, id: string) {
    if (user.type !== UserType.ADMIN) throw new ForbiddenException("Only admin can deactivate fee structures.");
    const existing = await this.prisma.feeStructure.findUnique({ where: { id }, select: { campusId: true } });
    if (!existing) throw new NotFoundException("Fee structure not found.");
    await this.campusScope.assertCampusAllowed(user, existing.campusId);
    await this.prisma.feeStructure.update({ where: { id }, data: { isActive: false } });
    await this.audit(user, "DEACTIVATE_FEE_STRUCTURE", "FeeStructure", id);
    return { ok: true };
  }

  async searchFeeStudents(query: FeeStudentSearchQueryDto, user: AuthUser) {
    await this.campusScope.assertSectionInScope(user, query.sectionId);
    const section = await this.getActiveSectionTree(query.sectionId);
    const pagination = toPagination(query as unknown as PaginationQueryDto);
    const adminStudentScope = this.adminStudentScopeWhere(user);
    const where: Prisma.StudentProfileWhereInput = {
      sectionId: section.id,
      currentStatus: UserStatus.ACTIVE,
      isArchived: false,
      ...(Object.keys(adminStudentScope).length ? adminStudentScope : {}),
      ...(query.search
        ? {
            OR: [
              { rollNumber: { contains: query.search, mode: "insensitive" } },
              { user: { fullName: { contains: query.search, mode: "insensitive" } } },
              { user: { email: { contains: query.search, mode: "insensitive" } } }
            ]
          }
        : {})
    };
    const [items, total] = await Promise.all([
      this.prisma.studentProfile.findMany({
        where,
        include: { user: true, section: { include: { class: true } } },
        orderBy: { rollNumber: "asc" },
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.studentProfile.count({ where })
    ]);
    return {
      items: items.map((student) => ({
        id: student.id,
        fullName: student.user.fullName,
        rollNumber: student.rollNumber,
        email: student.user.email.endsWith("@students.local") ? null : student.user.email,
        section: student.section.name,
        class: student.section.class.label,
        semester: student.section.class.semesterNumber
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize
    };
  }

  async assignFee(user: AuthUser, dto: AssignFeeDto) {
    if (user.type !== UserType.ADMIN) throw new ForbiddenException("Only admin can assign fee structures.");
    await this.campusScope.assertCampusAllowed(user, dto.campusId);
    await this.campusScope.assertSectionInScope(user, dto.sectionId);
    const deadline = new Date(dto.deadline);
    if (Number.isNaN(deadline.getTime())) throw new BadRequestException("Invalid fee deadline.");
    if (formatIstDate(deadline) < todayIstDate()) throw new BadRequestException("Fee deadline cannot be in the past.");
    const section = await this.getActiveSectionTree(dto.sectionId);
    await this.assertFeeHierarchy(section, dto);
    if (dto.targetType === "STUDENT" && dto.studentId && user.type === UserType.ADMIN && !isInstitutionWideAdmin(user)) {
      await this.campusScope.assertStudentInScope(user, dto.studentId);
    }
    const students = await this.studentsForFeeTarget(dto);
    if (!students.length) throw new BadRequestException("No active unarchived students found for fee assignment.");
    const duplicateAssignments = await this.prisma.studentFeeAssignment.count({
      where: {
        studentId: { in: students.map((student) => student.id) },
        feeStructure: {
          isArchived: false,
          isActive: true,
          sectionId: dto.sectionId,
          feeHeadName: { equals: dto.feeHead.trim(), mode: "insensitive" },
          dueDate: deadline
        }
      }
    });
    if (duplicateAssignments > 0) throw new ConflictException("One or more selected students already have this fee assigned.");

    const requestHash = JSON.stringify({
      sectionId: dto.sectionId,
      targetType: dto.targetType,
      studentId: dto.studentId ?? "",
      feeHeadName: dto.feeHead.trim().toUpperCase(),
      feeAmount: dto.feeAmount,
      deadline: formatIstDate(deadline)
    });
    const route = "POST /api/fees/assign";
    const existingKey = await this.prisma.idempotencyKey.findUnique({ where: { key: dto.idempotencyKey } });
    if (existingKey) {
      if (existingKey.userId === user.id && existingKey.route === route && existingKey.requestHash === requestHash && existingKey.response) {
        return existingKey.response;
      }
      throw new BadRequestException("Fee assignment request was already used for a different operation.");
    }

    const response = await this.prisma.$transaction(async (tx) => {
      await tx.idempotencyKey.create({
        data: {
          key: dto.idempotencyKey,
          userId: user.id,
          route,
          requestHash,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        }
      });
      const feeHead = await this.upsertFeeHead(tx, dto.feeHead);
      const structure = await tx.feeStructure.create({
        data: {
          feeHeadId: feeHead.id,
          campusId: dto.campusId,
          programId: dto.programId,
          branchId: dto.branchId,
          batchId: section.class.batchId,
          classId: dto.classId,
          sectionId: dto.sectionId,
          yearNumber: dto.yearNumber ?? section.class.yearNumber,
          feeHeadName: dto.feeHead.trim(),
          amount: dto.feeAmount,
          remarks: dto.remarks?.trim(),
          dueDate: deadline,
          createdById: user.id
        },
        include: { feeHead: true, campus: true, program: true, branch: true, class: true, section: true, assignments: true }
      });
      await tx.studentFeeAssignment.createMany({
        data: students.map((student) => ({ studentId: student.id, feeStructureId: structure.id, paymentStatus: StudentFeePaymentStatus.UNPAID }))
      });
      await tx.auditLog.create({
        data: {
          userId: user.auditUserId,
          action: "ASSIGN_FEE_STRUCTURE",
          entity: "FeeStructure",
          entityId: structure.id,
          metadata: { targetType: dto.targetType, sectionId: dto.sectionId, students: students.length, amount: dto.feeAmount }
        }
      });
      const result = { structure: this.toAssignedFeeObject({ ...structure, assignments: students.map((student) => ({ id: "", studentId: student.id, paymentStatus: StudentFeePaymentStatus.UNPAID })) }), assigned: students.length };
      await tx.idempotencyKey.update({ where: { key: dto.idempotencyKey }, data: { response: result as Prisma.InputJsonObject } });
      return result;
    });
    return response;
  }

  async listAssignedStructures(query: FeeQueryDto, user: AuthUser) {
    if (user.type === UserType.ADMIN && query.campusId) await this.campusScope.assertCampusAllowed(user, query.campusId);
    const pagination = toPagination(query);
    const scopeFs = this.campusScope.feeStructureWhere(user);
    const where: Prisma.FeeStructureWhereInput = {
      isActive: true,
      isArchived: false,
      ...(query.campusId ? { campusId: query.campusId } : {}),
      ...(query.sectionId ? { sectionId: query.sectionId } : {}),
      ...(Object.keys(scopeFs).length ? scopeFs : {}),
      ...(query.search
        ? {
            OR: [
              { feeHeadName: { contains: query.search, mode: "insensitive" } },
              { feeHead: { name: { contains: query.search, mode: "insensitive" } } },
              { feeHead: { code: { contains: query.search, mode: "insensitive" } } }
            ]
          }
        : {})
    };
    const [items, total] = await Promise.all([
      this.prisma.feeStructure.findMany({
        where,
        include: {
          feeHead: true,
          campus: true,
          program: true,
          branch: true,
          class: true,
          section: true,
          assignments: { select: { id: true, studentId: true, paymentStatus: true } },
          createdBy: { select: { fullName: true } }
        },
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.feeStructure.count({ where })
    ]);
    return { items: items.map((item) => this.toAssignedFeeObject(item)), total, page: pagination.page, pageSize: pagination.pageSize };
  }

  async updateAssignedFee(user: AuthUser, id: string, dto: UpdateAssignedFeeDto) {
    if (user.type !== UserType.ADMIN) throw new ForbiddenException("Only admin can update fee structures.");
    const existing = await this.prisma.feeStructure.findUnique({ where: { id } });
    if (!existing || existing.isArchived) throw new NotFoundException("Fee structure not found.");
    await this.campusScope.assertCampusAllowed(user, existing.campusId);
    const deadline = dto.deadline ? new Date(dto.deadline) : undefined;
    if (deadline && Number.isNaN(deadline.getTime())) throw new BadRequestException("Invalid fee deadline.");
    const feeHead = dto.feeHead ? await this.upsertFeeHead(this.prisma, dto.feeHead) : undefined;
    const structure = await this.prisma.feeStructure.update({
      where: { id },
      data: {
        feeHeadId: feeHead?.id,
        feeHeadName: dto.feeHead?.trim(),
        amount: dto.feeAmount,
        remarks: dto.remarks?.trim(),
        dueDate: deadline
      },
      include: { feeHead: true, campus: true, program: true, branch: true, class: true, section: true, assignments: { select: { id: true, studentId: true, paymentStatus: true } }, createdBy: { select: { fullName: true } } }
    });
    await this.audit(user, "UPDATE_FEE_STRUCTURE", "FeeStructure", id, { fields: Object.keys(dto) });
    return { structure: this.toAssignedFeeObject(structure) };
  }

  async archiveAssignedFee(user: AuthUser, id: string) {
    if (user.type !== UserType.ADMIN) throw new ForbiddenException("Only admin can archive fee structures.");
    const existing = await this.prisma.feeStructure.findUnique({ where: { id } });
    if (!existing || existing.isArchived) throw new NotFoundException("Fee structure not found.");
    await this.campusScope.assertCampusAllowed(user, existing.campusId);
    await this.prisma.feeStructure.update({ where: { id }, data: { isActive: false, isArchived: true, archivedAt: new Date() } });
    await this.audit(user, "ARCHIVE_FEE_STRUCTURE", "FeeStructure", id);
    return { ok: true };
  }

  async listPayments(user: AuthUser, query: FeeQueryDto) {
    if (user.type === UserType.STUDENT) throw new ForbiddenException("Students must use their personal finance endpoint.");
    if (user.type === UserType.ADMIN && query.campusId) await this.campusScope.assertCampusAllowed(user, query.campusId);
    const pagination = toPagination(query);
    const scope = this.queryToScope(query);
    this.assertAllowed(user, PermissionAction.VIEW_FEES, scope);
    const paidAtFilter: Prisma.DateTimeFilter = {};
    if (query.paidFrom) {
      const { start } = istDayRangeFromIso(query.paidFrom.slice(0, 10));
      paidAtFilter.gte = start;
    }
    if (query.paidTo) {
      const { end } = istDayRangeFromIso(query.paidTo.slice(0, 10));
      paidAtFilter.lte = end;
    }
    const studentClause = this.paymentsStudentProfileWhere(query, user);
    const where: Prisma.FeePaymentWhereInput = {
      studentProfileId: query.studentProfileId,
      feeHeadId: query.feeHeadId,
      paymentMode: query.paymentMode,
      ...(Object.keys(paidAtFilter).length ? { paidAt: paidAtFilter } : {}),
      studentProfile: studentClause,
      status: query.status,
      ...(query.search
        ? {
            OR: [
              { receiptNo: { contains: query.search, mode: "insensitive" } },
              { studentProfile: { rollNumber: { contains: query.search, mode: "insensitive" } } },
              { studentProfile: { user: { fullName: { contains: query.search, mode: "insensitive" } } } },
              { feeHead: { name: { contains: query.search, mode: "insensitive" } } },
              { studentFeeAssignment: { feeStructure: { feeHeadName: { contains: query.search, mode: "insensitive" } } } }
            ]
          }
        : {})
    };
    const [items, total] = await Promise.all([
      this.prisma.feePayment.findMany({
        where,
        include: {
          feeHead: true,
          studentFeeAssignment: { include: { feeStructure: { include: { feeHead: true } } } },
          studentProfile: { include: { user: true, section: true } },
          receivedBy: { select: { fullName: true } }
        },
        orderBy: { paidAt: "desc" },
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.feePayment.count({ where })
    ]);
    return { items: items.map((payment) => this.toPaymentObject(payment)), total, page: pagination.page, pageSize: pagination.pageSize };
  }

  async markPayment(user: AuthUser, dto: MarkFeePaymentDto) {
    if (!dto.studentFeeAssignmentId) {
      return this.markLegacyPayment(user, dto);
    }
    const assignment = await this.getAssignmentForPayment(dto.studentFeeAssignmentId, user);
    const scope = this.studentToScope(assignment.student);
    this.assertAllowed(user, PermissionAction.MARK_FEES, scope);
    const balance = this.assignmentBalance(assignment);
    if (balance <= 0) throw new BadRequestException("Selected fee is already fully paid.");
    if (dto.amount > balance) throw new BadRequestException("Payment amount cannot be greater than the remaining fee balance.");
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : undefined;
    if (paidAt && Number.isNaN(paidAt.getTime())) throw new BadRequestException("Invalid payment date.");
    const receiptNo = dto.receiptNo?.trim().toUpperCase() || this.buildReceiptNo();
    const transactionId = this.buildTransactionId(receiptNo, dto.transactionId);
    try {
      const payment = await this.prisma.$transaction(async (tx) => {
        const created = await tx.feePayment.create({
          data: {
            receiptNo,
            transactionId,
            studentProfileId: assignment.studentId,
            studentFeeAssignmentId: assignment.id,
            feeHeadId: assignment.feeStructure.feeHeadId,
            amount: dto.amount,
            paymentMode: dto.paymentMode,
            paidAt,
            note: dto.note?.trim(),
            receivedById: user.id
          },
          include: {
            feeHead: true,
            studentFeeAssignment: { include: { feeStructure: { include: { feeHead: true } } } },
            studentProfile: { include: { user: true, section: true } },
            receivedBy: { select: { fullName: true } }
          }
        });
        await this.recalculateAssignmentStatus(tx, assignment.id, Number(assignment.feeStructure.amount));
        await tx.auditLog.create({
          data: {
            userId: user.auditUserId,
            action: "MARK_FEE_PAYMENT",
            entity: "FeePayment",
            entityId: created.id,
            metadata: {
              receiptNo,
              studentFeeAssignmentId: assignment.id,
              studentProfileId: assignment.studentId,
              feeHeadName: assignment.feeStructure.feeHeadName ?? assignment.feeStructure.feeHead.name,
              amount: dto.amount,
              paymentMode: dto.paymentMode
            }
          }
        });
        return created;
      });
      await this.invalidateDashboardCache();
      return { payment: this.toPaymentObject(payment) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Receipt number already exists.");
      }
      throw error;
    }
  }

  private async markLegacyPayment(user: AuthUser, dto: MarkFeePaymentDto) {
    if (!dto.studentProfileId || !dto.feeHeadId) throw new BadRequestException("Select an assigned fee before recording payment.");
    const student = await this.getStudentForFinance(dto.studentProfileId, user);
    const scope = this.studentToScope(student);
    this.assertAllowed(user, PermissionAction.MARK_FEES, scope);
    await this.ensureFeeHead(dto.feeHeadId);
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : undefined;
    if (paidAt && Number.isNaN(paidAt.getTime())) throw new BadRequestException("Invalid payment date.");
    const receiptNo = dto.receiptNo?.trim().toUpperCase() || this.buildReceiptNo();
    const transactionId = this.buildTransactionId(receiptNo, dto.transactionId);
    try {
      const payment = await this.prisma.feePayment.create({
        data: {
          receiptNo,
          transactionId,
          studentProfileId: dto.studentProfileId,
          feeHeadId: dto.feeHeadId,
          amount: dto.amount,
          paymentMode: dto.paymentMode,
          paidAt,
          note: dto.note?.trim(),
          receivedById: user.id
        },
        include: {
          feeHead: true,
          studentFeeAssignment: { include: { feeStructure: { include: { feeHead: true } } } },
          studentProfile: { include: { user: true, section: true } },
          receivedBy: { select: { fullName: true } }
        }
      });
      await this.audit(user, "MARK_FEE_PAYMENT", "FeePayment", payment.id, { receiptNo, legacy: true });
      return { payment: this.toPaymentObject(payment) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Receipt number already exists.");
      }
      throw error;
    }
  }

  async reversePayment(user: AuthUser, id: string, dto: ReverseFeePaymentDto) {
    const payment = await this.prisma.feePayment.findUnique({
      where: { id },
      include: { studentProfile: { include: financeStudentSectionInclude }, studentFeeAssignment: { include: { feeStructure: true } } }
    });
    if (!payment) throw new NotFoundException("Fee payment not found.");
    if (payment.status !== FeePaymentStatus.ACTIVE) throw new BadRequestException("Payment is already reversed.");
    this.assertAllowed(user, PermissionAction.MARK_FEES, this.studentToScope(payment.studentProfile));
    await this.prisma.$transaction(async (tx) => {
      await tx.feePayment.update({
        where: { id },
        data: { status: FeePaymentStatus.REVERSED, reversedAt: new Date(), reversedById: user.id, reversalReason: dto.reason.trim() }
      });
      if (payment.studentFeeAssignmentId && payment.studentFeeAssignment) {
        await this.recalculateAssignmentStatus(tx, payment.studentFeeAssignmentId, Number(payment.studentFeeAssignment.feeStructure.amount));
      }
      await tx.auditLog.create({
        data: {
          userId: user.auditUserId,
          action: "REVERSE_FEE_PAYMENT",
          entity: "FeePayment",
          entityId: id,
          metadata: { receiptNo: payment.receiptNo, amount: Number(payment.amount), reason: dto.reason.trim(), studentFeeAssignmentId: payment.studentFeeAssignmentId }
        }
      });
    });
    await this.invalidateDashboardCache();
    return { ok: true };
  }

  async myFinance(user: AuthUser) {
    if (user.type !== UserType.STUDENT) throw new ForbiddenException("Only students can view their own fee summary.");
    const student = await this.prisma.studentProfile.findUnique({
      where: { userId: user.id },
      include: financeStudentSectionInclude
    });
    if (!student) throw new NotFoundException("Student profile not found.");
    return this.financeSummary(student.id);
  }

  async studentFinance(user: AuthUser, studentProfileId: string) {
    const student = await this.getStudentForFinance(studentProfileId, user);
    this.assertAllowed(user, PermissionAction.VIEW_FEES, this.studentToScope(student));
    return this.financeSummary(studentProfileId);
  }

  async studentAssignedFees(user: AuthUser, studentProfileId: string) {
    const student = await this.getStudentForFinance(studentProfileId, user);
    this.assertAllowed(user, PermissionAction.VIEW_FEES, this.studentToScope(student));
    const assignments = await this.prisma.studentFeeAssignment.findMany({
      where: {
        studentId: studentProfileId,
        paymentStatus: { in: [StudentFeePaymentStatus.UNPAID, StudentFeePaymentStatus.PARTIAL] },
        feeStructure: { isActive: true, isArchived: false }
      },
      include: {
        feeStructure: { include: { feeHead: true, campus: true, program: true, branch: true, class: true, section: true } },
        payments: { where: { status: FeePaymentStatus.ACTIVE }, select: { amount: true } }
      },
      orderBy: { assignedAt: "desc" }
    });
    return { items: assignments.map((assignment) => this.toStudentAssignedFeeObject(assignment)) };
  }

  async export(user: AuthUser, query: FeeExportQueryDto, response: Response) {
    const page = await this.listPayments(user, { ...query, page: 1, pageSize: 100 });
    const rows: (string | number)[][] = [
      ["Receipt", "Student", "Roll", "Fee", "Due Amount", "Paid Amount", "Mode", "Status", "Paid At", "Received By"],
      ...page.items.map((item) => [
        item.receiptNo,
        item.student.fullName,
        item.student.rollNumber,
        item.assignment?.feeHeadName ?? item.feeHead.name,
        item.assignment?.dueAmount ?? "",
        String(item.amount),
        item.paymentMode,
        item.status,
        item.paidAt instanceof Date ? item.paidAt.toISOString() : String(item.paidAt ?? ""),
        item.receivedBy
      ])
    ];
    await sendTabularExport(
      response,
      query.format,
      buildExportBasename("Finance", "FeePayments"),
      "Fee payments export",
      rows
    );
  }

  private async financeSummary(studentProfileId: string) {
    const assignments = await this.prisma.studentFeeAssignment.findMany({
      where: { studentId: studentProfileId, feeStructure: { isActive: true, isArchived: false } },
      include: {
        feeStructure: { include: { feeHead: true } },
        payments: { where: { status: FeePaymentStatus.ACTIVE }, select: { amount: true } }
      }
    });
    const payments = await this.prisma.feePayment.findMany({
      where: { studentProfileId, status: FeePaymentStatus.ACTIVE },
      include: { feeHead: true, studentFeeAssignment: { include: { feeStructure: { include: { feeHead: true } } } }, receivedBy: { select: { fullName: true } } },
      orderBy: { paidAt: "desc" }
    });
    const dueByHead = assignments.reduce<Record<string, { feeHeadId: string; name: string; due: number; paid: number }>>((acc, assignment) => {
      const key = assignment.feeStructure.feeHeadId;
      acc[key] = acc[key] ?? { feeHeadId: key, name: assignment.feeStructure.feeHeadName ?? assignment.feeStructure.feeHead.name, due: 0, paid: 0 };
      acc[key].due += Number(assignment.feeStructure.amount);
      acc[key].paid += assignment.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      return acc;
    }, {});
    for (const payment of payments) {
      if (payment.studentFeeAssignmentId) continue;
      dueByHead[payment.feeHeadId] = dueByHead[payment.feeHeadId] ?? { feeHeadId: payment.feeHeadId, name: payment.feeHead.name, due: 0, paid: 0 };
      dueByHead[payment.feeHeadId].paid += Number(payment.amount);
    }
    const heads = Object.values(dueByHead).map((item) => ({ ...item, balance: Math.max(item.due - item.paid, 0) }));
    return {
      summary: {
        due: heads.reduce((sum, item) => sum + item.due, 0),
        paid: heads.reduce((sum, item) => sum + item.paid, 0),
        balance: heads.reduce((sum, item) => sum + item.balance, 0)
      },
      heads,
      payments: payments.map((payment) => ({
        id: payment.id,
        receiptNo: payment.receiptNo,
        feeHead: payment.studentFeeAssignment?.feeStructure.feeHeadName ?? payment.feeHead.name,
        amount: Number(payment.amount),
        paymentMode: payment.paymentMode,
        paidAt: payment.paidAt,
        receivedBy: payment.receivedBy.fullName
      }))
    };
  }

  private async getAssignmentForPayment(studentFeeAssignmentId: string, user: AuthUser) {
    const assignment = await this.prisma.studentFeeAssignment.findUnique({
      where: { id: studentFeeAssignmentId },
      include: {
        student: { include: { user: true, ...financeStudentSectionInclude } },
        feeStructure: { include: { feeHead: true, campus: true, program: true, branch: true, class: true, section: true } },
        payments: { where: { status: FeePaymentStatus.ACTIVE }, select: { amount: true } }
      }
    });
    if (!assignment) throw new NotFoundException("Assigned fee not found.");
    if (!assignment.feeStructure.isActive || assignment.feeStructure.isArchived) throw new BadRequestException("Selected fee is archived or inactive.");
    if (assignment.student.currentStatus !== UserStatus.ACTIVE || assignment.student.isArchived) throw new BadRequestException("Selected student is inactive or archived.");
    if (user.type === UserType.ADMIN && !isInstitutionWideAdmin(user)) {
      await this.campusScope.assertStudentInScope(user, assignment.studentId);
    }
    return assignment;
  }

  private assignmentBalance(assignment: { feeStructure: { amount: Prisma.Decimal | number }; payments: { amount: Prisma.Decimal | number }[] }) {
    const paid = assignment.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    return Math.max(Number(assignment.feeStructure.amount) - paid, 0);
  }

  private async recalculateAssignmentStatus(tx: Prisma.TransactionClient, assignmentId: string, dueAmount: number) {
    const aggregate = await tx.feePayment.aggregate({
      where: { studentFeeAssignmentId: assignmentId, status: FeePaymentStatus.ACTIVE },
      _sum: { amount: true }
    });
    const paid = Number(aggregate._sum.amount ?? 0);
    const paymentStatus = paid >= dueAmount ? StudentFeePaymentStatus.PAID : paid > 0 ? StudentFeePaymentStatus.PARTIAL : StudentFeePaymentStatus.UNPAID;
    await tx.studentFeeAssignment.update({ where: { id: assignmentId }, data: { paymentStatus } });
    return paymentStatus;
  }

  private adminStudentScopeWhere(user: AuthUser): Prisma.StudentProfileWhereInput {
    if (user.type !== UserType.ADMIN || isInstitutionWideAdmin(user)) return {};
    const w = this.campusScope.studentProfileWhere(user);
    return Object.keys(w).length ? w : {};
  }

  private teacherStudentScopeWhere(user: AuthUser): Prisma.StudentProfileWhereInput {
    if (user.type !== UserType.TEACHER) return {};
    const OR = user.assignments.map((assignment) => {
      if (assignment.sectionId) return { sectionId: assignment.sectionId };
      if (assignment.classId) return { section: { classId: assignment.classId } };
      if (assignment.batchId) return { section: { class: { batchId: assignment.batchId } } };
      if (assignment.branchId) return { section: { class: { branchId: assignment.branchId } } };
      if (assignment.programId) return { section: { class: { branch: { programId: assignment.programId } } } };
      if (assignment.campusId) return { section: { campusId: assignment.campusId } };
      return { id: "__none__" };
    });
    return OR.length ? { OR } : { id: "__none__" };
  }

  private scopedStudentWhere(user: AuthUser): Prisma.StudentProfileWhereInput {
    if (user.type === UserType.TEACHER) return this.teacherStudentScopeWhere(user);
    return this.adminStudentScopeWhere(user);
  }

  private paymentsStudentProfileWhere(query: FeeQueryDto, user: AuthUser): Prisma.StudentProfileWhereInput {
    const filters: Prisma.StudentProfileWhereInput[] = [];
    const scoped = this.scopedStudentWhere(user);
    if (Object.keys(scoped).length) filters.push(scoped);
    const q: Prisma.StudentProfileWhereInput = {};
    if (query.sectionId) q.sectionId = query.sectionId;
    if (query.campusId) Object.assign(q, this.sharedGroup.studentProfileWhereOperationalCampus(query.campusId));
    if (query.rollNumber?.trim()) q.rollNumber = { contains: query.rollNumber.trim(), mode: "insensitive" };
    if (Object.keys(q).length) filters.push(q);
    return filters.length === 0 ? {} : filters.length === 1 ? filters[0]! : { AND: filters };
  }

  private async getStudentForFinance(studentProfileId: string, user: AuthUser) {
    const scoped = this.scopedStudentWhere(user);
    const student = await this.prisma.studentProfile.findFirst({
      where: { id: studentProfileId, ...(Object.keys(scoped).length ? scoped : {}) },
      include: { user: { select: { campusId: true, fullName: true } }, ...financeStudentSectionInclude }
    });
    if (!student) throw new NotFoundException("Student not found.");
    assertStudentSelfProfile(user, student);
    return student;
  }

  private async getActiveSectionTree(sectionId: string) {
    const section = await this.prisma.section.findUnique({
      where: { id: sectionId },
      include: { class: { include: { batch: { include: { branch: { include: { program: { include: { campus: true } } } } } } } } }
    });
    if (
      !section ||
      section.status !== StructureStatus.ACTIVE ||
      section.isArchived ||
      section.class.status !== StructureStatus.ACTIVE ||
      section.class.isArchived ||
      section.class.batch.status !== StructureStatus.ACTIVE ||
      section.class.batch.isArchived ||
      section.class.batch.branch.status !== StructureStatus.ACTIVE ||
      section.class.batch.branch.isArchived ||
      section.class.batch.branch.program.status !== StructureStatus.ACTIVE ||
      section.class.batch.branch.program.isArchived
    ) {
      throw new BadRequestException("Selected section hierarchy is archived or invalid.");
    }
    return section;
  }

  private async assertFeeHierarchy(section: Awaited<ReturnType<FinanceService["getActiveSectionTree"]>>, dto: Pick<AssignFeeDto, "branchId" | "campusId" | "classId" | "programId" | "sectionId">) {
    const operationalCampus = await this.sharedGroup.loadCampus(dto.campusId);
    if (!operationalCampus || operationalCampus.status !== StructureStatus.ACTIVE) {
      throw new BadRequestException("Campus does not exist or is archived.");
    }
    this.sharedGroup.assertScopeCampusMatchesSectionProgram(section.class.batch.branch.program, dto.campusId, operationalCampus);
    if (dto.programId !== section.class.batch.branch.programId) throw new BadRequestException("Department does not match selected section.");
    if (dto.branchId !== section.class.batch.branchId) throw new BadRequestException("Branch does not match selected section.");
    if (dto.classId !== section.classId) throw new BadRequestException("Class does not match selected section.");
    if (dto.sectionId !== section.id) throw new BadRequestException("Invalid selected section.");
  }

  private async studentsForFeeTarget(dto: AssignFeeDto) {
    if (dto.targetType === "STUDENT") {
      if (!dto.studentId) throw new BadRequestException("Select a student for student fee assignment.");
      const student = await this.prisma.studentProfile.findFirst({
        where: { id: dto.studentId, sectionId: dto.sectionId, currentStatus: UserStatus.ACTIVE, isArchived: false },
        select: { id: true }
      });
      if (!student) throw new BadRequestException("Selected student is archived, inactive, or not in the selected section.");
      return [student];
    }
    return this.prisma.studentProfile.findMany({
      where: { sectionId: dto.sectionId, currentStatus: UserStatus.ACTIVE, isArchived: false },
      select: { id: true },
      orderBy: { rollNumber: "asc" }
    });
  }

  private async upsertFeeHead(tx: Prisma.TransactionClient | PrismaService, feeHeadName: string) {
    const name = feeHeadName.trim();
    const code = name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30) || `FEE_${Date.now()}`;
    return tx.feeHead.upsert({
      where: { code },
      update: { name, isActive: true },
      create: { code, name }
    });
  }

  private async ensureFeeHead(id: string) {
    const head = await this.prisma.feeHead.findUnique({ where: { id } });
    if (!head || !head.isActive) throw new BadRequestException("Fee head does not exist or is inactive.");
    return head;
  }

  private assertAllowed(user: AuthUser, action: PermissionAction, scope?: ScopeRef) {
    const decision = this.permissions.can(user, { action, scope });
    if (!decision.allowed) throw new ForbiddenException(decision.reason);
  }

  private queryToScope(query: FeeQueryDto): ScopeRef | undefined {
    if (!query.campusId && !query.sectionId) return undefined;
    return { campusId: query.campusId, sectionId: query.sectionId };
  }

  private studentToScope(student: Parameters<typeof studentProfileToScope>[0]): ScopeRef {
    return studentProfileToScope(student);
  }

  private buildReceiptNo() {
    return `RCPT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }

  private buildTransactionId(receiptNo: string, custom?: string | null) {
    const trimmed = custom?.trim();
    if (trimmed) return trimmed.toUpperCase();
    return `TXN-${receiptNo.replace(/[^\w.-]+/g, "-").toUpperCase()}`;
  }

  private toPaymentObject(payment: {
    id: string;
    receiptNo: string;
    amount: Prisma.Decimal;
    paymentMode: string;
    paidAt: Date;
    status: FeePaymentStatus;
    feeHead: { id: string; name: string; code: string };
    studentFeeAssignmentId?: string | null;
    studentFeeAssignment?: { feeStructure: { id: string; feeHeadName: string | null; amount: Prisma.Decimal; dueDate: Date | null; feeHead: { id: string; name: string; code: string } } } | null;
    studentProfile: { id: string; rollNumber: string; user: { fullName: string }; section: { name: string } };
    receivedBy: { fullName: string };
  }) {
    const feeStructure = payment.studentFeeAssignment?.feeStructure;
    return {
      id: payment.id,
      receiptNo: payment.receiptNo,
      amount: Number(payment.amount),
      paymentMode: payment.paymentMode,
      paidAt: payment.paidAt,
      status: payment.status,
      feeHead: payment.feeHead,
      assignment: feeStructure
        ? {
            id: payment.studentFeeAssignmentId,
            feeStructureId: feeStructure.id,
            feeHeadName: feeStructure.feeHeadName ?? feeStructure.feeHead.name,
            dueAmount: Number(feeStructure.amount),
            deadline: feeStructure.dueDate ? formatIstDate(feeStructure.dueDate) : null
          }
        : null,
      student: {
        id: payment.studentProfile.id,
        rollNumber: payment.studentProfile.rollNumber,
        fullName: payment.studentProfile.user.fullName,
        section: payment.studentProfile.section.name
      },
      receivedBy: payment.receivedBy.fullName
    };
  }

  private toStudentAssignedFeeObject(assignment: {
    id: string;
    paymentStatus: StudentFeePaymentStatus;
    assignedAt: Date;
    feeStructure: {
      id: string;
      feeHeadName: string | null;
      amount: Prisma.Decimal;
      dueDate: Date | null;
      remarks: string | null;
      feeHead: { id: string; code: string; name: string };
      campus: { id: string; code: string; name: string };
      program: { id: string; code: string; name: string } | null;
      branch: { id: string; code: string; name: string } | null;
      class: { id: string; label: string; semesterNumber: number } | null;
      section: { id: string; name: string; code: string | null } | null;
    };
    payments: { amount: Prisma.Decimal | number }[];
  }) {
    const paidAmount = assignment.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const dueAmount = Number(assignment.feeStructure.amount);
    const balance = Math.max(dueAmount - paidAmount, 0);
    const overdue = computeFeeOverdue(balance, assignment.feeStructure.dueDate);
    return {
      id: assignment.id,
      feeStructureId: assignment.feeStructure.id,
      feeHeadName: assignment.feeStructure.feeHeadName ?? assignment.feeStructure.feeHead.name,
      feeHead: assignment.feeStructure.feeHead,
      dueAmount,
      paidAmount,
      balance,
      status: assignment.paymentStatus,
      feeStatus: overdue.status,
      daysOverdue: overdue.daysOverdue,
      deadline: assignment.feeStructure.dueDate ? formatIstDate(assignment.feeStructure.dueDate) : null,
      remarks: assignment.feeStructure.remarks,
      campus: assignment.feeStructure.campus,
      department: assignment.feeStructure.program,
      branch: assignment.feeStructure.branch,
      class: assignment.feeStructure.class,
      section: assignment.feeStructure.section,
      assignedAt: assignment.assignedAt.toISOString()
    };
  }

  private toAssignedFeeObject(structure: {
    id: string;
    feeHeadName: string | null;
    amount: Prisma.Decimal | number;
    remarks: string | null;
    dueDate: Date | null;
    isActive: boolean;
    isArchived: boolean;
    createdAt: Date;
    updatedAt: Date;
    feeHead: { id: string; code: string; name: string };
    campus: { id: string; code: string; name: string };
    program: { id: string; code: string; name: string } | null;
    branch: { id: string; code: string; name: string } | null;
    class: { id: string; label: string; semesterNumber: number } | null;
    section: { id: string; name: string; code: string | null } | null;
    assignments: { id?: string; studentId: string; paymentStatus: StudentFeePaymentStatus }[];
    createdBy?: { fullName: string } | null;
  }) {
    const counts = structure.assignments.reduce<Record<StudentFeePaymentStatus, number>>((acc, assignment) => {
      acc[assignment.paymentStatus] = (acc[assignment.paymentStatus] ?? 0) + 1;
      return acc;
    }, { PAID: 0, PARTIAL: 0, UNPAID: 0 });
    return {
      id: structure.id,
      feeHeadName: structure.feeHeadName ?? structure.feeHead.name,
      feeHead: structure.feeHead,
      feeAmount: Number(structure.amount),
      remarks: structure.remarks,
      deadline: structure.dueDate ? formatIstDate(structure.dueDate) : null,
      campus: structure.campus,
      department: structure.program,
      branch: structure.branch,
      class: structure.class,
      section: structure.section,
      assignedStudents: structure.assignments.length,
      paymentStatus: counts,
      createdBy: structure.createdBy?.fullName ?? null,
      createdAt: structure.createdAt.toISOString(),
      updatedAt: structure.updatedAt.toISOString(),
      isActive: structure.isActive,
      isArchived: structure.isArchived
    };
  }

  async searchStudentsByRollForPayments(user: AuthUser, query: PaymentsRollSearchQueryDto) {
    if (user.type === UserType.STUDENT) throw new ForbiddenException("Students cannot search payment records.");
    const q = query.q.trim();
    if (!q.length) throw new BadRequestException("Enter a roll number.");
    const batch = await this.prisma.batch.findFirst({
      where: { id: query.batchId, status: StructureStatus.ACTIVE, isArchived: false },
      include: { branch: { include: { program: { select: { campusId: true } } } } }
    });
    if (!batch) throw new BadRequestException("Invalid batch.");
    await this.campusScope.assertBatchInScope(user, query.batchId);
    this.assertAllowed(user, PermissionAction.VIEW_FEES, { campusId: batch.branch.program.campusId });
    const adminScope = this.adminStudentScopeWhere(user);
    const students = await this.prisma.studentProfile.findMany({
      where: {
        ...(Object.keys(adminScope).length ? adminScope : {}),
        currentStatus: UserStatus.ACTIVE,
        isArchived: false,
        rollNumber: { startsWith: q, mode: "insensitive" },
        section: { class: { batchId: query.batchId } }
      },
      select: {
        id: true,
        rollNumber: true,
        user: { select: { fullName: true } },
        section: { select: { id: true, name: true, class: { select: { id: true, label: true, semesterNumber: true } } } }
      },
      orderBy: { rollNumber: "asc" },
      take: 25
    });
    return {
      items: students.map((row) => ({
        id: row.id,
        rollNumber: row.rollNumber,
        fullName: row.user.fullName,
        sectionId: row.section.id,
        sectionName: row.section.name,
        classLabel: row.section.class.label,
        semesterNumber: row.section.class.semesterNumber
      }))
    };
  }

  async getStudentPaymentContext(user: AuthUser, studentProfileId: string, batchId: string) {
    await this.assertStudentInBatch(studentProfileId, batchId);
    const student = await this.getStudentForFinance(studentProfileId, user);
    this.assertAllowed(user, PermissionAction.VIEW_FEES, this.studentToScope(student));
    const payable = await this.listPayableFeeLinesInternal(student.id);
    const recentPayments = await this.prisma.feePayment.findMany({
      where: { studentProfileId: student.id, status: FeePaymentStatus.ACTIVE },
      orderBy: { paidAt: "desc" },
      take: 10,
      select: {
        id: true,
        receiptNo: true,
        amount: true,
        paymentMode: true,
        paidAt: true,
        status: true,
        feeHead: { select: { id: true, name: true, code: true } },
        studentFeeAssignment: { select: { feeStructure: { select: { feeHeadName: true } } } }
      }
    });
    const prog = student.section.class.batch.branch.program;
    const branch = student.section.class.batch.branch;
    const batch = student.section.class.batch;
    const campus = await this.prisma.campus.findUnique({
      where: { id: prog.campusId },
      select: { id: true, code: true, name: true }
    });
    return {
      student: {
        id: student.id,
        fullName: student.user.fullName,
        rollNumber: student.rollNumber,
        campus: { id: campus?.id ?? prog.campusId, code: campus?.code ?? "", name: campus?.name ?? "" },
        department: { id: prog.id, code: prog.code, name: prog.name },
        branch: { id: branch.id, code: branch.code, name: branch.name },
        batch: { id: batch.id, startYear: batch.startYear, endYear: batch.endYear },
        class: { id: student.section.class.id, label: student.section.class.label, semesterNumber: student.section.class.semesterNumber },
        section: { id: student.section.id, name: student.section.name }
      },
      payableFees: payable,
      recentPayments: recentPayments.map((p) => ({
        id: p.id,
        receiptNo: p.receiptNo,
        amount: Number(p.amount),
        paymentMode: p.paymentMode,
        paidAt: p.paidAt.toISOString(),
        status: p.status,
        feeLabel: p.studentFeeAssignment?.feeStructure.feeHeadName ?? p.feeHead.name
      }))
    };
  }

  async listPayableFeeLinesForStudent(user: AuthUser, studentProfileId: string) {
    const student = await this.getStudentForFinance(studentProfileId, user);
    this.assertAllowed(user, PermissionAction.VIEW_FEES, this.studentToScope(student));
    return { items: await this.listPayableFeeLinesInternal(studentProfileId) };
  }

  async previewPhysicalPayment(user: AuthUser, dto: PreviewPhysicalFeeDto) {
    await this.assertStudentInBatch(dto.studentProfileId, dto.batchId);
    const student = await this.getStudentForFinance(dto.studentProfileId, user);
    this.assertAllowed(user, PermissionAction.VIEW_FEES, this.studentToScope(student));
    if (dto.feeLineKind === "OTHER") {
      return {
        feeLineKind: "OTHER" as const,
        feeDisplayName: dto.otherFeeSpecification?.trim(),
        amount: dto.amount,
        totalDue: null,
        paidBefore: null,
        paidAfter: null,
        remainingAfter: null,
        percentagePaid: null,
        paymentStatusWord: "Recorded"
      };
    }
    if (!dto.studentFeeAssignmentId) throw new BadRequestException("Select a fee line.");
    const assignment = await this.getAssignmentForPayment(dto.studentFeeAssignmentId, user);
    if (assignment.studentId !== dto.studentProfileId) throw new BadRequestException("Selected fee does not belong to this student.");
    const due = Number(assignment.feeStructure.amount);
    const paidBefore = assignment.payments.reduce((sum, row) => sum + Number(row.amount), 0);
    const balance = Math.max(due - paidBefore, 0);
    if (balance <= 0) throw new BadRequestException("Selected fee is already fully paid.");
    if (dto.amount > balance) throw new BadRequestException("Payment amount cannot be greater than the remaining fee balance.");
    const paidAfter = paidBefore + dto.amount;
    const progress = this.feeLedgerProgress(due, paidAfter);
    return {
      feeLineKind: "ASSIGNMENT" as const,
      studentFeeAssignmentId: assignment.id,
      feeDisplayName: assignment.feeStructure.feeHeadName ?? assignment.feeStructure.feeHead.name,
      totalDue: due,
      paidBefore,
      amount: dto.amount,
      paidAfter,
      remainingAfter: Math.max(due - paidAfter, 0),
      percentagePaid: progress.percentagePaid,
      paymentStatusWord: progress.paymentStatusWord
    };
  }

  async registerPhysicalPayment(user: AuthUser, dto: RegisterPhysicalFeeDto) {
    if (user.type === UserType.STUDENT) throw new ForbiddenException("Students cannot register counter payments.");
    await this.assertStudentInBatch(dto.studentProfileId, dto.batchId);
    const student = await this.getStudentForFinance(dto.studentProfileId, user);
    this.assertAllowed(user, PermissionAction.MARK_FEES, this.studentToScope(student));
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : undefined;
    if (paidAt && Number.isNaN(paidAt.getTime())) throw new BadRequestException("Invalid payment date.");
    const route = "POST /api/payments/register";
    const requestHash = JSON.stringify({
      studentProfileId: dto.studentProfileId,
      batchId: dto.batchId,
      feeLineKind: dto.feeLineKind,
      studentFeeAssignmentId: dto.studentFeeAssignmentId ?? "",
      otherFeeSpecification: dto.otherFeeSpecification ?? "",
      amount: dto.amount,
      paymentMode: dto.paymentMode,
      paidAt: dto.paidAt ?? "",
      note: dto.note ?? ""
    });
    const existingKey = await this.prisma.idempotencyKey.findUnique({ where: { key: dto.idempotencyKey } });
    if (existingKey) {
      if (existingKey.userId === user.id && existingKey.route === route && existingKey.requestHash === requestHash && existingKey.response) {
        return existingKey.response;
      }
      throw new BadRequestException("Payment request key was already used for a different operation.");
    }
    const receiptNo = this.buildReceiptNo();
    const transactionId = this.buildTransactionId(receiptNo);
    try {
      const response = await this.prisma.$transaction(async (tx) => {
        await tx.idempotencyKey.create({
          data: {
            key: dto.idempotencyKey,
            userId: user.id,
            route,
            requestHash,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
          }
        });
        let created;
        let summary: {
          feeDisplayName: string;
          paymentSource: FeePaymentMode;
          paidAtIso: string;
          amountPaid: number;
          percentagePaid: number | null;
          paymentStatusWord: string;
        };
        if (dto.feeLineKind === "ASSIGNMENT") {
          if (!dto.studentFeeAssignmentId) throw new BadRequestException("Select a fee line.");
          const assignment = await this.getAssignmentForPayment(dto.studentFeeAssignmentId, user);
          if (assignment.studentId !== dto.studentProfileId) throw new BadRequestException("Selected fee does not belong to this student.");
          const balance = this.assignmentBalance(assignment);
          if (balance <= 0) throw new BadRequestException("Selected fee is already fully paid.");
          if (dto.amount > balance) throw new BadRequestException("Payment amount cannot be greater than the remaining fee balance.");
          const paidBefore = assignment.payments.reduce((sum, row) => sum + Number(row.amount), 0);
          const due = Number(assignment.feeStructure.amount);
          created = await tx.feePayment.create({
            data: {
              receiptNo,
              transactionId,
              studentProfileId: assignment.studentId,
              studentFeeAssignmentId: assignment.id,
              feeHeadId: assignment.feeStructure.feeHeadId,
              amount: dto.amount,
              paymentMode: dto.paymentMode,
              paidAt,
              note: dto.note?.trim(),
              receivedById: user.id
            },
            include: {
              feeHead: true,
              studentFeeAssignment: { include: { feeStructure: { include: { feeHead: true } } } },
              studentProfile: { include: { user: true, section: true } },
              receivedBy: { select: { fullName: true } }
            }
          });
          await this.recalculateAssignmentStatus(tx, assignment.id, Number(assignment.feeStructure.amount));
          const progress = this.feeLedgerProgress(due, paidBefore + dto.amount);
          summary = {
            feeDisplayName: assignment.feeStructure.feeHeadName ?? assignment.feeStructure.feeHead.name,
            paymentSource: dto.paymentMode,
            paidAtIso: created.paidAt.toISOString(),
            amountPaid: Number(created.amount),
            percentagePaid: progress.percentagePaid,
            paymentStatusWord: progress.paymentStatusWord
          };
        } else {
          const spec = dto.otherFeeSpecification?.trim();
          if (!spec) throw new BadRequestException("Specify the fee head for Other.");
          const head = await this.upsertFeeHead(tx, spec);
          created = await tx.feePayment.create({
            data: {
              receiptNo,
              transactionId,
              studentProfileId: dto.studentProfileId,
              feeHeadId: head.id,
              amount: dto.amount,
              paymentMode: dto.paymentMode,
              paidAt,
              note: dto.note?.trim(),
              receivedById: user.id
            },
            include: {
              feeHead: true,
              studentFeeAssignment: { include: { feeStructure: { include: { feeHead: true } } } },
              studentProfile: { include: { user: true, section: true } },
              receivedBy: { select: { fullName: true } }
            }
          });
          summary = {
            feeDisplayName: head.name,
            paymentSource: dto.paymentMode,
            paidAtIso: created.paidAt.toISOString(),
            amountPaid: Number(created.amount),
            percentagePaid: null,
            paymentStatusWord: "Recorded"
          };
        }
        await tx.auditLog.create({
          data: {
            userId: user.auditUserId,
            action: "REGISTER_PHYSICAL_FEE_PAYMENT",
            entity: "FeePayment",
            entityId: created.id,
            metadata: {
              receiptNo,
              studentProfileId: dto.studentProfileId,
              feeLineKind: dto.feeLineKind,
              amount: dto.amount,
              paymentMode: dto.paymentMode
            } as Prisma.InputJsonObject
          }
        });
        const payload = {
          payment: this.toPaymentObject(created),
          summary
        };
        await tx.idempotencyKey.update({ where: { key: dto.idempotencyKey }, data: { response: payload as Prisma.InputJsonObject } });
        return payload;
      });
      await this.invalidateDashboardCache();
      return response;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Receipt number or idempotency conflict.");
      }
      throw error;
    }
  }

  private feeLedgerProgress(totalDue: number, paidTotal: number) {
    const percentagePaid = totalDue <= 0 ? 100 : Math.min(100, Math.round((100 * paidTotal) / totalDue));
    const paymentStatusWord = paidTotal >= totalDue ? "Full" : paidTotal > 0 ? "Partial" : "Unpaid";
    return { percentagePaid, paymentStatusWord };
  }

  private async assertStudentInBatch(studentProfileId: string, batchId: string) {
    const row = await this.prisma.studentProfile.findFirst({
      where: { id: studentProfileId, section: { class: { batchId } }, currentStatus: UserStatus.ACTIVE, isArchived: false },
      select: { id: true }
    });
    if (!row) throw new BadRequestException("Student not found in the selected batch or is inactive.");
  }

  private async listPayableFeeLinesInternal(studentProfileId: string) {
    const rows = await this.prisma.studentFeeAssignment.findMany({
      where: { studentId: studentProfileId, feeStructure: { isActive: true, isArchived: false } },
      include: {
        feeStructure: { include: { feeHead: true } },
        payments: { where: { status: FeePaymentStatus.ACTIVE }, select: { amount: true } }
      },
      orderBy: { assignedAt: "desc" }
    });
    const items: {
      kind: "ASSIGNMENT";
      studentFeeAssignmentId: string;
      feeStructureId: string;
      feeDisplayName: string;
      feeHeadId: string;
      totalDue: number;
      paidAmount: number;
      balance: number;
      percentagePaid: number;
      paymentStatusWord: string;
      assignmentPaymentStatus: StudentFeePaymentStatus;
    }[] = [];
    for (const row of rows) {
      const due = Number(row.feeStructure.amount);
      const paid = row.payments.reduce((s, p) => s + Number(p.amount), 0);
      const balance = Math.max(due - paid, 0);
      if (balance <= 0.000_000_1) continue;
      const progress = this.feeLedgerProgress(due, paid);
      items.push({
        kind: "ASSIGNMENT",
        studentFeeAssignmentId: row.id,
        feeStructureId: row.feeStructure.id,
        feeDisplayName: row.feeStructure.feeHeadName ?? row.feeStructure.feeHead.name,
        feeHeadId: row.feeStructure.feeHeadId,
        totalDue: due,
        paidAmount: paid,
        balance,
        percentagePaid: progress.percentagePaid,
        paymentStatusWord: progress.paymentStatusWord,
        assignmentPaymentStatus: row.paymentStatus
      });
    }
    return items;
  }

  private async audit(user: AuthUser, action: string, entity: string, entityId?: string, metadata?: Prisma.InputJsonObject) {
    await this.prisma.auditLog.create({ data: { action, entity, entityId, userId: user.auditUserId, metadata } });
  }
}
