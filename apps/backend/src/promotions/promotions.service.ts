import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PermissionAction, Prisma, PromotionType, StructureStatus, UserStatus } from "@prisma/client";
import { AuthUser } from "../auth/auth.types";
import {
  isLinearSemesterWithinBranch,
  linearSemestersForAcademicYear,
  maxLinearSemesterForBranchDurationYears,
  nextAcademicYearFirstLinearSemester,
  semesterPairsForBranch
} from "./promotion-semester.util";
import { toPagination } from "../common/pagination.dto";
import { CampusScopeService } from "../permissions/campus-scope.service";
import { PermissionsService } from "../permissions/permissions.service";
import { PrismaService } from "../prisma/prisma.service";
import { PromoteSelectedStudentsDto, PromoteStudentsDto, PromotionClassQueryDto, PromotionHistoryQueryDto, PromotionSectionQueryDto, PromotionStudentsQueryDto } from "./promotions.dto";

type SectionWithTree = Prisma.SectionGetPayload<{ include: PromotionsService["sectionInclude"] }>;

@Injectable()
export class PromotionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly campusScope: CampusScopeService
  ) {}

  async classes(user: AuthUser, query: PromotionClassQueryDto) {
    const pagination = toPagination(query);
    if (query.batchId) {
      await this.campusScope.assertBatchInScope(user, query.batchId);
    }
    const treeScope = await this.campusScope.academicClassWhere(user);
    const pairSemesters =
      query.academicYearIndex !== undefined && query.academicYearIndex !== null
        ? linearSemestersForAcademicYear(query.academicYearIndex)
        : null;
    const where: Prisma.AcademicClassWhereInput = {
      status: StructureStatus.ACTIVE,
      isArchived: false,
      ...(Object.keys(treeScope).length ? treeScope : {}),
      ...(query.batchId ? { batchId: query.batchId } : {}),
      ...(pairSemesters ? { semesterNumber: { in: [...pairSemesters] } } : {}),
      ...(query.search
        ? {
            OR: [
              { label: { contains: query.search, mode: "insensitive" } },
              { code: { contains: query.search, mode: "insensitive" } },
              { batch: { branch: { code: { contains: query.search, mode: "insensitive" } } } },
              { batch: { branch: { name: { contains: query.search, mode: "insensitive" } } } }
            ]
          }
        : {})
    };
    const [items, total] = await Promise.all([
      this.prisma.academicClass.findMany({
        where,
        include: { batch: { include: { branch: { include: { program: { include: { campus: true } } } } } }, sections: { where: { status: StructureStatus.ACTIVE, isArchived: false } } },
        orderBy: [{ batch: { startYear: "desc" } }, { semesterNumber: "asc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.academicClass.count({ where })
    ]);
    return {
      items: items.map((item) => this.toClassObject(item)),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize
    };
  }

  async sections(user: AuthUser, query: PromotionSectionQueryDto) {
    await this.campusScope.assertAcademicClassInScope(user, query.classId);
    const classItem = await this.prisma.academicClass.findUnique({ where: { id: query.classId }, include: { batch: { include: { branch: { include: { program: { include: { campus: true } } } } } } } });
    if (!classItem) throw new NotFoundException("Class not found.");
    this.assertActiveClass(classItem);
    const pagination = toPagination(query);
    const where: Prisma.SectionWhereInput = {
      classId: query.classId,
      status: StructureStatus.ACTIVE,
      isArchived: false,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { code: { contains: query.search, mode: "insensitive" } }
            ]
          }
        : {})
    };
    const [items, total] = await Promise.all([
      this.prisma.section.findMany({ where, include: this.sectionInclude, orderBy: { name: "asc" }, skip: pagination.skip, take: pagination.take }),
      this.prisma.section.count({ where })
    ]);
    return { items: items.map((item) => this.toSectionObject(item)), total, page: pagination.page, pageSize: pagination.pageSize };
  }

  async students(user: AuthUser, query: PromotionStudentsQueryDto) {
    await this.campusScope.assertAcademicClassInScope(user, query.classId);
    await this.campusScope.assertSectionInScope(user, query.sectionId);
    const section = await this.prisma.section.findUnique({ where: { id: query.sectionId }, include: this.sectionInclude });
    if (!section || section.classId !== query.classId) throw new BadRequestException("Section does not belong to selected class.");
    this.assertActiveSection(section);
    const pagination = toPagination(query);
    const where: Prisma.StudentProfileWhereInput = {
      sectionId: query.sectionId,
      currentStatus: UserStatus.ACTIVE,
      isArchived: false,
      ...(query.search
        ? {
            OR: [
              { rollNumber: { contains: query.search, mode: "insensitive" } },
              { user: { fullName: { contains: query.search, mode: "insensitive" } } }
            ]
          }
        : {})
    };
    const [items, total] = await Promise.all([
      this.prisma.studentProfile.findMany({ where, include: { user: true, section: { include: this.sectionInclude } }, orderBy: { rollNumber: "asc" }, skip: pagination.skip, take: pagination.take }),
      this.prisma.studentProfile.count({ where })
    ]);
    return {
      items: items.map((student) => ({
        id: student.id,
        fullName: student.user.fullName,
        rollNumber: student.rollNumber,
        currentSemester: student.section.class.semesterNumber,
        currentClass: student.section.class.label,
        currentSection: student.section.name
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize
    };
  }

  async semesterPairs(user: AuthUser, branchId: string) {
    await this.campusScope.assertBranchInScope(user, branchId);
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, status: StructureStatus.ACTIVE, isArchived: false },
      include: { program: true }
    });
    if (!branch) throw new NotFoundException("Branch not found.");
    const durationYears = branch.durationYears;
    return {
      branchId: branch.id,
      durationYears,
      maxSemester: maxLinearSemesterForBranchDurationYears(durationYears),
      pairs: semesterPairsForBranch(durationYears)
    };
  }

  async preview(user: AuthUser, fromSectionId: string, toSectionId: string) {
    await this.campusScope.assertSectionInScope(user, fromSectionId);
    await this.campusScope.assertSectionInScope(user, toSectionId);
    const { fromSection, toSection } = await this.validateSectionPair(fromSectionId, toSectionId);
    const students = await this.prisma.studentProfile.findMany({
      where: { sectionId: fromSectionId, currentStatus: UserStatus.ACTIVE, isArchived: false },
      include: { user: true },
      orderBy: { rollNumber: "asc" },
      take: 100
    });
    return {
      fromSection: this.toSectionObject(fromSection),
      toSection: this.toSectionObject(toSection),
      students: students.map((student) => ({ id: student.id, rollNumber: student.rollNumber, fullName: student.user.fullName })),
      count: students.length
    };
  }

  async promote(user: AuthUser, dto: PromoteStudentsDto) {
    if (!this.permissions.can(user, { action: PermissionAction.MANAGE_PROMOTIONS }).allowed) {
      throw new ForbiddenException("Only admin can run student promotions.");
    }
    const { fromSection, toSection } = await this.validateSectionPair(dto.fromSectionId, dto.toSectionId);
    await this.campusScope.assertSectionInScope(user, fromSection.id);
    await this.campusScope.assertSectionInScope(user, toSection.id);
    const uniqueStudentIds = [...new Set(dto.studentProfileIds)];
    if (uniqueStudentIds.length !== dto.studentProfileIds.length) throw new BadRequestException("Duplicate student IDs found.");

    const students = await this.prisma.studentProfile.findMany({
      where: { id: { in: uniqueStudentIds }, sectionId: dto.fromSectionId, currentStatus: UserStatus.ACTIVE, isArchived: false },
      select: { id: true }
    });
    if (students.length !== uniqueStudentIds.length) {
      throw new BadRequestException("Every selected student must be active and belong to the source section.");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.studentPromotionHistory.createMany({
        data: uniqueStudentIds.map((studentProfileId) => ({
          studentProfileId,
          fromSectionId: fromSection.id,
          toSectionId: toSection.id,
          fromClassId: fromSection.classId,
          toClassId: toSection.classId,
          fromSemester: fromSection.class.semesterNumber,
          toSemester: toSection.class.semesterNumber,
          promotionType: PromotionType.STANDARD_NEXT_SEMESTER,
          promotedById: user.id,
          note: dto.note?.trim()
        }))
      });
      const update = await tx.studentProfile.updateMany({
        where: { id: { in: uniqueStudentIds }, sectionId: fromSection.id, currentStatus: UserStatus.ACTIVE, isArchived: false },
        data: { sectionId: toSection.id }
      });
      if (update.count !== uniqueStudentIds.length) {
        throw new BadRequestException("Promotion failed because one or more students changed before the transaction completed.");
      }
      await tx.auditLog.create({
        data: {
          userId: user.auditUserId,
          action: "PROMOTE_STUDENTS",
          entity: "StudentPromotionHistory",
          metadata: { fromSectionId: fromSection.id, toSectionId: toSection.id, count: uniqueStudentIds.length }
        }
      });
      return { promoted: uniqueStudentIds.length };
    });

    return {
      ...result,
      oldSection: this.toSectionObject(fromSection),
      newSection: this.toSectionObject(toSection),
      fromSection: this.toSectionObject(fromSection),
      toSection: this.toSectionObject(toSection)
    };
  }

  async promoteSelected(user: AuthUser, dto: PromoteSelectedStudentsDto) {
    if (!this.permissions.can(user, { action: PermissionAction.MANAGE_PROMOTIONS }).allowed) {
      throw new ForbiddenException("Only admin can run student promotions.");
    }

    const promotedUnique = [...new Set(dto.promotedStudentProfileIds)];
    if (promotedUnique.length !== dto.promotedStudentProfileIds.length) {
      throw new BadRequestException("Duplicate student IDs in promoted list.");
    }

    const reassignmentIds = dto.nonPromotedReassignments.map((row) => row.studentProfileId);
    if (new Set(reassignmentIds).size !== reassignmentIds.length) {
      throw new BadRequestException("Duplicate student in non-promoted reassignments.");
    }

    const promotedSet = new Set(promotedUnique);
    for (const studentProfileId of reassignmentIds) {
      if (promotedSet.has(studentProfileId)) {
        throw new BadRequestException("A student cannot appear in both promoted and reassignment lists.");
      }
    }

    const fromSection = await this.prisma.section.findUnique({ where: { id: dto.fromSectionId }, include: this.sectionInclude });
    if (!fromSection || fromSection.classId !== dto.fromClassId) throw new BadRequestException("Selected section does not belong to selected class.");
    this.assertActiveSection(fromSection);
    await this.campusScope.assertSectionInScope(user, fromSection.id);

    let toSection: SectionWithTree | null = null;
    if (promotedUnique.length) {
      if (!dto.toSectionId) throw new BadRequestException("Destination section is required when promoting students.");
      await this.campusScope.assertSectionInScope(user, dto.toSectionId);
      const target = await this.prisma.section.findUnique({ where: { id: dto.toSectionId }, include: this.sectionInclude });
      if (!target) throw new NotFoundException("Destination section not found.");
      this.assertActiveSection(target);
      this.assertPromotionDestination(fromSection, target);
      toSection = target;
    }

    const reassignmentSectionById = new Map<string, SectionWithTree>();
    for (const row of dto.nonPromotedReassignments) {
      await this.campusScope.assertSectionInScope(user, row.toSectionId);
      if (reassignmentSectionById.has(row.toSectionId)) continue;
      const target = await this.prisma.section.findUnique({ where: { id: row.toSectionId }, include: this.sectionInclude });
      if (!target) throw new NotFoundException("Reassignment section not found.");
      this.assertActiveSection(target);
      this.assertIndividualReassignment(fromSection, target);
      reassignmentSectionById.set(row.toSectionId, target);
    }

    const allInSection = await this.prisma.studentProfile.findMany({
      where: { sectionId: fromSection.id, currentStatus: UserStatus.ACTIVE, isArchived: false },
      select: { id: true }
    });
    const allIds = allInSection.map((row) => row.id);
    if (!allIds.length) throw new BadRequestException("No active students in the source section.");

    const allSet = new Set(allIds);
    for (const id of promotedUnique) {
      if (!allSet.has(id)) throw new BadRequestException("Promoted list includes a student not in the source section.");
    }
    for (const row of dto.nonPromotedReassignments) {
      if (!allSet.has(row.studentProfileId)) {
        throw new BadRequestException("Reassignment list includes a student not in the source section.");
      }
    }
    if (new Set([...promotedUnique, ...reassignmentIds]).size !== allIds.length) {
      throw new BadRequestException("Include every student in the source section: promote or assign an individual destination.");
    }

    const route = "POST /api/promotion/promote";
    const requestHash = JSON.stringify({
      fromClassId: dto.fromClassId,
      fromSectionId: dto.fromSectionId,
      toSectionId: dto.toSectionId ?? null,
      promoted: [...promotedUnique].sort(),
      nonPromoted: dto.nonPromotedReassignments.map((row) => [row.studentProfileId, row.toSectionId]).sort()
    });

    const existingKey = await this.prisma.idempotencyKey.findUnique({ where: { key: dto.idempotencyKey } });
    if (existingKey) {
      if (existingKey.userId === user.id && existingKey.route === route && existingKey.requestHash === requestHash && existingKey.response) {
        return existingKey.response;
      }
      throw new BadRequestException("Promotion request was already used for a different operation.");
    }

    if (promotedUnique.length) {
      const promotedRows = await this.prisma.studentProfile.findMany({
        where: { id: { in: promotedUnique }, sectionId: fromSection.id, currentStatus: UserStatus.ACTIVE, isArchived: false },
        select: { id: true }
      });
      if (promotedRows.length !== promotedUnique.length) {
        throw new BadRequestException("One or more promoted students are not active in the source section.");
      }
    }

    const promotionDestination = promotedUnique.length ? toSection! : null;

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

      const historyPayload: Prisma.StudentPromotionHistoryCreateManyInput[] = [];
      for (const studentProfileId of promotedUnique) {
        if (!promotionDestination) throw new BadRequestException("Promotion destination missing.");
        historyPayload.push({
          studentProfileId,
          fromSectionId: fromSection.id,
          toSectionId: promotionDestination.id,
          fromClassId: fromSection.classId,
          toClassId: promotionDestination.classId,
          fromSemester: fromSection.class.semesterNumber,
          toSemester: promotionDestination.class.semesterNumber,
          promotionType: PromotionType.STANDARD_NEXT_SEMESTER,
          promotedById: user.id,
          note: dto.note?.trim()
        });
      }
      for (const row of dto.nonPromotedReassignments) {
        const target = reassignmentSectionById.get(row.toSectionId)!;
        historyPayload.push({
          studentProfileId: row.studentProfileId,
          fromSectionId: fromSection.id,
          toSectionId: target.id,
          fromClassId: fromSection.classId,
          toClassId: target.classId,
          fromSemester: fromSection.class.semesterNumber,
          toSemester: target.class.semesterNumber,
          promotionType: PromotionType.INDIVIDUAL_REASSIGNMENT,
          promotedById: user.id,
          note: dto.note?.trim()
        });
      }
      if (historyPayload.length) {
        await tx.studentPromotionHistory.createMany({ data: historyPayload });
      }

      if (promotedUnique.length) {
        if (!promotionDestination) throw new BadRequestException("Promotion destination missing.");
        const promotedUpdate = await tx.studentProfile.updateMany({
          where: { id: { in: promotedUnique }, sectionId: fromSection.id, currentStatus: UserStatus.ACTIVE, isArchived: false },
          data: { sectionId: promotionDestination.id }
        });
        if (promotedUpdate.count !== promotedUnique.length) {
          throw new BadRequestException("Promotion failed because promoted students changed before the transaction completed.");
        }
      }

      const reassignedBySection = new Map<string, string[]>();
      for (const row of dto.nonPromotedReassignments) {
        const bucket = reassignedBySection.get(row.toSectionId) ?? [];
        bucket.push(row.studentProfileId);
        reassignedBySection.set(row.toSectionId, bucket);
      }
      for (const [sectionId, ids] of reassignedBySection.entries()) {
        const target = reassignmentSectionById.get(sectionId)!;
        const reassUpdate = await tx.studentProfile.updateMany({
          where: { id: { in: ids }, sectionId: fromSection.id, currentStatus: UserStatus.ACTIVE, isArchived: false },
          data: { sectionId: target.id }
        });
        if (reassUpdate.count !== ids.length) {
          throw new BadRequestException("Individual reassignment failed because students changed before the transaction completed.");
        }
      }

      await tx.auditLog.create({
        data: {
          userId: user.auditUserId,
          action: "PROMOTE_SELECTED_STUDENTS",
          entity: "StudentPromotionHistory",
          metadata: {
            fromSectionId: fromSection.id,
            toSectionId: promotionDestination?.id ?? null,
            fromClassId: fromSection.classId,
            toClassId: promotionDestination?.classId ?? null,
            promoted: promotedUnique.length,
            reassigned: dto.nonPromotedReassignments.length
          }
        }
      });

      const result = {
        promoted: promotedUnique.length,
        reassigned: dto.nonPromotedReassignments.length,
        fromClass: this.toClassObject(fromSection.class),
        toClass: promotionDestination ? this.toClassObject(promotionDestination.class) : null,
        oldSection: this.toSectionObject(fromSection),
        newSection: promotionDestination ? this.toSectionObject(promotionDestination) : null,
        fromSection: this.toSectionObject(fromSection),
        toSection: promotionDestination ? this.toSectionObject(promotionDestination) : null,
        message: "Promotion workflow completed successfully"
      };
      await tx.idempotencyKey.update({ where: { key: dto.idempotencyKey }, data: { response: result as Prisma.InputJsonObject } });
      return result;
    });

    return response;
  }

  async history(user: AuthUser, query: PromotionHistoryQueryDto) {
    const pagination = toPagination(query);
    const scopeStudent = this.campusScope.studentProfileWhere(user);
    const where: Prisma.StudentPromotionHistoryWhereInput = {
      studentProfileId: query.studentProfileId,
      fromSectionId: query.fromSectionId,
      toSectionId: query.toSectionId,
      ...(Object.keys(scopeStudent).length ? { studentProfile: { is: scopeStudent } } : {})
    };
    const [items, total] = await Promise.all([
      this.prisma.studentPromotionHistory.findMany({
        where,
        include: {
          studentProfile: { include: { user: true } },
          fromSection: true,
          toSection: true,
          promotedBy: { select: { fullName: true } }
        },
        orderBy: { promotedAt: "desc" },
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.studentPromotionHistory.count({ where })
    ]);
    return {
      items: items.map((item) => ({
        id: item.id,
        student: { id: item.studentProfile.id, rollNumber: item.studentProfile.rollNumber, fullName: item.studentProfile.user.fullName },
        studentId: item.studentProfile.id,
        oldSectionId: item.fromSectionId,
        newSectionId: item.toSectionId,
        fromSection: item.fromSection.name,
        toSection: item.toSection.name,
        fromClassId: item.fromClassId,
        toClassId: item.toClassId,
        fromSemester: item.fromSemester,
        toSemester: item.toSemester,
        promotedBy: item.promotedBy.fullName,
        promotedAt: item.promotedAt,
        note: item.note,
        promotionType: item.promotionType,
      })),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize
    };
  }

  private async validateSectionPair(fromSectionId: string, toSectionId: string) {
    if (fromSectionId === toSectionId) throw new BadRequestException("Source and target sections must be different.");
    const [fromSection, toSection] = await Promise.all([
      this.prisma.section.findUnique({ where: { id: fromSectionId }, include: this.sectionInclude }),
      this.prisma.section.findUnique({ where: { id: toSectionId }, include: this.sectionInclude })
    ]);
    if (!fromSection || !toSection) throw new NotFoundException("Source or target section not found.");
    this.assertActiveSection(fromSection);
    this.assertActiveSection(toSection);
    const fromClass = fromSection.class;
    const toClass = toSection.class;
    if (fromClass.batch.branchId !== toClass.batch.branchId) throw new BadRequestException("Promotion target must stay in the same branch.");
    if (toClass.semesterNumber !== fromClass.semesterNumber + 1) {
      throw new BadRequestException("Promotion target must be the next semester.");
    }
    return { fromSection, toSection };
  }

  private assertPromotionDestination(fromSection: SectionWithTree, toSection: SectionWithTree) {
    if (fromSection.id === toSection.id) throw new BadRequestException("Source and destination sections must be different.");
    if (fromSection.class.batchId !== toSection.class.batchId) {
      throw new BadRequestException("Promotion destination must belong to the same batch.");
    }
    const durationYears = fromSection.class.batch.branch.durationYears;
    const nextStart = nextAcademicYearFirstLinearSemester(fromSection.class.semesterNumber);
    const allowed = new Set([nextStart, nextStart + 1]);
    const targetSem = toSection.class.semesterNumber;
    if (!allowed.has(targetSem)) {
      throw new BadRequestException("Destination class must be in the next academic year semester pair.");
    }
    if (!isLinearSemesterWithinBranch(targetSem, durationYears)) {
      throw new BadRequestException("Destination semester exceeds branch duration; cannot promote past the final semester.");
    }
  }

  private assertIndividualReassignment(fromSection: SectionWithTree, toSection: SectionWithTree) {
    if (fromSection.class.batchId !== toSection.class.batchId) {
      throw new BadRequestException("Individual reassignment must stay within the same batch.");
    }
    const durationYears = fromSection.class.batch.branch.durationYears;
    if (!isLinearSemesterWithinBranch(toSection.class.semesterNumber, durationYears)) {
      throw new BadRequestException("Individual reassignment target semester exceeds branch duration.");
    }
  }

  private async findTargetSection(fromSection: SectionWithTree) {
    const targetClass = await this.prisma.academicClass.findFirst({
      where: {
        batchId: fromSection.class.batchId,
        semesterNumber: fromSection.class.semesterNumber + 1,
        status: StructureStatus.ACTIVE,
        isArchived: false
      },
      include: { batch: { include: { branch: { include: { program: true } } } } }
    });
    if (!targetClass) throw new BadRequestException("Next semester class does not exist for this batch.");
    this.assertActiveClass(targetClass);
    const targetSection = await this.prisma.section.findFirst({
      where: {
        classId: targetClass.id,
        status: StructureStatus.ACTIVE,
        isArchived: false,
        OR: [
          { code: fromSection.code },
          { name: fromSection.name }
        ]
      },
      include: this.sectionInclude,
      orderBy: { name: "asc" }
    });
    if (!targetSection) throw new BadRequestException("Matching section was not found in the next semester class.");
    return targetSection;
  }

  private assertActiveClass(classItem: {
    status: StructureStatus;
    isArchived: boolean;
    batch: { status: StructureStatus; branch: { status: StructureStatus; program: { status: StructureStatus } } };
  }) {
    if (
      classItem.status !== StructureStatus.ACTIVE ||
      classItem.isArchived ||
      classItem.batch.status !== StructureStatus.ACTIVE ||
      classItem.batch.branch.status !== StructureStatus.ACTIVE ||
      classItem.batch.branch.program.status !== StructureStatus.ACTIVE
    ) {
      throw new BadRequestException("Class hierarchy is archived or invalid.");
    }
  }

  private assertActiveSection(section: SectionWithTree) {
    if (
      section.status !== StructureStatus.ACTIVE ||
      section.isArchived ||
      section.class.status !== StructureStatus.ACTIVE ||
      section.class.isArchived ||
      section.class.batch.status !== StructureStatus.ACTIVE ||
      section.class.batch.branch.status !== StructureStatus.ACTIVE ||
      section.class.batch.branch.program.status !== StructureStatus.ACTIVE
    ) {
      throw new BadRequestException("Promotion section hierarchy is archived or invalid.");
    }
  }

  private toClassObject(classItem: {
    id: string;
    label: string;
    code: string | null;
    semesterNumber: number;
    yearNumber: number;
    batch: {
      id: string;
      startYear: number;
      endYear: number;
      branch: {
        id: string;
        code: string;
        name: string;
        durationYears: number;
        program: {
          id: string;
          code: string;
          name: string;
          campus?: { id: string; code: string; name: string };
        };
      };
    };
    sections?: { id: string }[];
  }) {
    return {
      id: classItem.id,
      name: classItem.label,
      code: classItem.code ?? `SEM-${classItem.semesterNumber}`,
      semesterNumber: classItem.semesterNumber,
      yearNumber: classItem.yearNumber,
      campusId: classItem.batch.branch.program.campus?.id,
      programId: classItem.batch.branch.program.id,
      branchId: classItem.batch.branch.id,
      branchDurationYears: classItem.batch.branch.durationYears,
      batchId: classItem.batch.id,
      batch: `${classItem.batch.startYear}-${classItem.batch.endYear}`,
      branch: classItem.batch.branch.name,
      branchCode: classItem.batch.branch.code,
      program: classItem.batch.branch.program.name,
      campus: classItem.batch.branch.program.campus?.code,
      sections: classItem.sections?.length ?? 0
    };
  }

  private toSectionObject(section: SectionWithTree) {
    return {
      id: section.id,
      name: section.name,
      semesterNumber: section.class.semesterNumber,
      classId: section.classId,
      branchId: section.class.batch.branchId,
      branch: section.class.batch.branch.name,
      batch: `${section.class.batch.startYear}-${section.class.batch.endYear}`
    };
  }

  private readonly sectionInclude = {
    class: { include: { batch: { include: { branch: { include: { program: true } } } } } }
  } satisfies Prisma.SectionInclude;
}
