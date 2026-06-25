import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PermissionAction, Prisma, StudentTeamMemberRole, StudentTeamStatus, StructureStatus, UserStatus, UserType } from "@prisma/client";
import { AuthUser, ScopeRef } from "../auth/auth.types";
import { toPagination } from "../common/pagination.dto";
import { PermissionsService } from "../permissions/permissions.service";
import { sectionTreeToScope } from "../permissions/operational-scope.util";
import { SharedGroupAcademicService } from "../permissions/shared-group-academic.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateTeamDto, TeamQueryDto } from "./teams.dto";

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly sharedGroup: SharedGroupAcademicService
  ) {}

  async list(user: AuthUser, query: TeamQueryDto) {
    if (user.type === UserType.STUDENT) return this.myTeams(user);
    const pagination = toPagination(query);
    const scope = await this.scopeForQuery(query);
    if (user.type === UserType.TEACHER && !scope) throw new ForbiddenException("Teacher team lists must be filtered by assigned scope.");
    this.assertAllowed(user, PermissionAction.VIEW_TEAMS, scope);
    const where: Prisma.StudentTeamWhereInput = {
      status: StudentTeamStatus.ACTIVE,
      sectionId: query.sectionId,
      members: query.studentProfileId ? { some: { studentProfileId: query.studentProfileId } } : undefined,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { description: { contains: query.search, mode: "insensitive" } }
            ]
          }
        : {})
    };
    const [items, total] = await Promise.all([
      this.prisma.studentTeam.findMany({
        where,
        include: this.include,
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.studentTeam.count({ where })
    ]);
    const visibleItems = user.type === UserType.TEACHER ? items.filter((item) => this.canViewTeam(user, item)) : items;
    return { items: visibleItems.map((team) => this.toTeamObject(team)), total: user.type === UserType.TEACHER ? visibleItems.length : total, page: pagination.page, pageSize: pagination.pageSize };
  }

  async myTeams(user: AuthUser) {
    if (user.type !== UserType.STUDENT) throw new ForbiddenException("Only students can use personal team endpoint.");
    const student = await this.prisma.studentProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!student) throw new NotFoundException("Student profile not found.");
    const teams = await this.prisma.studentTeam.findMany({
      where: { status: StudentTeamStatus.ACTIVE, members: { some: { studentProfileId: student.id } } },
      include: this.include,
      orderBy: { createdAt: "desc" }
    });
    return { items: teams.map((team) => this.toTeamObject(team)) };
  }

  async options(user: AuthUser) {
    if (user.type === UserType.STUDENT) throw new ForbiddenException("Students do not need team creation options.");
    if (user.type === UserType.ADMIN) {
      const [sections, students] = await Promise.all([
        this.prisma.section.findMany({ where: { status: StructureStatus.ACTIVE }, include: this.sectionInclude, orderBy: { name: "asc" }, take: 100 }),
        this.prisma.studentProfile.findMany({ where: { currentStatus: UserStatus.ACTIVE }, include: this.studentInclude, orderBy: { rollNumber: "asc" }, take: 200 })
      ]);
      return { sections: sections.map((section) => this.toSectionOption(section)), students: students.map((student) => this.toStudentOption(student)) };
    }

    const allowedScopes = user.assignments.filter((assignment) => this.permissions.can(user, { action: PermissionAction.MANAGE_TEAMS, scope: assignment }).allowed);
    const sectionWheres = await Promise.all(allowedScopes.map((scope) => this.scopeToSectionWhere(scope)));
    const sections = await this.prisma.section.findMany({
      where: { status: StructureStatus.ACTIVE, OR: sectionWheres },
      include: this.sectionInclude,
      orderBy: { name: "asc" },
      take: 100
    });
    const students = await this.prisma.studentProfile.findMany({
      where: { currentStatus: UserStatus.ACTIVE, sectionId: { in: sections.map((section) => section.id) } },
      include: this.studentInclude,
      orderBy: { rollNumber: "asc" },
      take: 200
    });
    return { sections: sections.map((section) => this.toSectionOption(section)), students: students.map((student) => this.toStudentOption(student)) };
  }

  async create(user: AuthUser, dto: CreateTeamDto) {
    const section = await this.getSection(dto.sectionId);
    this.assertAllowed(user, PermissionAction.MANAGE_TEAMS, this.sectionToScope(section));
    const memberIds = [...new Set(dto.memberStudentProfileIds)];
    if (memberIds.length !== dto.memberStudentProfileIds.length) throw new BadRequestException("Duplicate team members found.");
    if (dto.leaderStudentProfileId && !memberIds.includes(dto.leaderStudentProfileId)) {
      throw new BadRequestException("Leader must be part of the team members.");
    }
    const students = await this.prisma.studentProfile.findMany({
      where: { id: { in: memberIds }, sectionId: dto.sectionId, currentStatus: UserStatus.ACTIVE },
      select: { id: true }
    });
    if (students.length !== memberIds.length) throw new BadRequestException("Every team member must be active and belong to the selected section.");

    const activeMembership = await this.prisma.studentTeamMember.findFirst({
      where: {
        studentProfileId: { in: memberIds },
        team: { sectionId: dto.sectionId, status: StudentTeamStatus.ACTIVE }
      },
      include: { studentProfile: true, team: true }
    });
    if (activeMembership) throw new ConflictException(`${activeMembership.studentProfile.rollNumber} is already in active team ${activeMembership.team.name}.`);

    try {
      const orderedMemberIds = dto.leaderStudentProfileId
        ? [dto.leaderStudentProfileId, ...memberIds.filter((id) => id !== dto.leaderStudentProfileId)]
        : memberIds;
      const team = await this.prisma.studentTeam.create({
        data: {
          sectionId: dto.sectionId,
          name: dto.name.trim(),
          description: dto.description?.trim(),
          createdById: user.id,
          members: {
            create: orderedMemberIds.map((studentProfileId, index) => ({
              studentProfileId,
              leaderRank: index + 1,
              role:
                dto.leaderStudentProfileId && studentProfileId === dto.leaderStudentProfileId
                  ? StudentTeamMemberRole.LEADER
                  : !dto.leaderStudentProfileId && index === 0
                    ? StudentTeamMemberRole.LEADER
                    : StudentTeamMemberRole.MEMBER
            }))
          }
        },
        include: this.include
      });
      await this.audit(user, "CREATE_STUDENT_TEAM", "StudentTeam", team.id, { sectionId: dto.sectionId, members: memberIds.length });
      return { team: this.toTeamObject(team) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Team name already exists in this section.");
      }
      throw error;
    }
  }

  async archive(user: AuthUser, id: string) {
    const team = await this.prisma.studentTeam.findUnique({ where: { id }, include: this.include });
    if (!team) throw new NotFoundException("Team not found.");
    this.assertAllowed(user, PermissionAction.MANAGE_TEAMS, this.teamToScope(team));
    await this.prisma.studentTeam.update({ where: { id }, data: { status: StudentTeamStatus.ARCHIVED } });
    await this.audit(user, "ARCHIVE_STUDENT_TEAM", "StudentTeam", id);
    return { ok: true };
  }

  private async scopeForQuery(query: TeamQueryDto): Promise<ScopeRef | undefined> {
    if (query.sectionId) return this.sectionToScope(await this.getSection(query.sectionId));
    if (query.studentProfileId) {
      const student = await this.prisma.studentProfile.findUnique({ where: { id: query.studentProfileId }, include: this.studentInclude });
      if (!student) throw new NotFoundException("Student not found.");
      return this.sectionToScope(student.section);
    }
    return undefined;
  }

  private async getSection(sectionId: string) {
    const section = await this.prisma.section.findUnique({ where: { id: sectionId }, include: this.sectionInclude });
    if (!section || section.status !== StructureStatus.ACTIVE) throw new NotFoundException("Section not found or archived.");
    return section;
  }

  private canViewTeam(user: AuthUser, team: Prisma.StudentTeamGetPayload<{ include: TeamsService["include"] }>) {
    return this.permissions.can(user, { action: PermissionAction.VIEW_TEAMS, scope: this.teamToScope(team) }).allowed;
  }

  private teamToScope(team: Prisma.StudentTeamGetPayload<{ include: TeamsService["include"] }>): ScopeRef {
    return this.sectionToScope(team.section);
  }

  private sectionToScope(section: Prisma.SectionGetPayload<{ include: TeamsService["sectionInclude"] }>): ScopeRef {
    return sectionTreeToScope(section);
  }

  private async scopeToSectionWhere(scope: ScopeRef): Promise<Prisma.SectionWhereInput> {
    if (scope.sectionId) return { id: scope.sectionId };
    if (scope.classId) return { classId: scope.classId };
    if (scope.batchId) return { class: { batchId: scope.batchId } };
    if (scope.branchId) return { class: { batch: { branchId: scope.branchId } } };
    if (scope.programId) return { class: { batch: { branch: { programId: scope.programId } } } };
    if (scope.campusId) return this.sharedGroup.sectionWhereForCampusFilter(scope.campusId);
    return { id: "__no_scope__" };
  }

  private toTeamObject(team: Prisma.StudentTeamGetPayload<{ include: TeamsService["include"] }>) {
    return {
      id: team.id,
      name: team.name,
      description: team.description,
      status: team.status,
      section: this.toSectionOption(team.section),
      createdBy: team.createdBy.fullName,
      members: team.members.map((member) => ({
        id: member.id,
        role: member.role,
        leaderRank: member.leaderRank,
        leaderLabel: `L${member.leaderRank}`,
        student: { id: member.studentProfile.id, rollNumber: member.studentProfile.rollNumber, fullName: member.studentProfile.user.fullName }
      }))
    };
  }

  private toSectionOption(section: Prisma.SectionGetPayload<{ include: TeamsService["sectionInclude"] }>) {
    return { id: section.id, name: section.name, classId: section.classId, label: `${section.class.batch.branch.code} Sem ${section.class.semesterNumber} - ${section.name}` };
  }

  private toStudentOption(student: Prisma.StudentProfileGetPayload<{ include: TeamsService["studentInclude"] }>) {
    return { id: student.id, rollNumber: student.rollNumber, fullName: student.user.fullName, sectionId: student.sectionId };
  }

  private assertAllowed(user: AuthUser, action: PermissionAction, scope?: ScopeRef) {
    const decision = this.permissions.can(user, { action, scope });
    if (!decision.allowed) throw new ForbiddenException(decision.reason);
  }

  private audit(user: AuthUser, action: string, entity: string, entityId: string, metadata?: Prisma.InputJsonObject) {
    return this.prisma.auditLog.create({ data: { userId: user.auditUserId, action, entity, entityId, metadata } });
  }

  private readonly sectionInclude = {
    class: { include: { batch: { include: { branch: { include: { program: true } } } } } }
  } satisfies Prisma.SectionInclude;

  private readonly studentInclude = {
    user: true,
    section: { include: { class: { include: { batch: { include: { branch: { include: { program: true } } } } } } } }
  } satisfies Prisma.StudentProfileInclude;

  private readonly include = {
    section: { include: { class: { include: { batch: { include: { branch: { include: { program: true } } } } } } } },
    createdBy: { select: { fullName: true } },
    members: { include: { studentProfile: { include: { user: true } } }, orderBy: [{ leaderRank: "asc" }, { joinedAt: "asc" }] }
  } satisfies Prisma.StudentTeamInclude;
}
