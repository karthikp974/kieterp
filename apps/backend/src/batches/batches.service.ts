import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { FeePaymentStatus, Prisma, StructureStatus, TeacherRoleKind } from "@prisma/client";
import { Response } from "express";
import { toPagination } from "../common/pagination.dto";
import { normalizeCode } from "../core/structure.util";
import { AuthUser } from "../auth/auth.types";
import { CampusScopeService } from "../permissions/campus-scope.service";
import { SharedGroupAcademicService } from "../permissions/shared-group-academic.service";
import { PrismaService } from "../prisma/prisma.service";
import { BatchExportQueryDto, BatchSearchQueryDto, CreateBatchModuleDto, UpdateBatchModuleDto } from "./batches.dto";

@Injectable()
export class BatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly campusScope: CampusScopeService,
    private readonly sharedGroup: SharedGroupAcademicService
  ) {}

  async search(query: BatchSearchQueryDto) {
    const pagination = toPagination(query);
    const where = await this.batchWhere(query);
    const [items, total] = await Promise.all([
      this.prisma.batch.findMany({
        where,
        include: this.batchInclude(),
        orderBy: [{ startYear: "desc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.batch.count({ where })
    ]);
    return { items: items.map((item) => this.batchResponse(item)), total, page: pagination.page, pageSize: pagination.pageSize };
  }

  async details(id: string, user: AuthUser) {
    await this.campusScope.assertBatchInScope(user, id);
    const batch = await this.prisma.batch.findFirst({ where: { id, status: StructureStatus.ACTIVE, isArchived: false }, include: this.batchInclude() });
    if (!batch) throw new NotFoundException("Batch not found.");
    const students = await this.studentsForBatch(id);
    const teachers = await this.teacherSummary(id);
    return { ...this.batchResponse(batch), teachers, students };
  }

  async create(dto: CreateBatchModuleDto) {
    const branch = await this.ensureBranch(dto.departmentId, dto.branchId);
    if (dto.classId || dto.sectionId) await this.ensureClassSectionContext(dto.branchId, dto.classId, dto.sectionId);
    const startYear = dto.startYear;
    const endYear = startYear + branch.program.durationValue;
    const batchCode = normalizeCode(dto.batchCode);
    await this.ensureBatchCodeAvailable(batchCode);
    const created = await this.safeWrite(() =>
      this.prisma.$transaction(async (tx) => {
        const batch = await tx.batch.create({
          data: { branchId: dto.branchId, startYear, endYear, batchCode }
        });

        if (dto.classId) {
          await tx.academicClass.update({ where: { id: dto.classId }, data: { batchId: batch.id } });
        }

        return tx.batch.findUniqueOrThrow({
          where: { id: batch.id },
          include: this.batchInclude()
        });
      })
    );
    await this.audit("CREATE_BATCH", "Batch", created.id, { batchCode: created.batchCode, startYear: created.startYear, endYear: created.endYear });
    return this.batchResponse(created);
  }

  async update(id: string, dto: UpdateBatchModuleDto, user: AuthUser) {
    await this.ensureBatch(id);
    await this.campusScope.assertBatchInScope(user, id);
    const batchCode = normalizeCode(dto.batchCode);
    await this.ensureBatchCodeAvailable(batchCode, id);
    const updated = await this.safeWrite(() =>
      this.prisma.batch.update({ where: { id }, data: { batchCode }, include: this.batchInclude() })
    );
    await this.audit("UPDATE_BATCH", "Batch", updated.id, { batchCode: updated.batchCode });
    return this.batchResponse(updated);
  }

  async archive(id: string, user: AuthUser) {
    await this.ensureBatch(id);
    await this.campusScope.assertBatchInScope(user, id);
    const archived = await this.prisma.batch.update({
      where: { id },
      data: { status: StructureStatus.ARCHIVED, isArchived: true, archivedAt: new Date() },
      include: this.batchInclude()
    });
    await this.audit("ARCHIVE_BATCH", "Batch", archived.id, { batchCode: archived.batchCode });
    return this.batchResponse(archived);
  }

  async export(id: string, query: BatchExportQueryDto, response: Response, user: AuthUser) {
    const details = await this.details(id, user);
    const summaryRows = [
      ["Class Name", details.classes.map((item) => item.name).join("; ")],
      ["Class ID", details.classes.map((item) => item.code).join("; ")],
      ["Section Name", details.sections.map((item) => item.name).join("; ")],
      ["Section ID", details.sections.map((item) => item.code).join("; ")],
      ["Batch", details.batch],
      ["Batch ID", details.batchCode],
      ["HTPO names + IDs", details.teachers.htpo.map((item) => `${item.name} (${item.employeeCode})`).join("; ")],
      ["CTPO names + IDs", details.teachers.ctpo.map((item) => `${item.name} (${item.employeeCode})`).join("; ")],
      ["STPO names + IDs", details.teachers.stpo.map((item) => `${item.name} (${item.employeeCode})`).join("; ")]
    ];
    const studentRows = details.students.map((student) => [student.name, student.rollNumber, student.phone ?? "", student.email, student.classSection, details.batch, student.semester, student.fees.amount, student.fees.status]);
    const csv = [...summaryRows, [], ["Name", "Roll Number", "Phone Number", "Gmail", "Class/Section", "Batch", "Semester (current)", "Fees", "Action"], ...studentRows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, "\"\"")}"`).join(","))
      .join("\n");
    const filename = `${details.batchCode}-batch-export`;
    if (query.format === "pdf" || query.format === "docx") {
      const html = `<html><body><h1>${details.batch}</h1><pre>${csv}</pre></body></html>`;
      response.setHeader("Content-Type", query.format === "docx" ? "application/msword" : "text/html");
      response.setHeader("Content-Disposition", `attachment; filename="${filename}.${query.format === "docx" ? "doc" : "html"}"`);
      response.send(html);
      return;
    }
    response.setHeader("Content-Type", "text/csv");
    response.setHeader("Content-Disposition", `attachment; filename="${filename}.csv"`);
    response.send(csv);
  }

  private async batchWhere(query: BatchSearchQueryDto): Promise<Prisma.BatchWhereInput> {
    const campusScope = query.campusScope ?? "shared";
    const programFilter = await this.sharedGroup.programCatalogFilter(query.campusId, query.departmentId, campusScope);
    return {
      status: StructureStatus.ACTIVE,
      isArchived: false,
      NOT: { batchCode: { startsWith: "STRUCTURE_" } },
      ...(query.search
        ? { OR: [{ batchCode: { contains: query.search, mode: "insensitive" } }, { id: { contains: query.search, mode: "insensitive" } }] }
        : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      branch: {
        status: StructureStatus.ACTIVE,
        isArchived: false,
        ...(programFilter ? { program: programFilter } : {})
      }
    };
  }

  private batchInclude() {
    return {
      branch: { include: { program: { include: { campus: true } } } },
      classes: {
        where: { status: StructureStatus.ACTIVE, isArchived: false },
        include: { sections: { where: { status: StructureStatus.ACTIVE, isArchived: false }, orderBy: { name: "asc" as const } } },
        orderBy: { semesterNumber: "asc" as const }
      }
    };
  }

  private async ensureBranch(departmentId: string, branchId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, programId: departmentId, status: StructureStatus.ACTIVE, isArchived: false, program: { status: StructureStatus.ACTIVE, isArchived: false } },
      include: { program: true }
    });
    if (!branch) throw new BadRequestException("Invalid department and branch relationship.");
    return branch;
  }

  private async ensureClassSectionContext(branchId: string, classId?: string, sectionId?: string) {
    if (classId) {
      const foundClass = await this.prisma.academicClass.findFirst({ where: { id: classId, branchId } });
      if (!foundClass) throw new BadRequestException("Selected class does not belong to the selected branch.");
    }
    if (sectionId) {
      const foundSection = await this.prisma.section.findFirst({ where: { id: sectionId, class: { branchId } } });
      if (!foundSection) throw new BadRequestException("Selected section does not belong to the selected branch.");
    }
  }

  private async ensureBatch(id: string) {
    const batch = await this.prisma.batch.findFirst({ where: { id, status: StructureStatus.ACTIVE, isArchived: false } });
    if (!batch) throw new NotFoundException("Batch not found.");
    return batch;
  }

  private async ensureBatchCodeAvailable(batchCode: string, excludeId?: string) {
    const existing = await this.prisma.batch.findFirst({ where: { batchCode, ...(excludeId ? { id: { not: excludeId } } : {}) } });
    if (existing) throw new ConflictException("Batch code already exists.");
  }

  private async studentsForBatch(batchId: string) {
    const students = await this.prisma.studentProfile.findMany({
      where: { currentStatus: "ACTIVE", section: { class: { batchId } } },
      include: { user: true, section: { include: { class: true } }, feePayments: { where: { status: FeePaymentStatus.ACTIVE } } },
      orderBy: { rollNumber: "asc" }
    });
    const feeStructures = await this.prisma.feeStructure.findMany({ where: { isActive: true, batchId } });
    const feeAmount = Number(feeStructures[0]?.amount ?? 0);
    return students.map((student) => {
      const paid = student.feePayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      return {
        id: student.id,
        name: student.user.fullName,
        rollNumber: student.rollNumber,
        phone: student.user.phone,
        email: student.user.email,
        classSection: `${student.section.class.label} / ${student.section.name}`,
        semester: student.section.class.semesterNumber,
        fees: { amount: feeAmount, status: paid >= feeAmount && feeAmount > 0 ? "Paid" : "Unpaid" }
      };
    });
  }

  private async teacherSummary(batchId: string) {
    const assignments = await this.prisma.teacherRoleAssignment.findMany({
      where: { isActive: true, OR: [{ batchId }, { class: { batchId } }, { section: { class: { batchId } } }] },
      include: { user: true, teacherProfile: true }
    });
    const mapRole = (role: TeacherRoleKind) => assignments.filter((item) => item.role === role).map((item) => ({ name: item.user.fullName, employeeCode: item.teacherProfile.employeeCode }));
    return { htpo: mapRole(TeacherRoleKind.HTPO), ctpo: mapRole(TeacherRoleKind.CTPO), stpo: mapRole(TeacherRoleKind.STPO) };
  }

  private batchResponse(batch: Prisma.BatchGetPayload<{ include: ReturnType<BatchesService["batchInclude"]> }>) {
    const department = batch.branch.program;
    const sections = batch.classes.flatMap((item) => item.sections.map((section) => ({ id: section.id, name: section.name, code: section.code ?? section.name, classId: item.id })));
    return {
      id: batch.id,
      departmentId: department.id,
      branchId: batch.branchId,
      startYear: batch.startYear,
      endYear: batch.endYear,
      batch: `${batch.startYear} - ${batch.endYear}`,
      batchCode: batch.batchCode ?? `${department.code}_${batch.startYear}_${batch.endYear}`,
      department: { id: department.id, name: department.name, code: department.code, durationYears: department.durationValue },
      branch: { id: batch.branch.id, name: batch.branch.name, code: batch.branch.code },
      classes: batch.classes.map((item) => ({ id: item.id, name: item.label, code: item.code ?? item.label, semester: item.semesterNumber })),
      sections,
      isArchived: batch.isArchived,
      archivedAt: batch.archivedAt
    };
  }

  private async safeWrite<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("A record with the same batch code already exists.");
      throw error;
    }
  }

  private async audit(action: string, entity: string, entityId?: string, metadata?: Prisma.InputJsonObject) {
    await this.prisma.auditLog.create({ data: { action, entity, entityId, metadata } });
  }
}
