import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, ProgramDurationUnit, StructureStatus } from "@prisma/client";
import { PaginationQueryDto, toPagination } from "../common/pagination.dto";
import { normalizeCode, normalizeName } from "../core/structure.util";
import { AuthUser } from "../auth/auth.types";
import { CampusScopeService } from "../permissions/campus-scope.service";
import { SharedGroupAcademicService } from "../permissions/shared-group-academic.service";
import { PrismaService } from "../prisma/prisma.service";
import { BranchQueryDto, CreateBranchesDto, CreateDepartmentDto, DepartmentBranchRowDto, DepartmentQueryDto, UpdateBranchDto, UpdateDepartmentDto } from "./department-branch.dto";

@Injectable()
export class DepartmentBranchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly campusScope: CampusScopeService,
    private readonly sharedGroup: SharedGroupAcademicService
  ) {}

  async campuses(query: PaginationQueryDto) {
    const pagination = toPagination(query);
    const where: Prisma.CampusWhereInput = {
      isActive: true,
      status: StructureStatus.ACTIVE,
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: "insensitive" } },
              { name: { contains: query.search, mode: "insensitive" } }
            ]
          }
        : {})
    };

    const [items, total] = await Promise.all([
      this.prisma.campus.findMany({
        where,
        include: { group: true },
        orderBy: { code: "asc" },
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.campus.count({ where })
    ]);
    return { items, total, page: pagination.page, pageSize: pagination.pageSize };
  }

  async listDepartments(query: DepartmentQueryDto) {
    const pagination = toPagination(query);
    const campusScope = query.campusScope ?? "shared";
    const campusProgramFilter = query.campusId
      ? campusScope === "owned"
        ? { campusId: query.campusId, campus: { status: StructureStatus.ACTIVE } }
        : await this.sharedGroup.programWhereForCampusFilter(query.campusId)
      : {};
    const where: Prisma.ProgramWhereInput = {
      ...campusProgramFilter,
      ...(query.includeArchived ? {} : { status: StructureStatus.ACTIVE, isArchived: false }),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: "insensitive" } },
              { name: { contains: query.search, mode: "insensitive" } }
            ]
          }
        : {})
    };

    const [items, total] = await Promise.all([
      this.prisma.program.findMany({
        where,
        include: { campus: true, branches: { where: query.includeArchived ? {} : { status: StructureStatus.ACTIVE, isArchived: false }, orderBy: { code: "asc" } } },
        orderBy: [{ campus: { code: "asc" } }, { code: "asc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.program.count({ where })
    ]);

    return { items: items.map((item) => this.departmentResponse(item)), total, page: pagination.page, pageSize: pagination.pageSize };
  }

  async listBranches(query: BranchQueryDto) {
    const pagination = toPagination(query);
    const campusScope = query.campusScope ?? "shared";
    const programFilter = await this.sharedGroup.programCatalogFilter(query.campusId, query.departmentId, campusScope);
    const where: Prisma.BranchWhereInput = {
      ...(query.departmentId ? { programId: query.departmentId } : {}),
      ...(query.includeArchived ? {} : { status: StructureStatus.ACTIVE, isArchived: false }),
      ...(programFilter ? { program: programFilter } : {}),
      ...(query.search
        ? {
            OR: [
              { code: { contains: query.search, mode: "insensitive" } },
              { name: { contains: query.search, mode: "insensitive" } }
            ]
          }
        : {})
    };

    const [items, total] = await Promise.all([
      this.prisma.branch.findMany({
        where,
        include: { program: { include: { campus: true } } },
        orderBy: [{ program: { campus: { code: "asc" } } }, { code: "asc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.branch.count({ where })
    ]);

    return { items: items.map((item) => this.branchResponse(item)), total, page: pagination.page, pageSize: pagination.pageSize };
  }

  async createDepartment(dto: CreateDepartmentDto) {
    const campus = await this.ensureCampus(dto.campusId);
    const departmentCode = normalizeCode(dto.code);
    const branches = this.normalizeBranchRows(dto.branches ?? []);
    this.assertUniqueCodes([departmentCode], "Department code cannot be repeated.");
    this.assertUniqueCodes(branches.map((branch) => branch.code), "Branch code cannot be repeated.");
    await this.ensureDepartmentCodeAvailable(campus.id, departmentCode);

    const created = await this.safeWrite(() =>
      this.prisma.$transaction(async (tx) =>
        tx.program.create({
          data: {
            campusId: campus.id,
            code: departmentCode,
            name: normalizeName(dto.name),
            durationValue: dto.durationYears,
            durationUnit: ProgramDurationUnit.YEAR,
            semesters: dto.durationYears * 2,
            branches: {
              create: branches.map((branch) => ({
                code: branch.code,
                name: branch.name,
                durationYears: branch.durationYears ?? dto.durationYears
              }))
            }
          },
          include: { campus: true, branches: { orderBy: { code: "asc" } } }
        })
      )
    );

    await this.audit("CREATE_DEPARTMENT", "Program", created.id, { code: created.code, name: created.name });
    return this.departmentResponse(created);
  }

  async updateDepartment(id: string, dto: UpdateDepartmentDto, user: AuthUser) {
    await this.ensureDepartment(id);
    await this.campusScope.assertProgramInScope(user, id);
    const departmentCode = dto.code ? normalizeCode(dto.code) : undefined;
    const branches = dto.branches ? this.normalizeBranchRows(dto.branches) : undefined;
    if (departmentCode) {
      const department = await this.ensureDepartment(id);
      await this.ensureDepartmentCodeAvailable(department.campusId, departmentCode, id);
    }
    if (branches) {
      this.assertUniqueCodes(branches.map((branch) => branch.code), "Branch code cannot be repeated.");
      await this.ensureBranchCodesAvailable(id, branches.map((branch) => branch.code), branches.map((branch) => branch.id).filter(Boolean) as string[]);
    }

    const updated = await this.safeWrite(() =>
      this.prisma.$transaction(async (tx) => {
        const program = await tx.program.update({
          where: { id },
          data: {
            code: departmentCode,
            name: dto.name ? normalizeName(dto.name) : undefined,
            durationValue: dto.durationYears,
            semesters: dto.durationYears ? dto.durationYears * 2 : undefined
          }
        });

        if (branches) {
          for (const branch of branches) {
            if (branch.id) {
              const existingBranch = await tx.branch.findFirst({ where: { id: branch.id, programId: id, status: StructureStatus.ACTIVE, isArchived: false } });
              if (!existingBranch) {
                throw new NotFoundException("Branch not found in this department.");
              }
              await tx.branch.update({
                where: { id: branch.id },
                data: { code: branch.code, name: branch.name, durationYears: branch.durationYears ?? undefined }
              });
            } else {
              await tx.branch.create({
                data: { programId: id, code: branch.code, name: branch.name, durationYears: branch.durationYears ?? program.durationValue }
              });
            }
          }
        }

        return tx.program.findUniqueOrThrow({
          where: { id: program.id },
          include: { campus: true, branches: { where: { status: StructureStatus.ACTIVE, isArchived: false }, orderBy: { code: "asc" } } }
        });
      })
    );

    await this.audit("UPDATE_DEPARTMENT", "Program", updated.id, { code: updated.code, name: updated.name });
    return this.departmentResponse(updated);
  }

  async archiveDepartment(id: string, user: AuthUser) {
    await this.ensureDepartment(id);
    await this.campusScope.assertProgramInScope(user, id);
    const archivedAt = new Date();
    const archived = await this.prisma.$transaction(async (tx) => {
      await tx.branch.updateMany({
        where: { programId: id, isArchived: false },
        data: { status: StructureStatus.ARCHIVED, isArchived: true, archivedAt }
      });
      return tx.program.update({
        where: { id },
        data: { status: StructureStatus.ARCHIVED, isArchived: true, archivedAt },
        include: { campus: true, branches: { orderBy: { code: "asc" } } }
      });
    });
    await this.audit("ARCHIVE_DEPARTMENT", "Program", archived.id, { code: archived.code, name: archived.name });
    return this.departmentResponse(archived);
  }

  async createBranches(dto: CreateBranchesDto) {
    await this.ensureDepartment(dto.departmentId);
    const branches = this.normalizeBranchRows(dto.branches);
    if (!branches.length) {
      throw new BadRequestException("Add at least one branch.");
    }
    this.assertUniqueCodes(branches.map((branch) => branch.code), "Branch code cannot be repeated.");
    await this.ensureBranchCodesAvailable(dto.departmentId, branches.map((branch) => branch.code));

    const program = await this.prisma.program.findUnique({ where: { id: dto.departmentId } });
    const defaultDur = program?.durationValue ?? 4;

    await this.safeWrite(() =>
      this.prisma.branch.createMany({
        data: branches.map((branch) => ({
          programId: dto.departmentId,
          code: branch.code,
          name: branch.name,
          durationYears: branch.durationYears ?? defaultDur
        }))
      })
    );
    await this.audit("CREATE_BRANCHES", "Branch", dto.departmentId, { count: branches.length, codes: branches.map((branch) => branch.code) });
    return this.listBranches({ departmentId: dto.departmentId, page: 1, pageSize: 100 });
  }

  async updateBranch(id: string, dto: UpdateBranchDto, user: AuthUser) {
    const branch = await this.ensureBranch(id);
    await this.campusScope.assertBranchInScope(user, id);
    const code = dto.code ? normalizeCode(dto.code) : undefined;
    if (code) {
      await this.ensureBranchCodesAvailable(branch.programId, [code], [id]);
    }

    const updated = await this.safeWrite(() =>
      this.prisma.branch.update({
        where: { id },
        data: {
          code,
          name: dto.name ? normalizeName(dto.name) : undefined,
          ...(dto.durationYears !== undefined ? { durationYears: dto.durationYears } : {})
        },
        include: { program: { include: { campus: true } } }
      })
    );
    await this.audit("UPDATE_BRANCH", "Branch", updated.id, { code: updated.code, name: updated.name });
    return this.branchResponse(updated);
  }

  async archiveBranch(id: string, user: AuthUser) {
    await this.ensureBranch(id);
    await this.campusScope.assertBranchInScope(user, id);
    const archived = await this.prisma.branch.update({
      where: { id },
      data: { status: StructureStatus.ARCHIVED, isArchived: true, archivedAt: new Date() },
      include: { program: { include: { campus: true } } }
    });
    await this.audit("ARCHIVE_BRANCH", "Branch", archived.id, { code: archived.code, name: archived.name });
    return this.branchResponse(archived);
  }

  private async ensureCampus(id: string) {
    const campus = await this.prisma.campus.findFirst({ where: { id, status: StructureStatus.ACTIVE, isActive: true } });
    if (!campus) throw new NotFoundException("Campus not found.");
    return campus;
  }

  private async ensureDepartment(id: string) {
    const department = await this.prisma.program.findFirst({ where: { id, status: StructureStatus.ACTIVE, isArchived: false } });
    if (!department) throw new NotFoundException("Department not found.");
    return department;
  }

  private async ensureBranch(id: string) {
    const branch = await this.prisma.branch.findFirst({ where: { id, status: StructureStatus.ACTIVE, isArchived: false } });
    if (!branch) throw new NotFoundException("Branch not found.");
    return branch;
  }

  private async ensureDepartmentCodeAvailable(campusId: string, code: string, excludeId?: string) {
    const existing = await this.prisma.program.findFirst({ where: { campusId, code, ...(excludeId ? { id: { not: excludeId } } : {}) } });
    if (existing) throw new ConflictException("Department code already exists.");
  }

  private async ensureBranchCodesAvailable(programId: string, codes: string[], excludeIds: string[] = []) {
    if (!codes.length) return;
    const existing = await this.prisma.branch.findFirst({ where: { programId, code: { in: codes }, ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}) } });
    if (existing) throw new ConflictException(`Branch code ${existing.code} already exists.`);
  }

  private normalizeBranchRows(rows: DepartmentBranchRowDto[]) {
    return rows
      .filter((row) => row.name.trim() || row.code.trim())
      .map((row) => ({ id: row.id, name: normalizeName(row.name), code: normalizeCode(row.code), durationYears: row.durationYears }));
  }

  private assertUniqueCodes(codes: string[], message: string) {
    if (new Set(codes).size !== codes.length) {
      throw new BadRequestException(message);
    }
  }

  private departmentResponse(department: Prisma.ProgramGetPayload<{ include: { campus: true; branches: true } }>) {
    return {
      id: department.id,
      campusId: department.campusId,
      campus: department.campus,
      name: department.name,
      code: department.code,
      durationYears: department.durationValue,
      isArchived: department.isArchived,
      archivedAt: department.archivedAt,
      createdAt: department.createdAt,
      updatedAt: department.updatedAt,
      branches: department.branches.map((branch) => ({
        id: branch.id,
        departmentId: branch.programId,
        name: branch.name,
        code: branch.code,
        durationYears: branch.durationYears,
        isArchived: branch.isArchived,
        archivedAt: branch.archivedAt,
        createdAt: branch.createdAt,
        updatedAt: branch.updatedAt
      }))
    };
  }

  private branchResponse(branch: Prisma.BranchGetPayload<{ include: { program: { include: { campus: true } } } }>) {
    return {
      id: branch.id,
      departmentId: branch.programId,
      campusId: branch.program.campusId,
      campus: branch.program.campus,
      department: {
        id: branch.program.id,
        name: branch.program.name,
        code: branch.program.code,
        durationYears: branch.program.durationValue
      },
      name: branch.name,
      code: branch.code,
      durationYears: branch.durationYears,
      isArchived: branch.isArchived,
      archivedAt: branch.archivedAt,
      createdAt: branch.createdAt,
      updatedAt: branch.updatedAt
    };
  }

  private async safeWrite<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A record with the same code already exists.");
      }
      throw error;
    }
  }

  private async audit(action: string, entity: string, entityId?: string, metadata?: Prisma.InputJsonObject) {
    await this.prisma.auditLog.create({ data: { action, entity, entityId, metadata } });
  }
}
