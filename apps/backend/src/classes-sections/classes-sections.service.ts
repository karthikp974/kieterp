import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, TeacherRoleKind, StructureStatus } from "@prisma/client";
import { Response } from "express";
import { toPagination } from "../common/pagination.dto";
import { normalizeCode, normalizeName } from "../core/structure.util";
import { AuthUser } from "../auth/auth.types";
import { CampusScopeService } from "../permissions/campus-scope.service";
import { SharedGroupAcademicService } from "../permissions/shared-group-academic.service";
import { PrismaService } from "../prisma/prisma.service";
import { ClassSearchQueryDto, CreateClassDto, CreateSectionsDto, ExportQueryDto, SectionRowDto, SectionSearchQueryDto, UpdateClassDto, UpdateSectionDto } from "./classes-sections.dto";

@Injectable()
export class ClassesSectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly campusScope: CampusScopeService,
    private readonly sharedGroup: SharedGroupAcademicService
  ) {}

  async listClasses(query: ClassSearchQueryDto) {
    const pagination = toPagination(query);
    const where = await this.classWhere(query);
    const [items, total] = await Promise.all([
      this.prisma.academicClass.findMany({
        where,
        include: this.classInclude(),
        orderBy: [{ label: "asc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.academicClass.count({ where })
    ]);
    return { items: items.map((item) => this.classResponse(item)), total, page: pagination.page, pageSize: pagination.pageSize };
  }

  async searchClasses(query: ClassSearchQueryDto) {
    return this.listClasses(query);
  }

  async listSections(query: SectionSearchQueryDto) {
    const pagination = toPagination(query);
    const where = await this.sectionWhere(query);
    const [items, total] = await Promise.all([
      this.prisma.section.findMany({
        where,
        include: this.sectionInclude(),
        orderBy: [{ name: "asc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.section.count({ where })
    ]);
    return { items: items.map((item) => this.sectionResponse(item)), total, page: pagination.page, pageSize: pagination.pageSize };
  }

  async searchSections(query: SectionSearchQueryDto) {
    return this.listSections(query);
  }

  async createClass(dto: CreateClassDto) {
    await this.ensureRelationship(dto.campusId, dto.departmentId, dto.branchId);
    const batch = await this.ensureStructureBatch(dto.branchId);
    const code = normalizeCode(dto.code);
    const sections = this.normalizeSections(dto.sections ?? []);
    const semesterNumber = await this.nextSemesterNumber(dto.branchId);
    await this.ensureClassCodeAvailable(code);
    await this.ensureSectionCodesAvailable(sections.map((section) => section.code));

    const created = await this.safeWrite(() =>
      this.prisma.academicClass.create({
        data: {
          branchId: dto.branchId,
          batchId: batch.id,
          yearNumber: 1,
          semesterNumber,
          label: normalizeName(dto.name),
          code,
          sections: { create: sections.map((section) => ({ campusId: dto.campusId, name: section.name, code: section.code })) }
        },
        include: this.classInclude()
      })
    );
    await this.audit("CREATE_CLASS", "AcademicClass", created.id, { code: created.code, name: created.label, sections: sections.length });
    return this.classResponse(created);
  }

  async updateClass(id: string, dto: UpdateClassDto, user: AuthUser) {
    await this.ensureClass(id);
    await this.campusScope.assertAcademicClassInScope(user, id);
    const code = dto.code ? normalizeCode(dto.code) : undefined;
    const sections = dto.sections ? this.normalizeSections(dto.sections) : undefined;
    if (code) await this.ensureClassCodeAvailable(code, id);
    if (sections) {
      this.assertUniqueCodes(sections.map((section) => section.code), "Section code cannot be repeated.");
      await this.ensureSectionCodesAvailable(sections.map((section) => section.code), sections.map((section) => section.id).filter(Boolean) as string[]);
    }

    const updated = await this.safeWrite(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.academicClass.update({
          where: { id },
          data: { label: dto.name ? normalizeName(dto.name) : undefined, code }
        });

        if (sections) {
          for (const section of sections) {
            if (section.id) {
              const existing = await tx.section.findFirst({ where: { id: section.id, classId: id, isArchived: false } });
              if (!existing) throw new NotFoundException("Section not found in this class.");
              await tx.section.update({ where: { id: section.id }, data: { name: section.name, code: section.code } });
            } else {
              const academicClass = await tx.academicClass.findUniqueOrThrow({
                where: { id },
                include: { branch: { include: { program: true } } }
              });
              await tx.section.create({ data: { campusId: academicClass.branch.program.campusId, classId: id, name: section.name, code: section.code } });
            }
          }
        }

        return tx.academicClass.findUniqueOrThrow({ where: { id }, include: this.classInclude() });
      })
    );
    await this.audit("UPDATE_CLASS", "AcademicClass", updated.id, { code: updated.code, name: updated.label });
    return this.classResponse(updated);
  }

  async archiveClass(id: string, user: AuthUser) {
    await this.ensureClass(id);
    await this.campusScope.assertAcademicClassInScope(user, id);
    const archivedAt = new Date();
    const archived = await this.prisma.$transaction(async (tx) => {
      await tx.section.updateMany({ where: { classId: id, isArchived: false }, data: { status: StructureStatus.ARCHIVED, isArchived: true, archivedAt } });
      return tx.academicClass.update({
        where: { id },
        data: { status: StructureStatus.ARCHIVED, isArchived: true, archivedAt },
        include: this.classInclude()
      });
    });
    await this.audit("ARCHIVE_CLASS", "AcademicClass", archived.id, { code: archived.code, name: archived.label });
    return this.classResponse(archived);
  }

  async createSections(dto: CreateSectionsDto) {
    const academicClass = await this.prisma.academicClass.findUnique({
      where: { id: dto.classId },
      include: { branch: { include: { program: true } } }
    });
    if (!academicClass) throw new NotFoundException("Class not found.");
    const sections = this.normalizeSections(dto.sections);
    if (!sections.length) throw new BadRequestException("Add at least one section.");
    this.assertUniqueCodes(sections.map((section) => section.code), "Section code cannot be repeated.");
    await this.ensureSectionCodesAvailable(sections.map((section) => section.code));
    await this.safeWrite(() =>
      this.prisma.section.createMany({ data: sections.map((section) => ({ campusId: academicClass.branch.program.campusId, classId: dto.classId, name: section.name, code: section.code })) })
    );
    await this.audit("CREATE_SECTIONS", "Section", dto.classId, { count: sections.length, codes: sections.map((section) => section.code) });
    return this.listSections({ classId: dto.classId, page: 1, pageSize: 100 });
  }

  async updateSection(id: string, dto: UpdateSectionDto, user: AuthUser) {
    await this.ensureSection(id);
    await this.campusScope.assertSectionInScope(user, id);
    const code = dto.code ? normalizeCode(dto.code) : undefined;
    if (code) await this.ensureSectionCodesAvailable([code], [id]);
    const updated = await this.safeWrite(() =>
      this.prisma.section.update({
        where: { id },
        data: { name: dto.name ? normalizeName(dto.name) : undefined, code },
        include: this.sectionInclude()
      })
    );
    await this.audit("UPDATE_SECTION", "Section", updated.id, { code: updated.code, name: updated.name });
    return this.sectionResponse(updated);
  }

  async archiveSection(id: string, user: AuthUser) {
    await this.ensureSection(id);
    await this.campusScope.assertSectionInScope(user, id);
    const archived = await this.prisma.section.update({
      where: { id },
      data: { status: StructureStatus.ARCHIVED, isArchived: true, archivedAt: new Date() },
      include: this.sectionInclude()
    });
    await this.audit("ARCHIVE_SECTION", "Section", archived.id, { code: archived.code, name: archived.name });
    return this.sectionResponse(archived);
  }

  async classDetails(id: string, user: AuthUser) {
    await this.campusScope.assertAcademicClassInScope(user, id);
    const item = await this.prisma.academicClass.findFirst({ where: { id, isArchived: false, status: StructureStatus.ACTIVE }, include: this.classInclude() });
    if (!item) throw new NotFoundException("Class not found.");
    const students = await this.studentsForClass(id);
    return { ...this.classResponse(item), students, teachers: await this.teacherSummary({ classId: id }) };
  }

  async exportClass(id: string, query: ExportQueryDto, response: Response, user: AuthUser) {
    const details = await this.classDetails(id, user);
    const rows = details.students.map((student) => [student.fullName, student.rollNumber]);
    const csv = [["Student Name", "Roll Number"], ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, "\"\"")}"`).join(",")).join("\n");
    const filename = `${details.code || details.name}-students`;
    if (query.format === "pdf" || query.format === "docx") {
      const html = `<html><body><h1>${details.name}</h1><table><thead><tr><th>Student Name</th><th>Roll Number</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${row[0]}</td><td>${row[1]}</td></tr>`).join("")}</tbody></table></body></html>`;
      response.setHeader("Content-Type", query.format === "pdf" ? "text/html" : "application/msword");
      response.setHeader("Content-Disposition", `attachment; filename="${filename}.${query.format === "pdf" ? "html" : "doc"}"`);
      response.send(html);
      return;
    }
    response.setHeader("Content-Type", "text/csv");
    response.setHeader("Content-Disposition", `attachment; filename="${filename}.csv"`);
    response.send(csv);
  }

  private async classWhere(query: ClassSearchQueryDto): Promise<Prisma.AcademicClassWhereInput> {
    const campusScope = query.campusScope ?? "shared";
    const programFilter = await this.sharedGroup.programCatalogFilter(query.campusId, query.departmentId, campusScope);
    return {
      status: StructureStatus.ACTIVE,
      isArchived: false,
      branch: {
        status: StructureStatus.ACTIVE,
        isArchived: false,
        ...(query.branchId ? { id: query.branchId } : {}),
        ...(programFilter ? { program: programFilter } : {})
      },
      ...(query.search
        ? { OR: [{ label: { contains: query.search, mode: "insensitive" } }, { code: { contains: query.search, mode: "insensitive" } }] }
        : {})
    };
  }

  private async sectionWhere(query: SectionSearchQueryDto): Promise<Prisma.SectionWhereInput> {
    const campusScope = query.campusScope ?? "shared";
    const ownedCampusFilter = await this.sharedGroup.sectionCatalogFilter(query.campusId, campusScope);
    return {
      status: StructureStatus.ACTIVE,
      isArchived: false,
      ...ownedCampusFilter,
      ...(query.classId ? { classId: query.classId } : {}),
      class: await this.classWhere(query),
      ...(query.search
        ? { OR: [{ name: { contains: query.search, mode: "insensitive" } }, { code: { contains: query.search, mode: "insensitive" } }] }
        : {})
    };
  }

  private classInclude() {
    return {
      branch: { include: { program: { include: { campus: true } } } },
      batch: true,
      sections: { where: { status: StructureStatus.ACTIVE, isArchived: false }, orderBy: { name: "asc" as const } }
    };
  }

  private sectionInclude() {
    return { class: { include: { branch: { include: { program: { include: { campus: true } } } }, batch: true } } };
  }

  private async ensureRelationship(campusId: string, departmentId: string, branchId: string) {
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
  }

  private async nextSemesterNumber(branchId: string) {
    const last = await this.prisma.academicClass.findFirst({ where: { branchId }, orderBy: { semesterNumber: "desc" } });
    return (last?.semesterNumber ?? 0) + 1;
  }

  private async ensureStructureBatch(branchId: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId }, include: { program: true } });
    if (!branch) throw new BadRequestException("Invalid branch.");
    return this.prisma.batch.upsert({
      where: { batchCode: `STRUCTURE_${branchId}` },
      update: {},
      create: {
        id: `system_${branchId}`,
        branchId,
        startYear: 0,
        endYear: 0,
        batchCode: `STRUCTURE_${branchId}`
      }
    });
  }

  private async ensureClass(id: string) {
    const item = await this.prisma.academicClass.findFirst({ where: { id, status: StructureStatus.ACTIVE, isArchived: false } });
    if (!item) throw new NotFoundException("Class not found.");
    return item;
  }

  private async ensureSection(id: string) {
    const item = await this.prisma.section.findFirst({ where: { id, status: StructureStatus.ACTIVE, isArchived: false } });
    if (!item) throw new NotFoundException("Section not found.");
    return item;
  }

  private async ensureClassCodeAvailable(code: string, excludeId?: string) {
    const existing = await this.prisma.academicClass.findFirst({ where: { code, ...(excludeId ? { id: { not: excludeId } } : {}) } });
    if (existing) throw new ConflictException("Class code already exists.");
  }

  private async ensureSectionCodesAvailable(codes: string[], excludeIds: string[] = []) {
    const filtered = codes.filter(Boolean);
    if (!filtered.length) return;
    const existing = await this.prisma.section.findFirst({ where: { code: { in: filtered }, ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}) } });
    if (existing) throw new ConflictException(`Section code ${existing.code} already exists.`);
  }

  private normalizeSections(rows: SectionRowDto[]) {
    return rows.filter((row) => row.name.trim() || row.code.trim()).map((row) => ({ id: row.id, name: normalizeName(row.name), code: normalizeCode(row.code) }));
  }

  private assertUniqueCodes(codes: string[], message: string) {
    if (new Set(codes).size !== codes.length) throw new BadRequestException(message);
  }

  private async studentsForClass(classId: string) {
    const students = await this.prisma.studentProfile.findMany({
      where: { currentStatus: "ACTIVE", section: { classId, status: StructureStatus.ACTIVE, isArchived: false } },
      include: { user: true },
      orderBy: { rollNumber: "asc" }
    });
    return students.map((student) => ({ id: student.id, fullName: student.user.fullName, rollNumber: student.rollNumber }));
  }

  private async teacherSummary(scope: { classId?: string; sectionId?: string }) {
    const assignments = await this.prisma.teacherRoleAssignment.findMany({
      where: { isActive: true, OR: [{ classId: scope.classId }, { sectionId: scope.sectionId }] },
      include: { user: true }
    });
    return {
      htpo: assignments.filter((item) => item.role === TeacherRoleKind.HTPO).map((item) => item.user.fullName),
      ctpo: assignments.filter((item) => item.role === TeacherRoleKind.CTPO).map((item) => item.user.fullName),
      stpo: assignments.filter((item) => item.role === TeacherRoleKind.STPO).map((item) => item.user.fullName)
    };
  }

  private classResponse(item: Prisma.AcademicClassGetPayload<{ include: ReturnType<ClassesSectionsService["classInclude"]> }>) {
    const branch = item.branch;
    const department = branch.program;
    return {
      id: item.id,
      campusId: department.campusId,
      departmentId: department.id,
      branchId: branch.id,
      name: item.label,
      code: item.code ?? item.label,
      semesterNumber: item.semesterNumber,
      yearNumber: item.yearNumber,
      isArchived: item.isArchived,
      archivedAt: item.archivedAt,
      campus: department.campus,
      department: { id: department.id, name: department.name, code: department.code },
      branch: { id: branch.id, name: branch.name, code: branch.code },
      sections: item.sections.map((section) => ({ id: section.id, classId: section.classId, name: section.name, code: section.code ?? section.name, isArchived: section.isArchived }))
    };
  }

  private sectionResponse(item: Prisma.SectionGetPayload<{ include: ReturnType<ClassesSectionsService["sectionInclude"]> }>) {
    const branch = item.class.branch;
    const department = branch.program;
    return {
      id: item.id,
      classId: item.classId,
      campusId: department.campusId,
      departmentId: department.id,
      branchId: branch.id,
      name: item.name,
      code: item.code ?? item.name,
      isArchived: item.isArchived,
      archivedAt: item.archivedAt,
      class: { id: item.class.id, name: item.class.label, code: item.class.code ?? item.class.label, semesterNumber: item.class.semesterNumber },
      department: { id: department.id, name: department.name, code: department.code },
      branch: { id: branch.id, name: branch.name, code: branch.code }
    };
  }

  private async safeWrite<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("A record with the same code already exists.");
      throw error;
    }
  }

  private async audit(action: string, entity: string, entityId?: string, metadata?: Prisma.InputJsonObject) {
    await this.prisma.auditLog.create({ data: { action, entity, entityId, metadata } });
  }
}
