import { BadRequestException, Injectable } from "@nestjs/common";
import { CampusIsolationPolicy, Prisma, ProgramStructureScope, StructureStatus } from "@prisma/client";
import { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { isInstitutionWideAdmin } from "./institution-admin.util";
import {
  CANONICAL_SHARED_STRUCTURE_CAMPUS_CODE,
  isKietOnlyProgramCode
} from "./shared-group-academic.constants";

type CampusWithGroup = {
  id: string;
  code: string;
  groupId: string;
  status: StructureStatus;
  group: { isolationPolicy: CampusIsolationPolicy };
};

type ProgramForCampusCheck = {
  campusId: string;
  code: string;
  structureScope: ProgramStructureScope;
  campus?: { groupId: string };
};

@Injectable()
export class SharedGroupAcademicService {
  constructor(private readonly prisma: PrismaService) {}

  isSharedGroupCampus(campus: { group: { isolationPolicy: CampusIsolationPolicy } }): boolean {
    return campus.group.isolationPolicy === CampusIsolationPolicy.SHARED;
  }

  async loadCampus(campusId: string): Promise<CampusWithGroup | null> {
    return this.prisma.campus.findUnique({
      where: { id: campusId },
      include: { group: true }
    });
  }

  /** Students are filtered by operational campus label (`user.campusId`), not structure owner campus. */
  studentProfileWhereOperationalCampus(campusId: string): Prisma.StudentProfileWhereInput {
    return { user: { campusId } };
  }

  async programRelationFilter(campusId?: string, programId?: string): Promise<Prisma.ProgramWhereInput | undefined> {
    return this.programCatalogFilter(campusId, programId, "shared");
  }

  /** Admin catalog vs workflow forms: `owned` limits to the selected campus record owner. */
  async programCatalogFilter(
    campusId?: string,
    programId?: string,
    campusScope: "shared" | "owned" = "shared"
  ): Promise<Prisma.ProgramWhereInput | undefined> {
    if (programId) {
      return { id: programId, status: StructureStatus.ACTIVE, isArchived: false };
    }
    if (!campusId) return undefined;
    if (campusScope === "owned") {
      return { campusId, status: StructureStatus.ACTIVE, isArchived: false, campus: { status: StructureStatus.ACTIVE } };
    }
    return {
      status: StructureStatus.ACTIVE,
      isArchived: false,
      ...(await this.programWhereForCampusFilter(campusId))
    };
  }

  async sectionCatalogFilter(
    campusId?: string,
    campusScope: "shared" | "owned" = "shared"
  ): Promise<Prisma.SectionWhereInput> {
    if (!campusId) return {};
    if (campusScope === "owned") {
      return { campusId };
    }
    return this.sectionWhereForCampusFilter(campusId);
  }

  /** Programs visible when picking an operational campus (student label, attendance scope, etc.). */
  async programWhereForCampusFilter(campusId?: string | null): Promise<Prisma.ProgramWhereInput> {
    if (!campusId) return {};
    const campus = await this.loadCampus(campusId);
    if (!campus || !this.isSharedGroupCampus(campus)) {
      return { campusId, campus: { status: StructureStatus.ACTIVE } };
    }
    return {
      campus: { groupId: campus.groupId, status: StructureStatus.ACTIVE },
      OR: [
        { structureScope: ProgramStructureScope.GROUP_SHARED },
        { campusId, structureScope: ProgramStructureScope.CAMPUS_OWNED }
      ]
    };
  }

  /** Sections reachable when operational campus is KIEK but structure lives on KIET. */
  async sectionWhereForCampusFilter(campusId?: string | null): Promise<Prisma.SectionWhereInput> {
    if (!campusId) return {};
    const campus = await this.loadCampus(campusId);
    if (!campus || !this.isSharedGroupCampus(campus)) {
      return { campusId };
    }
    const canonical = await this.prisma.campus.findFirst({
      where: { groupId: campus.groupId, code: CANONICAL_SHARED_STRUCTURE_CAMPUS_CODE },
      select: { id: true }
    });
    return {
      OR: [
        { campusId },
        {
          campusId: canonical?.id ?? campusId,
          class: { batch: { branch: { program: { structureScope: ProgramStructureScope.GROUP_SHARED } } } }
        }
      ]
    };
  }

  async programWhereForUser(user?: AuthUser | null): Promise<Prisma.ProgramWhereInput> {
    if (!user || isInstitutionWideAdmin(user)) return {};
    if (user.campusGroupId) return { campus: { groupId: user.campusGroupId } };
    if (user.campusId) return this.programWhereForCampusFilter(user.campusId);
    return {};
  }

  async sectionWhereForUser(user?: AuthUser | null): Promise<Prisma.SectionWhereInput> {
    if (!user || isInstitutionWideAdmin(user)) return {};
    if (user.campusGroupId) return { campus: { groupId: user.campusGroupId } };
    if (user.campusId) return this.sectionWhereForCampusFilter(user.campusId);
    return {};
  }

  assertStudentOperationalCampusMatchesSection(
    program: ProgramForCampusCheck,
    studentCampus: CampusWithGroup
  ) {
    if (program.structureScope === ProgramStructureScope.GROUP_SHARED) {
      if (!this.isSharedGroupCampus(studentCampus)) {
        throw new BadRequestException("Shared-structure students must belong to a KIET/KIEK campus.");
      }
      if (program.campus?.groupId && studentCampus.groupId !== program.campus.groupId) {
        throw new BadRequestException("Student campus must be in the same group as the selected section.");
      }
      if (studentCampus.code !== CANONICAL_SHARED_STRUCTURE_CAMPUS_CODE && isKietOnlyProgramCode(program.code)) {
        throw new BadRequestException("This program is only available on KIET.");
      }
      return;
    }
    if (studentCampus.id !== program.campusId) {
      throw new BadRequestException("Selected campus does not match the selected section.");
    }
  }

  assertOperationalCampusMatchesStructure(program: ProgramForCampusCheck, operationalCampus: CampusWithGroup) {
    if (program.structureScope === ProgramStructureScope.GROUP_SHARED) {
      if (!this.isSharedGroupCampus(operationalCampus)) {
        throw new BadRequestException("Invalid campus for shared academic structure.");
      }
      if (program.campus?.groupId && operationalCampus.groupId !== program.campus.groupId) {
        throw new BadRequestException("Campus must be in the KIET/KIEK group for this program.");
      }
      if (operationalCampus.code !== CANONICAL_SHARED_STRUCTURE_CAMPUS_CODE && isKietOnlyProgramCode(program.code)) {
        throw new BadRequestException("This program is only available on KIET.");
      }
      return;
    }
    if (operationalCampus.id !== program.campusId) {
      throw new BadRequestException("Program does not belong to selected campus or is archived.");
    }
  }

  /** When scope carries operational campusId, ensure it aligns with section's program. */
  assertScopeCampusMatchesSectionProgram(
    program: ProgramForCampusCheck,
    scopeCampusId: string,
    operationalCampus: CampusWithGroup
  ) {
    this.assertOperationalCampusMatchesStructure(program, operationalCampus);
    if (program.structureScope === ProgramStructureScope.GROUP_SHARED) {
      return;
    }
    if (scopeCampusId !== program.campusId) {
      throw new BadRequestException("Attendance scope campus does not match section structure.");
    }
  }
}
