import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, StructureStatus } from "@prisma/client";
import { toPagination } from "../common/pagination.dto";
import { AuthUser } from "../auth/auth.types";
import { CampusScopeService } from "../permissions/campus-scope.service";
import { SharedGroupAcademicService } from "../permissions/shared-group-academic.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateSyllabusDto, SyllabusSearchQueryDto, SyllabusTopicInputDto, SyllabusUnitDto, UpdateSyllabusDto } from "./syllabus.dto";

@Injectable()
export class SyllabusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly campusScope: CampusScopeService,
    private readonly sharedGroup: SharedGroupAcademicService
  ) {}

  async searchSubjects(query: SyllabusSearchQueryDto) {
    const pagination = toPagination(query);
    const where: Prisma.SubjectWhereInput = {
      status: StructureStatus.ACTIVE,
      isArchived: false,
      ...(query.search
        ? { OR: [{ name: { contains: query.search, mode: "insensitive" } }, { code: { contains: query.search, mode: "insensitive" } }] }
        : {})
    };
    const [items, total] = await Promise.all([
      this.prisma.subject.findMany({ where, orderBy: { code: "asc" }, skip: pagination.skip, take: pagination.take }),
      this.prisma.subject.count({ where })
    ]);
    return { items: items.map((subject) => ({ id: subject.id, subjectName: subject.name, subjectCode: subject.code })), total, page: pagination.page, pageSize: pagination.pageSize };
  }

  async search(query: SyllabusSearchQueryDto) {
    const pagination = toPagination(query);
    const campusScope = query.campusScope ?? "shared";
    const programFilter = query.campusId
      ? await this.sharedGroup.programCatalogFilter(query.campusId, undefined, campusScope)
      : undefined;
    const where: Prisma.SyllabusWhereInput = {
      isArchived: false,
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      subject: {
        status: StructureStatus.ACTIVE,
        isArchived: false,
        ...(programFilter
          ? {
              branch: {
                status: StructureStatus.ACTIVE,
                isArchived: false,
                program: programFilter
              }
            }
          : {}),
        ...(query.search
          ? { OR: [{ name: { contains: query.search, mode: "insensitive" } }, { code: { contains: query.search, mode: "insensitive" } }] }
          : {})
      }
    };
    const [items, total] = await Promise.all([
      this.prisma.syllabus.findMany({ where, include: this.include(), orderBy: { updatedAt: "desc" }, skip: pagination.skip, take: pagination.take }),
      this.prisma.syllabus.count({ where })
    ]);
    return { items: items.map((item) => this.response(item)), total, page: pagination.page, pageSize: pagination.pageSize };
  }

  async create(dto: CreateSyllabusDto) {
    await this.ensureSubject(dto.subjectId);
    const units = this.normalizeUnits(dto.units);
    if (!units.length) throw new BadRequestException("Add at least one syllabus unit.");
    const existing = await this.prisma.syllabus.findFirst({ where: { subjectId: dto.subjectId, isArchived: false } });
    if (existing) throw new ConflictException("Syllabus already exists for this subject.");

    const created = await this.prisma.syllabus.create({
      data: {
        subjectId: dto.subjectId,
        units: {
          create: units.map((unit, index) => ({
            unitTitle: unit.unitTitle,
            unitOrder: unit.unitOrder ?? index + 1,
            topics: {
              create: this.normalizeTopics(unit.topics).map((topic, topicIndex) => ({
                topicTitle: topic.topicTitle,
                topicOrder: topic.topicOrder ?? topicIndex + 1
              }))
            }
          }))
        }
      },
      include: this.include()
    });
    await this.audit("CREATE_SYLLABUS", "Syllabus", created.id, { subjectId: created.subjectId, units: created.units.length });
    return this.response(created);
  }

  async update(id: string, dto: UpdateSyllabusDto, user: AuthUser) {
    const syllabus = await this.ensureSyllabus(id);
    await this.assertSyllabusScope(user, syllabus.subjectId);
    const units = this.normalizeUnits(dto.units);
    if (!units.length) throw new BadRequestException("Add at least one syllabus unit.");

    const updated = await this.prisma.$transaction(async (tx) => {
      const keepUnitIds = units.map((unit) => unit.id).filter(Boolean) as string[];
      await tx.syllabusUnit.updateMany({
        where: { syllabusId: id, id: { notIn: keepUnitIds }, isArchived: false },
        data: { isArchived: true, archivedAt: new Date() }
      });
      const archivedAt = new Date();
      await tx.syllabusTopic.updateMany({
        where: { unit: { syllabusId: id, id: { notIn: keepUnitIds }, isArchived: false }, isArchived: false },
        data: { isArchived: true, archivedAt }
      });

      for (const [index, unit] of units.entries()) {
        const unitOrder = unit.unitOrder ?? index + 1;
        const topicRows = this.normalizeTopics(unit.topics);
        if (unit.id) {
          await tx.syllabusUnit.update({
            where: { id: unit.id },
            data: { unitTitle: unit.unitTitle, unitOrder, isArchived: false, archivedAt: null }
          });
          const keepTopicIds = topicRows.map((t) => t.id).filter(Boolean) as string[];
          await tx.syllabusTopic.updateMany({
            where: { unitId: unit.id, id: { notIn: keepTopicIds }, isArchived: false },
            data: { isArchived: true, archivedAt: new Date() }
          });
          for (const [ti, topic] of topicRows.entries()) {
            const topicOrder = topic.topicOrder ?? ti + 1;
            if (topic.id) {
              await tx.syllabusTopic.update({
                where: { id: topic.id },
                data: { topicTitle: topic.topicTitle, topicOrder, isArchived: false, archivedAt: null }
              });
            } else {
              await tx.syllabusTopic.create({
                data: { unitId: unit.id, topicTitle: topic.topicTitle, topicOrder }
              });
            }
          }
        } else {
          await tx.syllabusUnit.create({
            data: {
              syllabusId: id,
              unitTitle: unit.unitTitle,
              unitOrder,
              topics: {
                create: topicRows.map((topic, topicIndex) => ({
                  topicTitle: topic.topicTitle,
                  topicOrder: topic.topicOrder ?? topicIndex + 1
                }))
              }
            }
          });
        }
      }

      return tx.syllabus.findUniqueOrThrow({ where: { id }, include: this.include() });
    });
    await this.audit("UPDATE_SYLLABUS", "Syllabus", updated.id, { subjectId: updated.subjectId, units: updated.units.length });
    return this.response(updated);
  }

  async archive(id: string, user: AuthUser) {
    const syllabus = await this.ensureSyllabus(id);
    await this.assertSyllabusScope(user, syllabus.subjectId);
    const archivedAt = new Date();
    const archived = await this.prisma.$transaction(async (tx) => {
      await tx.syllabusTopic.updateMany({
        where: { unit: { syllabusId: id }, isArchived: false },
        data: { isArchived: true, archivedAt }
      });
      await tx.syllabusUnit.updateMany({ where: { syllabusId: id, isArchived: false }, data: { isArchived: true, archivedAt } });
      return tx.syllabus.update({ where: { id }, data: { isArchived: true, archivedAt }, include: this.include(true) });
    });
    await this.audit("ARCHIVE_SYLLABUS", "Syllabus", archived.id, { subjectId: archived.subjectId });
    return this.response(archived);
  }

  private include(includeArchivedUnits = false) {
    return {
      subject: true,
      units: {
        where: includeArchivedUnits ? {} : { isArchived: false },
        orderBy: { unitOrder: "asc" as const },
        include: {
          topics: {
            where: includeArchivedUnits ? {} : { isArchived: false },
            orderBy: { topicOrder: "asc" as const }
          }
        }
      }
    };
  }

  private async ensureSubject(id: string) {
    const subject = await this.prisma.subject.findFirst({ where: { id, status: StructureStatus.ACTIVE, isArchived: false } });
    if (!subject) throw new NotFoundException("Subject not found.");
    return subject;
  }

  private async ensureSyllabus(id: string) {
    const syllabus = await this.prisma.syllabus.findFirst({ where: { id, isArchived: false } });
    if (!syllabus) throw new NotFoundException("Syllabus not found.");
    return syllabus;
  }

  private async assertSyllabusScope(user: AuthUser, subjectId: string) {
    const subject = await this.prisma.subject.findUnique({ where: { id: subjectId }, select: { branchId: true } });
    if (subject) await this.campusScope.assertBranchInScope(user, subject.branchId);
  }

  private normalizeUnits(units: SyllabusUnitDto[]) {
    return units.filter((unit) => unit.unitTitle.trim()).map((unit) => ({ ...unit, unitTitle: unit.unitTitle.trim().replace(/\s+/g, " ") }));
  }

  private normalizeTopics(topics: SyllabusTopicInputDto[] | undefined) {
    if (!topics?.length) return [];
    return topics
      .map((topic) => ({ ...topic, topicTitle: topic.topicTitle.trim().replace(/\s+/g, " ") }))
      .filter((topic) => topic.topicTitle.length > 0);
  }

  private response(item: Prisma.SyllabusGetPayload<{ include: ReturnType<SyllabusService["include"]> }>) {
    return {
      id: item.id,
      subjectId: item.subjectId,
      subjectName: item.subject.name,
      subjectCode: item.subject.code,
      isArchived: item.isArchived,
      archivedAt: item.archivedAt,
      units: item.units.map((unit) => ({
        id: unit.id,
        syllabusId: unit.syllabusId,
        unitTitle: unit.unitTitle,
        unitOrder: unit.unitOrder,
        isArchived: unit.isArchived,
        archivedAt: unit.archivedAt,
        topics: unit.topics.map((topic) => ({
          id: topic.id,
          unitId: topic.unitId,
          topicTitle: topic.topicTitle,
          topicOrder: topic.topicOrder,
          isArchived: topic.isArchived,
          archivedAt: topic.archivedAt
        }))
      }))
    };
  }

  private async audit(action: string, entity: string, entityId?: string, metadata?: Prisma.InputJsonObject) {
    await this.prisma.auditLog.create({ data: { action, entity, entityId, metadata } });
  }
}
