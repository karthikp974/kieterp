import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { CampusIsolationPolicy, Prisma, UserType } from "@prisma/client";
import { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { isInstitutionWideAdmin } from "./institution-admin.util";
import { SharedGroupAcademicService } from "./shared-group-academic.service";

export { isInstitutionWideAdmin } from "./institution-admin.util";

@Injectable()
export class CampusScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sharedGroup: SharedGroupAcademicService
  ) {}

  assertInstitutionWideAdmin(user: AuthUser, message = "Institution-wide admin access required.") {
    if (!isInstitutionWideAdmin(user)) {
      throw new ForbiddenException(message);
    }
  }

  campusWhere(user?: AuthUser): Prisma.CampusWhereInput {
    if (!user) return {};
    if (user.campusId) return { id: user.campusId };
    if (user.campusGroupId) return { groupId: user.campusGroupId };
    return {};
  }

  studentProfileWhere(user?: AuthUser): Prisma.StudentProfileWhereInput {
    if (!user || isInstitutionWideAdmin(user)) return {};
    if (user.campusId) {
      return { user: { campusId: user.campusId } };
    }
    if (user.campusGroupId) {
      return {
        user: {
          campus: { groupId: user.campusGroupId }
        }
      };
    }
    return {};
  }

  async assertCampusAllowed(user: AuthUser, campusId: string) {
    const campus = await this.prisma.campus.findFirst({
      where: { id: campusId, isActive: true, ...this.campusWhere(user) },
      select: { id: true }
    });
    if (!campus) {
      throw new ForbiddenException("Campus is outside your allowed scope.");
    }
  }

  async assertStudentInScope(user: AuthUser, studentProfileId: string) {
    if (isInstitutionWideAdmin(user)) return;
    const student = await this.prisma.studentProfile.findFirst({
      where: { id: studentProfileId, ...this.studentProfileWhere(user) },
      select: { id: true }
    });
    if (!student) {
      throw new ForbiddenException("Student is outside your allowed scope.");
    }
  }

  /** Programs (departments) visible under the admin's campus / group boundary. */
  async programWhere(user?: AuthUser | null): Promise<Prisma.ProgramWhereInput> {
    return this.sharedGroup.programWhereForUser(user);
  }

  async branchWhere(user?: AuthUser | null): Promise<Prisma.BranchWhereInput> {
    if (!user || isInstitutionWideAdmin(user)) return {};
    return { program: await this.programWhere(user) };
  }

  async batchWhere(user?: AuthUser | null): Promise<Prisma.BatchWhereInput> {
    if (!user || isInstitutionWideAdmin(user)) return {};
    return { branch: await this.branchWhere(user) };
  }

  /** Academic classes reachable for promotions / structure lists (via batch → branch → campus). */
  async academicClassWhere(user?: AuthUser | null): Promise<Prisma.AcademicClassWhereInput> {
    if (!user || isInstitutionWideAdmin(user)) return {};
    return { batch: await this.batchWhere(user) };
  }

  /** Sections carry `campusId` — use for direct section scope checks. */
  async sectionWhere(user?: AuthUser | null): Promise<Prisma.SectionWhereInput> {
    return this.sharedGroup.sectionWhereForUser(user);
  }

  /** Fee structures are keyed by `campusId` (and campus → group for shared groups). */
  feeStructureWhere(user?: AuthUser | null): Prisma.FeeStructureWhereInput {
    if (!user || user.type !== UserType.ADMIN || isInstitutionWideAdmin(user)) return {};
    if (user.campusId) return { campusId: user.campusId };
    if (user.campusGroupId) return { campus: { groupId: user.campusGroupId } };
    return {};
  }

  /**
   * Campus- or group-scoped admins: teacher directory is limited to teachers tied to that campus/group
   * (user campus or any active assignment campus in the same boundary).
   */
  teacherProfileWhereForAdmin(user: AuthUser): Prisma.TeacherProfileWhereInput {
    if (user.type !== UserType.ADMIN || isInstitutionWideAdmin(user)) return {};
    if (user.campusId) {
      return {
        OR: [{ user: { campusId: user.campusId } }, { assignments: { some: { isActive: true, campusId: user.campusId } } }]
      };
    }
    if (user.campusGroupId) {
      return {
        OR: [
          { user: { campus: { groupId: user.campusGroupId } } },
          { assignments: { some: { isActive: true, campus: { groupId: user.campusGroupId } } } }
        ]
      };
    }
    return {};
  }

  /** Audit log actor (`user`) must belong to the same campus / group for scoped admins. */
  auditLogActorWhere(user: AuthUser): Prisma.AuditLogWhereInput {
    if (user.type !== UserType.ADMIN || isInstitutionWideAdmin(user)) return {};
    if (user.campusId) return { user: { campusId: user.campusId } };
    if (user.campusGroupId) return { user: { campus: { groupId: user.campusGroupId } } };
    return {};
  }

  async assertSectionInScope(user: AuthUser, sectionId: string) {
    if (isInstitutionWideAdmin(user)) return;
    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, ...(await this.sectionWhere(user)) },
      select: { id: true }
    });
    if (!section) throw new ForbiddenException("Section is outside your allowed scope.");
  }

  async assertProgramInScope(user: AuthUser, programId: string) {
    if (isInstitutionWideAdmin(user)) return;
    const program = await this.prisma.program.findFirst({
      where: { id: programId, ...(await this.programWhere(user)) },
      select: { id: true }
    });
    if (!program) throw new ForbiddenException("Department is outside your allowed scope.");
  }

  async assertBranchInScope(user: AuthUser, branchId: string) {
    if (isInstitutionWideAdmin(user)) return;
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, ...(await this.branchWhere(user)) },
      select: { id: true }
    });
    if (!branch) throw new ForbiddenException("Branch is outside your allowed scope.");
  }

  async assertBatchInScope(user: AuthUser, batchId: string) {
    if (isInstitutionWideAdmin(user)) return;
    const batch = await this.prisma.batch.findFirst({
      where: { id: batchId, ...(await this.batchWhere(user)) },
      select: { id: true }
    });
    if (!batch) throw new ForbiddenException("Batch is outside your allowed scope.");
  }

  async assertAcademicClassInScope(user: AuthUser, classId: string) {
    if (isInstitutionWideAdmin(user)) return;
    const row = await this.prisma.academicClass.findFirst({
      where: { id: classId, ...(await this.academicClassWhere(user)) },
      select: { id: true }
    });
    if (!row) throw new ForbiddenException("Class is outside your allowed scope.");
  }

  /** Prevent moving a campus between SHARED (KIET/KIEK) and ISOLATED (KIEW) groups. */
  async assertCampusGroupChangeAllowed(campusId: string, nextGroupId: string) {
    const [campus, nextGroup] = await Promise.all([
      this.prisma.campus.findUnique({
        where: { id: campusId },
        select: { groupId: true, group: { select: { isolationPolicy: true } } }
      }),
      this.prisma.campusGroup.findUnique({
        where: { id: nextGroupId },
        select: { isolationPolicy: true }
      })
    ]);
    if (!campus || !nextGroup) {
      throw new BadRequestException("Campus or campus group not found.");
    }
    if (campus.groupId === nextGroupId) return;

    const currentPolicy = campus.group.isolationPolicy;
    if (currentPolicy !== nextGroup.isolationPolicy) {
      const from = currentPolicy === CampusIsolationPolicy.ISOLATED ? "isolated (KIEW)" : "shared (KIET/KIEK)";
      const to = nextGroup.isolationPolicy === CampusIsolationPolicy.ISOLATED ? "isolated (KIEW)" : "shared (KIET/KIEK)";
      throw new BadRequestException(`Cannot move campus from ${from} to ${to} group.`);
    }
  }
}
