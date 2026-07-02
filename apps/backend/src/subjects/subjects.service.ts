import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, StructureStatus } from "@prisma/client";
import { toPagination } from "../common/pagination.dto";
import { normalizeCode, normalizeName } from "../core/structure.util";
import { AuthUser } from "../auth/auth.types";
import { CampusScopeService } from "../permissions/campus-scope.service";
import { SharedGroupAcademicService } from "../permissions/shared-group-academic.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateSubjectModuleDto, SubjectSearchQueryDto, UpdateSubjectModuleDto } from "./subjects.dto";

@Injectable()
export class SubjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly campusScope: CampusScopeService,
    private readonly sharedGroup: SharedGroupAcademicService
  ) {}

  async search(query: SubjectSearchQueryDto) {
    const pagination = toPagination(query);
    const where = await this.subjectWhere(query);
    const [items, total] = await Promise.all([
      this.prisma.subject.findMany({
        where,
        include: this.subjectInclude(),
        orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.subject.count({ where })
    ]);
    return { items: items.map((item) => this.subjectResponse(item)), total, page: pagination.page, pageSize: pagination.pageSize };
  }

  async create(dto: CreateSubjectModuleDto) {
    const branch = await this.ensureRelationship(dto.campusId, dto.departmentId, dto.branchId, dto.batchId);
    if (dto.semester > branch.program.durationValue * 2) {
      throw new BadRequestException("Invalid semester for selected department duration.");
    }
    const subjectCode = normalizeCode(dto.subjectCode);
    await this.ensureSubjectCodeAvailable(subjectCode);
    const created = await this.safeWrite(() =>
      this.prisma.$transaction(async (tx) => {
        const subject = await tx.subject.create({
          data: {
            branchId: dto.branchId,
            batchId: dto.batchId,
            semesterNumber: dto.semester,
            name: normalizeName(dto.subjectName),
            code: subjectCode
          },
          include: this.subjectInclude()
        });
        const sections = await tx.section.findMany({
          where: {
            status: StructureStatus.ACTIVE,
            isArchived: false,
            class: { batchId: dto.batchId, semesterNumber: dto.semester, batch: { branchId: dto.branchId } }
          },
          select: { id: true }
        });
        if (sections.length) {
          await tx.sectionSubjectAssignment.createMany({
            data: sections.map((section) => ({ sectionId: section.id, subjectId: subject.id })),
            skipDuplicates: true
          });
        }
        return subject;
      })
    );
    await this.audit("CREATE_SUBJECT", "Subject", created.id, { code: created.code, name: created.name, semesterNumber: created.semesterNumber });
    return this.subjectResponse(created);
  }

  async update(id: string, dto: UpdateSubjectModuleDto, user: AuthUser) {
    const subject = await this.ensureSubject(id);
    await this.campusScope.assertBranchInScope(user, subject.branchId);
    const code = dto.subjectCode ? normalizeCode(dto.subjectCode) : undefined;
    if (code) await this.ensureSubjectCodeAvailable(code, id);
    const updated = await this.safeWrite(() =>
      this.prisma.subject.update({
        where: { id },
        data: {
          name: dto.subjectName ? normalizeName(dto.subjectName) : undefined,
          code
        },
        include: this.subjectInclude()
      })
    );
    await this.audit("UPDATE_SUBJECT", "Subject", updated.id, { code: updated.code, name: updated.name });
    return this.subjectResponse(updated);
  }

  async archive(id: string, user: AuthUser) {
    const subject = await this.ensureSubject(id);
    await this.campusScope.assertBranchInScope(user, subject.branchId);
    const archivedAt = new Date();
    const archived = await this.prisma.$transaction(async (tx) => {
      await tx.sectionSubjectAssignment.updateMany({ where: { subjectId: id, isActive: true }, data: { isActive: false } });
      return tx.subject.update({
        where: { id },
        data: { status: StructureStatus.ARCHIVED, isArchived: true, archivedAt },
        include: this.subjectInclude()
      });
    });
    await this.audit("ARCHIVE_SUBJECT", "Subject", archived.id, { code: archived.code, name: archived.name });
    return this.subjectResponse(archived);
  }

  private async subjectWhere(query: SubjectSearchQueryDto): Promise<Prisma.SubjectWhereInput> {
    const campusScope = query.campusScope ?? "shared";
    const programFilter = await this.sharedGroup.programCatalogFilter(query.campusId, query.departmentId, campusScope);
    return {
      status: StructureStatus.ACTIVE,
      isArchived: false,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.batchId ? { batchId: query.batchId } : {}),
      ...(query.semester ? { semesterNumber: query.semester } : {}),
      ...(query.classId || query.sectionId
        ? {
            sectionAssignments: {
              some: {
                isActive: true,
                ...(query.sectionId ? { sectionId: query.sectionId } : {}),
                section: {
                  status: StructureStatus.ACTIVE,
                  isArchived: false,
                  ...(query.classId ? { classId: query.classId } : {})
                }
              }
            }
          }
        : {}),
      branch: {
        status: StructureStatus.ACTIVE,
        isArchived: false,
        ...(query.departmentId ? { programId: query.departmentId } : {}),
        ...(programFilter ? { program: programFilter } : {})
      },
      ...(query.search
        ? { OR: [{ code: { contains: query.search, mode: "insensitive" } }, { name: { contains: query.search, mode: "insensitive" } }] }
        : {})
    };
  }

  private subjectInclude() {
    return {
      branch: { include: { program: { include: { campus: true } } } },
      batch: true,
      sectionAssignments: {
        where: { isActive: true },
        include: { section: { include: { class: true } } }
      }
    };
  }

  private async ensureRelationship(campusId: string, departmentId: string, branchId: string, batchId: string) {
    const programFilter = await this.sharedGroup.programRelationFilter(campusId, departmentId);
    const branch = await this.prisma.branch.findFirst({
      where: {
        id: branchId,
        programId: departmentId,
        status: StructureStatus.ACTIVE,
        isArchived: false,
        ...(programFilter ? { program: programFilter } : {})
      },
      include: { program: { include: { campus: true } } }
    });
    if (!branch) throw new BadRequestException("Invalid campus, department, and branch relationship.");
    const operationalCampus = await this.sharedGroup.loadCampus(campusId);
    if (!operationalCampus) throw new BadRequestException("Campus does not exist or is archived.");
    this.sharedGroup.assertOperationalCampusMatchesStructure(branch.program, operationalCampus);
    const batch = await this.prisma.batch.findFirst({ where: { id: batchId, branchId, status: StructureStatus.ACTIVE, isArchived: false } });
    if (!batch) throw new BadRequestException("Invalid batch for selected branch.");
    return branch;
  }

  private async ensureSubject(id: string) {
    const subject = await this.prisma.subject.findFirst({ where: { id, status: StructureStatus.ACTIVE, isArchived: false } });
    if (!subject) throw new NotFoundException("Subject not found.");
    return subject;
  }

  private async ensureSubjectCodeAvailable(code: string, excludeId?: string) {
    const existing = await this.prisma.subject.findFirst({ where: { code, ...(excludeId ? { id: { not: excludeId } } : {}) } });
    if (existing) throw new ConflictException("Subject code already exists.");
  }

  private subjectResponse(subject: Prisma.SubjectGetPayload<{ include: ReturnType<SubjectsService["subjectInclude"]> }>) {
    const department = subject.branch.program;
    const semesterYear = Math.ceil(subject.semesterNumber / 2);
    const semesterPart = subject.semesterNumber % 2 === 0 ? 2 : 1;
    return {
      id: subject.id,
      campusId: department.campusId,
      departmentId: department.id,
      branchId: subject.branchId,
      batchId: subject.batchId,
      semester: subject.semesterNumber,
      semesterLabel: `${semesterYear}.${semesterPart}`,
      subjectName: subject.name,
      subjectCode: subject.code,
      isArchived: subject.isArchived,
      archivedAt: subject.archivedAt,
      campus: department.campus,
      department: { id: department.id, name: department.name, code: department.code, durationYears: department.durationValue },
      branch: { id: subject.branch.id, name: subject.branch.name, code: subject.branch.code },
      batch: subject.batch ? { id: subject.batch.id, batchCode: subject.batch.batchCode, startYear: subject.batch.startYear, endYear: subject.batch.endYear } : null,
      sections: subject.sectionAssignments.map((assignment) => ({
        id: assignment.section.id,
        name: assignment.section.name,
        code: assignment.section.code,
        classId: assignment.section.classId,
        class: {
          id: assignment.section.class.id,
          name: assignment.section.class.label,
          code: assignment.section.class.code,
          semesterNumber: assignment.section.class.semesterNumber
        }
      }))
    };
  }

  private async safeWrite<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("Subject code already exists.");
      throw error;
    }
  }

  private async audit(action: string, entity: string, entityId?: string, metadata?: Prisma.InputJsonObject) {
    await this.prisma.auditLog.create({ data: { action, entity, entityId, metadata } });
  }
}
