import { ConflictException, BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { formatIstDate } from "../common/ist-time.util";
import { AnnouncementStatus, Prisma, ProgramStructureScope, StructureStatus, TimetableSlotStatus, UserStatus } from "@prisma/client";
import { PaginationQueryDto, toPagination } from "../common/pagination.dto";
import { AuthUser } from "../auth/auth.types";
import { CampusScopeService } from "../permissions/campus-scope.service";
import { SharedGroupAcademicService } from "../permissions/shared-group-academic.service";
import {
  CANONICAL_SHARED_STRUCTURE_CAMPUS_CODE,
  isSharedGroupProgramCode
} from "../permissions/shared-group-academic.constants";
import { PrismaService } from "../prisma/prisma.service";
import {
  CreateBatchDto,
  CreateBranchDto,
  CreateCampusDto,
  CreateClassDto,
  CreateProgramDto,
  CreateSectionDto,
  CreateSubjectDto,
  GenerateBatchClassesDto,
  ScopedStructureQueryDto,
  UpdateBatchDto,
  UpdateBranchDto,
  UpdateCampusDto,
  UpdateClassDto,
  UpdateProgramDto,
  UpdateSectionDto,
  UpdateSubjectDto
} from "./structure.dto";
import {
  assertValidBatchYears,
  assertValidClassPlacement,
  assertValidSubjectSemester,
  classLabelForSemester,
  normalizeCode,
  normalizeName
} from "./structure.util";

@Injectable()
export class CoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly campusScope: CampusScopeService,
    private readonly sharedGroup: SharedGroupAcademicService
  ) {}

  private async activeProgramRelationFilter(campusId?: string, programId?: string): Promise<Prisma.ProgramWhereInput | undefined> {
    if (programId) {
      return { id: programId, status: StructureStatus.ACTIVE, isArchived: false };
    }
    if (!campusId) return undefined;
    return {
      status: StructureStatus.ACTIVE,
      isArchived: false,
      ...(await this.sharedGroup.programWhereForCampusFilter(campusId))
    };
  }

  async getFoundationSummary() {
    const [campuses, programs, branches, batches, classes, sections, subjects, users, roleAssignments] = await Promise.all([
      this.prisma.campus.count(),
      this.prisma.program.count(),
      this.prisma.branch.count(),
      this.prisma.batch.count(),
      this.prisma.academicClass.count(),
      this.prisma.section.count(),
      this.prisma.subject.count(),
      this.prisma.user.count(),
      this.prisma.teacherRoleAssignment.count({ where: { isActive: true } })
    ]);

    return {
      campuses,
      programs,
      branches,
      batches,
      classes,
      sections,
      subjects,
      users,
      activeTeacherRoleAssignments: roleAssignments,
      structure: "Campus -> Program -> Branch -> Batch -> Class -> Section -> Users"
    };
  }

  async getSectionEcosystem(id: string, user: AuthUser) {
    await this.campusScope.assertSectionInScope(user, id);
    const section = await this.prisma.section.findFirst({
      where: { id, status: StructureStatus.ACTIVE, isArchived: false },
      include: {
        class: {
          include: {
            branch: {
              include: {
                program: { include: { campus: true } },
                roleAssignments: {
                  where: { isActive: true },
                  include: { teacherProfile: { include: { user: true } }, branch: true, class: true, section: true, subject: true }
                }
              }
            },
            batch: true,
            roleAssignments: {
              where: { isActive: true },
              include: { teacherProfile: { include: { user: true } }, branch: true, class: true, section: true, subject: true }
            }
          }
        },
        students: {
          where: { currentStatus: UserStatus.ACTIVE, isArchived: false },
          include: { user: true },
          orderBy: { rollNumber: "asc" }
        },
        subjectAssignments: {
          where: { isActive: true, subject: { status: StructureStatus.ACTIVE, isArchived: false } },
          include: { subject: { include: { syllabi: { where: { isArchived: false }, include: { units: { where: { isArchived: false }, orderBy: { unitOrder: "asc" } } } } } } },
          orderBy: { subject: { code: "asc" } }
        },
        roleAssignments: {
          where: { isActive: true },
          include: { teacherProfile: { include: { user: true } }, branch: true, class: true, section: true, subject: true }
        },
        timetableSlots: {
          where: { status: TimetableSlotStatus.ACTIVE },
          include: { subject: true, teacherProfile: { include: { user: true } } },
          orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }]
        },
        feeStructures: {
          where: { isActive: true, isArchived: false },
          include: { feeHead: true, assignments: true },
          orderBy: { createdAt: "desc" }
        },
        announcements: {
          where: { status: AnnouncementStatus.PUBLISHED },
          orderBy: { createdAt: "desc" },
          take: 20
        }
      }
    });
    if (!section) throw new NotFoundException("Section not found.");

    const cls = section.class;
    const fallbackSubjects = section.subjectAssignments.length
      ? []
      : await this.prisma.subject.findMany({
          where: {
            branchId: cls.branchId,
            semesterNumber: cls.semesterNumber,
            status: StructureStatus.ACTIVE,
            isArchived: false,
            OR: [{ batchId: cls.batchId }, { batchId: null }]
          },
          include: { syllabi: { where: { isArchived: false }, include: { units: { where: { isArchived: false }, orderBy: { unitOrder: "asc" } } } } },
          orderBy: { code: "asc" }
        });
    const subjects = section.subjectAssignments.length ? section.subjectAssignments.map((item) => item.subject) : fallbackSubjects;
    const scopedAssignments = [
      ...section.roleAssignments,
      ...section.class.roleAssignments.filter((assignment) => assignment.role === "HTPO" && !assignment.sectionId),
      ...section.class.branch.roleAssignments.filter((assignment) => assignment.role === "HTPO" && !assignment.classId && !assignment.sectionId)
    ];
    const roleGroups = scopedAssignments.reduce<Record<string, { teacherId: string; name: string; employeeCode: string; scope: string; branch?: { id: string; code: string; name: string } | null; class?: { id: string; label: string; semesterNumber: number } | null; section?: { id: string; name: string } | null; subject?: string | null }[]>>((acc, assignment) => {
      acc[assignment.role] = acc[assignment.role] ?? [];
      acc[assignment.role].push({
        teacherId: assignment.teacherProfileId,
        name: assignment.teacherProfile.user.fullName,
        employeeCode: assignment.teacherProfile.employeeCode,
        scope: [assignment.branch?.code, assignment.class?.label, assignment.section?.name].filter(Boolean).join(" / ") || "General",
        branch: assignment.branch ? { id: assignment.branch.id, code: assignment.branch.code, name: assignment.branch.name } : null,
        class: assignment.class ? { id: assignment.class.id, label: assignment.class.label, semesterNumber: assignment.class.semesterNumber } : null,
        section: assignment.section ? { id: assignment.section.id, name: assignment.section.name } : null,
        subject: assignment.subject?.code ?? null
      });
      return acc;
    }, {});

    return {
      section: {
        id: section.id,
        currentSectionId: section.id,
        name: section.name,
        code: section.code,
        semester: cls.semesterNumber,
        class: { id: cls.id, label: cls.label, code: cls.code, semesterNumber: cls.semesterNumber },
        batch: cls.batch ? { id: cls.batch.id, batchCode: cls.batch.batchCode, startYear: cls.batch.startYear, endYear: cls.batch.endYear } : null,
        branch: { id: cls.branch.id, code: cls.branch.code, name: cls.branch.name },
        department: { id: cls.branch.program.id, code: cls.branch.program.code, name: cls.branch.program.name },
        campus: { id: cls.branch.program.campus.id, code: cls.branch.program.campus.code, name: cls.branch.program.campus.name }
      },
      students: section.students.map((student) => ({
        id: student.id,
        currentSectionId: section.id,
        rollNumber: student.rollNumber,
        fullName: student.user.fullName,
        email: student.user.email.endsWith("@students.local") ? null : student.user.email,
        phone: student.user.phone
      })),
      subjects: subjects.map((subject) => ({
        id: subject.id,
        code: subject.code,
        name: subject.name,
        semesterNumber: subject.semesterNumber,
        syllabi: subject.syllabi.map((syllabus) => ({
          id: syllabus.id,
          units: syllabus.units.map((unit) => ({ id: unit.id, unitTitle: unit.unitTitle, unitOrder: unit.unitOrder }))
        }))
      })),
      teachers: {
        htpo: roleGroups.HTPO ?? [],
        ctpo: roleGroups.CTPO ?? [],
        stpo: roleGroups.STPO ?? []
      },
      timetable: section.timetableSlots.map((slot) => ({
        id: slot.id,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
        room: slot.room,
        subject: slot.subject ? { id: slot.subject.id, code: slot.subject.code, name: slot.subject.name } : null,
        teacher: slot.teacherProfile ? { id: slot.teacherProfile.id, name: slot.teacherProfile.user.fullName } : null
      })),
      feeStructures: section.feeStructures.map((fee) => ({
        id: fee.id,
        feeHeadName: fee.feeHeadName ?? fee.feeHead.name,
        amount: Number(fee.amount),
        deadline: fee.dueDate ? formatIstDate(fee.dueDate) : null,
        assignedStudents: fee.assignments.length
      })),
      announcements: section.announcements.map((announcement) => ({
        id: announcement.id,
        title: announcement.title,
        body: announcement.body,
        publishedAt: announcement.publishedAt
      })),
      attendanceScope: {
        campusId: cls.branch.program.campusId,
        programId: cls.branch.programId,
        branchId: cls.branchId,
        batchId: cls.batchId ?? undefined,
        classId: cls.id,
        sectionId: section.id
      }
    };
  }

  async listCampuses(query: PaginationQueryDto, user?: AuthUser) {
    const pagination = toPagination(query);
    const where: Prisma.CampusWhereInput = {
      isActive: true,
      status: StructureStatus.ACTIVE,
      ...this.campusScopeWhere(user),
      ...(query.search
        ? {
          OR: [
            { code: { contains: query.search, mode: "insensitive" as const } },
            { name: { contains: query.search, mode: "insensitive" as const } }
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

  async listCampusGroups() {
    return this.prisma.campusGroup.findMany({ orderBy: { name: "asc" } });
  }

  async getCampus(id: string, user?: AuthUser) {
    const campus = await this.prisma.campus.findFirst({
      where: { id, isActive: true, status: StructureStatus.ACTIVE, ...this.campusScopeWhere(user) },
      include: { group: true }
    });
    if (!campus) throw new NotFoundException("Campus not found.");
    return campus;
  }

  async createCampus(dto: CreateCampusDto) {
    await this.ensureCampusGroup(dto.groupId);
    return this.safeWrite(() =>
      this.prisma.campus.create({
        data: {
          code: normalizeCode(dto.code),
          name: normalizeName(dto.name),
          groupId: dto.groupId
        },
        include: { group: true }
      })
    );
  }

  async updateCampus(id: string, dto: UpdateCampusDto, user: AuthUser) {
    await this.ensureCampus(id);
    await this.campusScope.assertCampusAllowed(user, id);
    if (dto.groupId) {
      await this.ensureCampusGroup(dto.groupId);
      await this.campusScope.assertCampusGroupChangeAllowed(id, dto.groupId);
    }

    return this.safeWrite(() =>
      this.prisma.campus.update({
        where: { id },
        data: {
          code: dto.code ? normalizeCode(dto.code) : undefined,
          name: dto.name ? normalizeName(dto.name) : undefined,
          groupId: dto.groupId
        },
        include: { group: true }
      })
    );
  }

  async archiveCampus(id: string, user: AuthUser) {
    await this.ensureCampus(id);
    await this.campusScope.assertCampusAllowed(user, id);
    return this.prisma.campus.update({ where: { id }, data: { status: StructureStatus.ARCHIVED, isActive: false } });
  }

  async listPrograms(query: ScopedStructureQueryDto) {
    const pagination = toPagination(query);
    const campusProgramFilter = query.campusId ? await this.sharedGroup.programWhereForCampusFilter(query.campusId) : {};
    const where: Prisma.ProgramWhereInput = {
      status: StructureStatus.ACTIVE,
      isArchived: false,
      ...campusProgramFilter,
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
        include: { campus: true },
        orderBy: [{ campus: { code: "asc" } }, { code: "asc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.program.count({ where })
    ]);

    return { items, total, page: pagination.page, pageSize: pagination.pageSize };
  }

  async createProgram(dto: CreateProgramDto) {
    await this.ensureCampus(dto.campusId);
    const campus = await this.sharedGroup.loadCampus(dto.campusId);
    const code = normalizeCode(dto.code);
    let structureScope: ProgramStructureScope = ProgramStructureScope.CAMPUS_OWNED;
    if (campus && this.sharedGroup.isSharedGroupCampus(campus) && isSharedGroupProgramCode(code)) {
      if (campus.code !== CANONICAL_SHARED_STRUCTURE_CAMPUS_CODE) {
        throw new BadRequestException("Diploma, BTech, and MTech are managed on KIET for the shared KIET/KIEK group.");
      }
      structureScope = ProgramStructureScope.GROUP_SHARED;
    }
    return this.safeWrite(() =>
      this.prisma.program.create({
        data: {
          campusId: dto.campusId,
          code,
          name: normalizeName(dto.name),
          durationValue: dto.durationValue,
          durationUnit: dto.durationUnit,
          semesters: dto.semesters,
          structureScope
        },
        include: { campus: true }
      })
    );
  }

  async updateProgram(id: string, dto: UpdateProgramDto, user: AuthUser) {
    await this.ensureProgram(id);
    await this.campusScope.assertProgramInScope(user, id);
    return this.safeWrite(() =>
      this.prisma.program.update({
        where: { id },
        data: {
          code: dto.code ? normalizeCode(dto.code) : undefined,
          name: dto.name ? normalizeName(dto.name) : undefined,
          durationValue: dto.durationValue,
          durationUnit: dto.durationUnit,
          semesters: dto.semesters
        },
        include: { campus: true }
      })
    );
  }

  async archiveProgram(id: string, user: AuthUser) {
    await this.ensureProgram(id);
    await this.campusScope.assertProgramInScope(user, id);
    const archivedAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      await tx.branch.updateMany({ where: { programId: id }, data: { status: StructureStatus.ARCHIVED, isArchived: true, archivedAt } });
      return tx.program.update({ where: { id }, data: { status: StructureStatus.ARCHIVED, isArchived: true, archivedAt } });
    });
  }

  async listBranches(query: ScopedStructureQueryDto) {
    const pagination = toPagination(query);
    const programFilter = await this.activeProgramRelationFilter(query.campusId, query.programId);
    const where: Prisma.BranchWhereInput = {
      status: StructureStatus.ACTIVE,
      isArchived: false,
      programId: query.programId,
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
        orderBy: [{ program: { code: "asc" } }, { code: "asc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.branch.count({ where })
    ]);

    return { items, total, page: pagination.page, pageSize: pagination.pageSize };
  }

  async createBranch(dto: CreateBranchDto) {
    const program = await this.ensureProgram(dto.programId);
    const durationYears = dto.durationYears ?? program.durationValue;
    return this.safeWrite(() =>
      this.prisma.branch.create({
        data: {
          programId: dto.programId,
          code: normalizeCode(dto.code),
          name: normalizeName(dto.name),
          durationYears
        },
        include: { program: { include: { campus: true } } }
      })
    );
  }

  async updateBranch(id: string, dto: UpdateBranchDto, user: AuthUser) {
    await this.ensureBranch(id);
    await this.campusScope.assertBranchInScope(user, id);
    return this.safeWrite(() =>
      this.prisma.branch.update({
        where: { id },
        data: {
          code: dto.code ? normalizeCode(dto.code) : undefined,
          name: dto.name ? normalizeName(dto.name) : undefined,
          durationYears: dto.durationYears
        },
        include: { program: { include: { campus: true } } }
      })
    );
  }

  async archiveBranch(id: string, user: AuthUser) {
    await this.ensureBranch(id);
    await this.campusScope.assertBranchInScope(user, id);
    return this.prisma.branch.update({ where: { id }, data: { status: StructureStatus.ARCHIVED, isArchived: true, archivedAt: new Date() } });
  }

  async listBatches(query: ScopedStructureQueryDto) {
    const pagination = toPagination(query);
    const programFilter = await this.activeProgramRelationFilter(query.campusId, query.programId);
    const where: Prisma.BatchWhereInput = {
      status: StructureStatus.ACTIVE,
      isArchived: false,
      NOT: { batchCode: { startsWith: "STRUCTURE_" } },
      branchId: query.branchId,
      branch: {
        status: StructureStatus.ACTIVE,
        ...(query.programId ? { programId: query.programId } : {}),
        ...(programFilter ? { program: programFilter } : {})
      }
    };

    const [items, total] = await Promise.all([
      this.prisma.batch.findMany({
        where,
        include: { branch: { include: { program: { include: { campus: true } } } } },
        orderBy: [{ startYear: "desc" }, { endYear: "desc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.batch.count({ where })
    ]);

    return { items, total, page: pagination.page, pageSize: pagination.pageSize };
  }

  async createBatch(dto: CreateBatchDto) {
    assertValidBatchYears(dto.startYear, dto.endYear);
    await this.ensureBranch(dto.branchId);
    return this.safeWrite(() =>
      this.prisma.batch.create({
        data: dto,
        include: { branch: { include: { program: { include: { campus: true } } } } }
      })
    );
  }

  async updateBatch(id: string, dto: UpdateBatchDto, user: AuthUser) {
    const batch = await this.ensureBatch(id);
    await this.campusScope.assertBatchInScope(user, id);
    const startYear = dto.startYear ?? batch.startYear;
    const endYear = dto.endYear ?? batch.endYear;
    assertValidBatchYears(startYear, endYear);

    return this.safeWrite(() =>
      this.prisma.batch.update({
        where: { id },
        data: { startYear: dto.startYear, endYear: dto.endYear },
        include: { branch: { include: { program: { include: { campus: true } } } } }
      })
    );
  }

  async archiveBatch(id: string, user: AuthUser) {
    await this.ensureBatch(id);
    await this.campusScope.assertBatchInScope(user, id);
    return this.prisma.batch.update({ where: { id }, data: { status: StructureStatus.ARCHIVED, isArchived: true, archivedAt: new Date() } });
  }

  async generateBatchClasses(id: string, dto: GenerateBatchClassesDto, user: AuthUser) {
    await this.campusScope.assertBatchInScope(user, id);
    const batch = await this.ensureBatchWithProgram(id);
    const sectionNames = (dto.sectionNames?.length ? dto.sectionNames : ["A"]).map(normalizeCode);
    const programSemesters = batch.branch.program.semesters;

    return this.prisma.$transaction(async (tx) => {
      const classes = [];
      for (let semesterNumber = 1; semesterNumber <= programSemesters; semesterNumber += 1) {
        const yearNumber = Math.ceil(semesterNumber / 2);
        const academicClass = await tx.academicClass.upsert({
          where: { batchId_semesterNumber: { batchId: id, semesterNumber } },
          update: {
            yearNumber,
            label: classLabelForSemester(semesterNumber)
          },
          create: {
            branchId: batch.branchId,
            batchId: id,
            yearNumber,
            semesterNumber,
            label: classLabelForSemester(semesterNumber)
          }
        });

        for (const sectionName of sectionNames) {
          await tx.section.upsert({
            where: { classId_name: { classId: academicClass.id, name: sectionName } },
            update: { capacity: dto.sectionCapacity },
            create: {
              campusId: batch.branch.program.campusId,
              classId: academicClass.id,
              name: sectionName,
              capacity: dto.sectionCapacity
            }
          });
        }

        classes.push(academicClass);
      }

      return {
        generatedClasses: classes.length,
        generatedSectionsPerClass: sectionNames.length
      };
    });
  }

  async listClasses(query: ScopedStructureQueryDto) {
    const pagination = toPagination(query);
    const programFilter = await this.activeProgramRelationFilter(query.campusId, query.programId);
    const where: Prisma.AcademicClassWhereInput = {
      status: StructureStatus.ACTIVE,
      isArchived: false,
      batchId: query.batchId,
      batch: {
        status: StructureStatus.ACTIVE,
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.programId || query.campusId
          ? {
              branch: {
                status: StructureStatus.ACTIVE,
                ...(query.programId ? { programId: query.programId } : {}),
                ...(programFilter ? { program: programFilter } : {})
              }
            }
          : {})
      }
    };

    const [items, total] = await Promise.all([
      this.prisma.academicClass.findMany({
        where,
        include: { branch: { include: { program: { include: { campus: true } } } }, batch: true },
        orderBy: [{ semesterNumber: "asc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.academicClass.count({ where })
    ]);

    return { items, total, page: pagination.page, pageSize: pagination.pageSize };
  }

  async createClass(dto: CreateClassDto) {
    const batch = await this.ensureBatchWithProgram(dto.batchId);
    assertValidClassPlacement(dto.yearNumber, dto.semesterNumber, batch.branch.program.semesters);

    return this.safeWrite(() =>
      this.prisma.academicClass.create({
        data: {
          branchId: batch.branchId,
          batchId: dto.batchId,
          yearNumber: dto.yearNumber,
          semesterNumber: dto.semesterNumber,
          label: normalizeName(dto.label)
        },
        include: { branch: { include: { program: { include: { campus: true } } } }, batch: true }
      })
    );
  }

  async updateClass(id: string, dto: UpdateClassDto, user: AuthUser) {
    await this.campusScope.assertAcademicClassInScope(user, id);
    const academicClass = await this.ensureClassWithProgram(id);
    const yearNumber = dto.yearNumber ?? academicClass.yearNumber;
    const semesterNumber = dto.semesterNumber ?? academicClass.semesterNumber;
    assertValidClassPlacement(yearNumber, semesterNumber, academicClass.branch.program.semesters);

    return this.safeWrite(() =>
      this.prisma.academicClass.update({
        where: { id },
        data: {
          yearNumber: dto.yearNumber,
          semesterNumber: dto.semesterNumber,
          label: dto.label ? normalizeName(dto.label) : undefined
        },
        include: { branch: { include: { program: { include: { campus: true } } } }, batch: true }
      })
    );
  }

  async archiveClass(id: string, user: AuthUser) {
    await this.campusScope.assertAcademicClassInScope(user, id);
    await this.ensureClass(id);
    const archivedAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      await tx.section.updateMany({ where: { classId: id }, data: { status: StructureStatus.ARCHIVED, isArchived: true, archivedAt } });
      return tx.academicClass.update({ where: { id }, data: { status: StructureStatus.ARCHIVED, isArchived: true, archivedAt } });
    });
  }

  async listSections(query: ScopedStructureQueryDto) {
    const pagination = toPagination(query);
    const programFilter = await this.activeProgramRelationFilter(query.campusId, query.programId);
    const where: Prisma.SectionWhereInput = {
      status: StructureStatus.ACTIVE,
      isArchived: false,
      classId: query.classId,
      class: {
        status: StructureStatus.ACTIVE,
        isArchived: false,
        ...(query.batchId ? { batchId: query.batchId } : {}),
        ...(query.branchId || query.programId || query.campusId
          ? {
              batch: {
                status: StructureStatus.ACTIVE,
                ...(query.branchId ? { branchId: query.branchId } : {}),
                ...(query.programId || query.campusId
                  ? {
                      branch: {
                        status: StructureStatus.ACTIVE,
                        ...(query.programId ? { programId: query.programId } : {}),
                        ...(programFilter ? { program: programFilter } : {})
                      }
                    }
                  : {})
              }
            }
          : {})
      },
      ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {})
    };

    const [items, total] = await Promise.all([
      this.prisma.section.findMany({
        where,
        include: {
          class: { include: { branch: { include: { program: { include: { campus: true } } } }, batch: true } }
        },
        orderBy: { name: "asc" },
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.section.count({ where })
    ]);

    return { items, total, page: pagination.page, pageSize: pagination.pageSize };
  }

  async listSubjects(query: ScopedStructureQueryDto) {
    const pagination = toPagination(query);
    const where: Prisma.SubjectWhereInput = {
      status: StructureStatus.ACTIVE,
      isArchived: false,
      branchId: query.branchId,
      branch: { status: StructureStatus.ACTIVE },
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
      this.prisma.subject.findMany({
        where,
        include: { branch: { include: { program: { include: { campus: true } } } } },
        orderBy: [{ semesterNumber: "asc" }, { code: "asc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.subject.count({ where })
    ]);

    return { items, total, page: pagination.page, pageSize: pagination.pageSize };
  }

  async createSubject(dto: CreateSubjectDto) {
    const branch = await this.ensureBranchWithProgram(dto.branchId);
    assertValidSubjectSemester(dto.semesterNumber, branch.program.semesters);

    return this.safeWrite(() =>
      this.prisma.subject.create({
        data: {
          branchId: dto.branchId,
          code: normalizeCode(dto.code),
          name: normalizeName(dto.name),
          semesterNumber: dto.semesterNumber
        },
        include: { branch: { include: { program: { include: { campus: true } } } } }
      })
    );
  }

  async updateSubject(id: string, dto: UpdateSubjectDto, user: AuthUser) {
    const subject = await this.ensureSubjectWithProgram(id);
    await this.campusScope.assertBranchInScope(user, subject.branchId);
    const semesterNumber = dto.semesterNumber ?? subject.semesterNumber;
    assertValidSubjectSemester(semesterNumber, subject.branch.program.semesters);

    return this.safeWrite(() =>
      this.prisma.subject.update({
        where: { id },
        data: {
          code: dto.code ? normalizeCode(dto.code) : undefined,
          name: dto.name ? normalizeName(dto.name) : undefined,
          semesterNumber: dto.semesterNumber
        },
        include: { branch: { include: { program: { include: { campus: true } } } } }
      })
    );
  }

  async archiveSubject(id: string, user: AuthUser) {
    const subject = await this.ensureSubjectWithProgram(id);
    await this.campusScope.assertBranchInScope(user, subject.branchId);
    return this.prisma.subject.update({ where: { id }, data: { status: StructureStatus.ARCHIVED, isArchived: true, archivedAt: new Date() } });
  }

  async createSection(dto: CreateSectionDto) {
    const academicClass = await this.ensureClassWithProgram(dto.classId);
    return this.safeWrite(() =>
      this.prisma.section.create({
        data: {
          campusId: academicClass.branch.program.campusId,
          classId: dto.classId,
          name: normalizeCode(dto.name),
          capacity: dto.capacity
        },
        include: {
          class: { include: { branch: { include: { program: { include: { campus: true } } } }, batch: true } }
        }
      })
    );
  }

  async updateSection(id: string, dto: UpdateSectionDto, user: AuthUser) {
    await this.ensureSection(id);
    await this.campusScope.assertSectionInScope(user, id);
    return this.safeWrite(() =>
      this.prisma.section.update({
        where: { id },
        data: {
          name: dto.name ? normalizeCode(dto.name) : undefined,
          capacity: dto.capacity
        },
        include: {
          class: { include: { branch: { include: { program: { include: { campus: true } } } }, batch: true } }
        }
      })
    );
  }

  async archiveSection(id: string, user: AuthUser) {
    await this.ensureSection(id);
    await this.campusScope.assertSectionInScope(user, id);
    return this.prisma.section.update({ where: { id }, data: { status: StructureStatus.ARCHIVED, isArchived: true, archivedAt: new Date() } });
  }

  private async ensureCampusGroup(id: string) {
    const group = await this.prisma.campusGroup.findUnique({ where: { id } });
    if (!group) throw new NotFoundException("Campus group not found.");
    return group;
  }

  private async ensureCampus(id: string) {
    const campus = await this.prisma.campus.findFirst({ where: { id, isActive: true, status: StructureStatus.ACTIVE } });
    if (!campus) throw new NotFoundException("Campus not found.");
    return campus;
  }

  private campusScopeWhere(user?: AuthUser): Prisma.CampusWhereInput {
    if (!user) return {};
    if (user.campusId) return { id: user.campusId };
    if (user.campusGroupId) return { groupId: user.campusGroupId };
    return {};
  }

  private async ensureProgram(id: string) {
    const program = await this.prisma.program.findUnique({ where: { id } });
    if (!program) throw new NotFoundException("Program not found.");
    return program;
  }

  private async ensureBranch(id: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id } });
    if (!branch) throw new NotFoundException("Branch not found.");
    return branch;
  }

  private async ensureBranchWithProgram(id: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id },
      include: { program: true }
    });
    if (!branch) throw new NotFoundException("Branch not found.");
    return branch;
  }

  private async ensureBatch(id: string) {
    const batch = await this.prisma.batch.findUnique({ where: { id } });
    if (!batch) throw new NotFoundException("Batch not found.");
    return batch;
  }

  private async ensureBatchWithProgram(id: string) {
    const batch = await this.prisma.batch.findUnique({
      where: { id },
      include: { branch: { include: { program: true } } }
    });
    if (!batch) throw new NotFoundException("Batch not found.");
    return batch;
  }

  private async ensureClass(id: string) {
    const academicClass = await this.prisma.academicClass.findUnique({ where: { id } });
    if (!academicClass) throw new NotFoundException("Class not found.");
    return academicClass;
  }

  private async ensureClassWithProgram(id: string) {
    const academicClass = await this.prisma.academicClass.findUnique({
      where: { id },
      include: { branch: { include: { program: true } }, batch: true }
    });
    if (!academicClass) throw new NotFoundException("Class not found.");
    return academicClass;
  }

  private async ensureSection(id: string) {
    const section = await this.prisma.section.findUnique({ where: { id } });
    if (!section) throw new NotFoundException("Section not found.");
    return section;
  }

  private async ensureSubjectWithProgram(id: string) {
    const subject = await this.prisma.subject.findUnique({
      where: { id },
      include: { branch: { include: { program: true } } }
    });
    if (!subject) throw new NotFoundException("Subject not found.");
    return subject;
  }

  private async safeWrite<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A record with the same unique details already exists.");
      }
      throw error;
    }
  }
}
