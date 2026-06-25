import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  PermissionAction,
  Prisma,
  StudentTeamMemberRole,
  StudentTeamStatus,
  StructureStatus,
  TeacherRoleKind,
  UserStatus,
  UserType
} from "@prisma/client";
import { AuthUser } from "../auth/auth.types";
import { toPagination } from "../common/pagination.dto";
import { PermissionsService } from "../permissions/permissions.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  TeacherTeamCreateDto,
  TeacherTeamMemberRankDto,
  TeacherTeamsListQueryDto,
  TeacherTeamsStudentSearchDto,
  TeacherTeamUpdateMembersDto
} from "./teacher-teams-portal.dto";
import { validateTeamMemberRanks } from "../teams/teams-rank.util";

const TEAMS_PAGE_SIZE = 5;

type SectionTree = Prisma.SectionGetPayload<{
  include: {
    class: { include: { batch: { include: { branch: { include: { program: true } } } } } };
  };
}>;

type TeamWithMembers = Prisma.StudentTeamGetPayload<{
  include: {
    section: {
      include: {
        class: { include: { batch: { include: { branch: { include: { program: true } } } } } };
      };
    };
    members: { include: { studentProfile: { include: { user: { select: { fullName: true } } } } } };
  };
}>;

@Injectable()
export class TeacherPortalTeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService
  ) {}

  async getSetup(user: AuthUser) {
    if (user.type !== UserType.TEACHER) throw new ForbiddenException("Teacher portal only.");
    const teacher = await this.getActiveTeacher(user.id);
    const roles = [...new Set(teacher.assignments.map((a) => a.role))];
    const hasHtpo = roles.includes(TeacherRoleKind.HTPO);
    const hasCtpo = roles.includes(TeacherRoleKind.CTPO);
    const mode = hasHtpo ? "htpo" : hasCtpo ? "ctpo" : "teacher";
    const sections = await this.loadTeamSections(user, teacher);
    const canManage = user.assignments.some((a) =>
      this.permissions.can(user, { action: PermissionAction.MANAGE_TEAMS, scope: a }).allowed
    );

    return {
      mode,
      roles,
      canManage,
      showAllSections: hasHtpo,
      sections,
      fixedSectionId: !hasHtpo && hasCtpo && sections.length === 1 ? sections[0]?.id ?? null : null
    };
  }

  async listTeams(user: AuthUser, query: TeacherTeamsListQueryDto) {
    const teacher = await this.getActiveTeacher(user.id);
    const sections = await this.loadTeamSections(user, teacher);
    if (!sections.length) return { items: [], total: 0, page: 1, pageSize: TEAMS_PAGE_SIZE, sectionCount: 0 };

    const accessibleSectionIds = sections.map((s) => s.id);
    const sectionId = query.sectionId?.trim();
    if (sectionId && !accessibleSectionIds.includes(sectionId)) {
      throw new ForbiddenException("You cannot view teams for this section.");
    }

    const pagination = toPagination({ ...query, pageSize: query.pageSize ?? TEAMS_PAGE_SIZE });
    const where: Prisma.StudentTeamWhereInput = {
      status: StudentTeamStatus.ACTIVE,
      sectionId: sectionId ? sectionId : { in: accessibleSectionIds }
    };

    const [teams, total] = await Promise.all([
      this.prisma.studentTeam.findMany({
        where,
        include: this.teamInclude,
        orderBy: [{ createdAt: "desc" }],
        skip: pagination.skip,
        take: pagination.take
      }),
      this.prisma.studentTeam.count({ where })
    ]);

    const visible = teams.filter((team) => this.canViewTeam(user, team));
    const sectionCount = sectionId ? 1 : new Set(visible.map((t) => t.sectionId)).size;

    return {
      items: visible.map((team) => this.toTeamCard(team)),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
      sectionCount
    };
  }

  async getTeam(user: AuthUser, teamId: string) {
    const team = await this.loadTeam(teamId);
    this.assertTeamAccess(user, team, PermissionAction.VIEW_TEAMS);
    return { team: this.toTeamCard(team) };
  }

  async searchStudents(user: AuthUser, sectionId: string, query: TeacherTeamsStudentSearchDto) {
    const section = await this.loadSection(sectionId);
    this.assertSectionAccess(user, section, PermissionAction.MANAGE_TEAMS);

    const search = query.search?.trim();
    const busyIds = await this.activeMemberIdsInSection(section.id, query.excludeTeamId);

    const students = await this.prisma.studentProfile.findMany({
      where: {
        sectionId: section.id,
        isArchived: false,
        currentStatus: UserStatus.ACTIVE,
        ...(busyIds.length ? { id: { notIn: busyIds } } : {}),
        ...(search
          ? {
              OR: [
                { rollNumber: { contains: search, mode: "insensitive" } },
                { user: { fullName: { contains: search, mode: "insensitive" } } }
              ]
            }
          : {})
      },
      include: { user: { select: { fullName: true } } },
      orderBy: [{ rollNumber: "asc" }],
      take: 30
    });

    return {
      students: students.map((student) => ({
        id: student.id,
        rollNumber: student.rollNumber,
        fullName: student.user.fullName,
        label: `${student.rollNumber} — ${student.user.fullName}`
      }))
    };
  }

  async createTeam(user: AuthUser, dto: TeacherTeamCreateDto) {
    const section = await this.loadSection(dto.sectionId);
    this.assertSectionAccess(user, section, PermissionAction.MANAGE_TEAMS);
    this.validateMemberRanks(dto.members);

    await this.assertMembersAvailable(dto.sectionId, dto.members.map((m) => m.studentProfileId));

    const memberIds = dto.members.map((m) => m.studentProfileId);

    const students = await this.prisma.studentProfile.findMany({
      where: { id: { in: memberIds }, sectionId: dto.sectionId, currentStatus: UserStatus.ACTIVE, isArchived: false },
      select: { id: true }
    });
    if (students.length !== memberIds.length) {
      throw new BadRequestException("Every team member must be active and belong to the selected section.");
    }

    try {
      const team = await this.prisma.studentTeam.create({
        data: {
          sectionId: dto.sectionId,
          name: dto.name.trim(),
          createdById: user.id,
          members: {
            create: dto.members.map((member) => ({
              studentProfileId: member.studentProfileId,
              leaderRank: member.leaderRank,
              role: member.leaderRank === 1 ? StudentTeamMemberRole.LEADER : StudentTeamMemberRole.MEMBER
            }))
          }
        },
        include: this.teamInclude
      });
      await this.audit(user, "CREATE_STUDENT_TEAM", team.id, { sectionId: dto.sectionId, members: memberIds.length });
      return { team: this.toTeamCard(team) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Team name already exists in this section.");
      }
      throw error;
    }
  }

  async updateMembers(user: AuthUser, teamId: string, dto: TeacherTeamUpdateMembersDto) {
    const team = await this.loadTeam(teamId);
    this.assertTeamAccess(user, team, PermissionAction.MANAGE_TEAMS);
    this.validateMemberRanks(dto.members);

    await this.assertMembersAvailable(team.sectionId, dto.members.map((m) => m.studentProfileId), teamId);

    const memberIds = dto.members.map((m) => m.studentProfileId);

    const students = await this.prisma.studentProfile.findMany({
      where: {
        id: { in: memberIds },
        sectionId: team.sectionId,
        currentStatus: UserStatus.ACTIVE,
        isArchived: false
      },
      select: { id: true }
    });
    if (students.length !== memberIds.length) {
      throw new BadRequestException("Every team member must be active and belong to this section.");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.studentTeamMember.deleteMany({ where: { teamId } });
      return tx.studentTeam.update({
        where: { id: teamId },
        data: {
          members: {
            create: dto.members.map((member) => ({
              studentProfileId: member.studentProfileId,
              leaderRank: member.leaderRank,
              role: member.leaderRank === 1 ? StudentTeamMemberRole.LEADER : StudentTeamMemberRole.MEMBER
            }))
          }
        },
        include: this.teamInclude
      });
    });

    await this.audit(user, "UPDATE_STUDENT_TEAM_MEMBERS", teamId, { members: memberIds.length });
    return { team: this.toTeamCard(updated) };
  }

  async archiveTeam(user: AuthUser, teamId: string) {
    const team = await this.loadTeam(teamId);
    this.assertTeamAccess(user, team, PermissionAction.MANAGE_TEAMS);
    await this.prisma.studentTeam.update({ where: { id: teamId }, data: { status: StudentTeamStatus.ARCHIVED } });
    await this.audit(user, "ARCHIVE_STUDENT_TEAM", teamId);
    return { ok: true };
  }

  private validateMemberRanks(members: TeacherTeamMemberRankDto[]) {
    validateTeamMemberRanks(members);
  }

  private async assertMembersAvailable(sectionId: string, memberIds: string[], excludeTeamId?: string) {
    const activeMembership = await this.prisma.studentTeamMember.findFirst({
      where: {
        studentProfileId: { in: memberIds },
        team: {
          sectionId,
          status: StudentTeamStatus.ACTIVE,
          ...(excludeTeamId ? { id: { not: excludeTeamId } } : {})
        }
      },
      include: { studentProfile: true, team: true }
    });
    if (activeMembership) {
      throw new ConflictException(
        `${activeMembership.studentProfile.rollNumber} is already in active team ${activeMembership.team.name}.`
      );
    }
  }

  private async activeMemberIdsInSection(sectionId: string, excludeTeamId?: string) {
    const rows = await this.prisma.studentTeamMember.findMany({
      where: {
        team: {
          sectionId,
          status: StudentTeamStatus.ACTIVE,
          ...(excludeTeamId ? { id: { not: excludeTeamId } } : {})
        }
      },
      select: { studentProfileId: true }
    });
    return rows.map((row) => row.studentProfileId);
  }

  private async loadTeamSections(user: AuthUser, teacher: Awaited<ReturnType<typeof this.getActiveTeacher>>) {
    const sectionMap = new Map<string, { id: string; label: string }>();
    const hasHtpo = teacher.assignments.some((a) => a.role === TeacherRoleKind.HTPO);

    if (hasHtpo) {
      const sections = await this.prisma.section.findMany({
        where: this.sectionsWhereForHtpo(teacher.assignments.filter((a) => a.role === TeacherRoleKind.HTPO)),
        include: this.sectionInclude,
        orderBy: [{ class: { semesterNumber: "desc" } }, { name: "asc" }]
      });
      for (const section of sections) {
        if (this.permissions.can(user, { action: PermissionAction.VIEW_TEAMS, scope: this.sectionToScope(section) }).allowed) {
          sectionMap.set(section.id, { id: section.id, label: this.sectionLabel(section) });
        }
      }
    }

    const ctpoSectionIds = [
      ...new Set(
        teacher.assignments.filter((a) => a.role === TeacherRoleKind.CTPO && a.sectionId).map((a) => a.sectionId!)
      )
    ];
    if (ctpoSectionIds.length) {
      const sections = await this.prisma.section.findMany({
        where: { id: { in: ctpoSectionIds }, isArchived: false, status: StructureStatus.ACTIVE },
        include: this.sectionInclude,
        orderBy: [{ class: { semesterNumber: "desc" } }, { name: "asc" }]
      });
      for (const section of sections) {
        if (this.permissions.can(user, { action: PermissionAction.VIEW_TEAMS, scope: this.sectionToScope(section) }).allowed) {
          sectionMap.set(section.id, { id: section.id, label: this.sectionLabel(section) });
        }
      }
    }

    if (!hasHtpo && ctpoSectionIds.length) {
      for (const key of [...sectionMap.keys()]) {
        if (!ctpoSectionIds.includes(key)) sectionMap.delete(key);
      }
    }

    return [...sectionMap.values()].sort((a, b) => a.label.localeCompare(b.label));
  }

  private sectionsWhereForHtpo(
    assignments: { campusId: string | null; programId: string | null; branchId: string | null }[]
  ): Prisma.SectionWhereInput {
    const OR = assignments.map((a) => ({
      status: StructureStatus.ACTIVE,
      isArchived: false,
      ...(a.campusId ? { campusId: a.campusId } : {}),
      class: {
        status: StructureStatus.ACTIVE,
        isArchived: false,
        batch: {
          status: StructureStatus.ACTIVE,
          branch: {
            status: StructureStatus.ACTIVE,
            isArchived: false,
            ...(a.branchId ? { id: a.branchId } : {}),
            ...(a.programId ? { programId: a.programId } : {})
          }
        }
      }
    }));
    return OR.length ? { OR } : { id: "__none__" };
  }

  private async getActiveTeacher(userId: string) {
    const teacher = await this.prisma.teacherProfile.findUnique({
      where: { userId },
      include: {
        assignments: {
          where: { isActive: true },
          select: { role: true, campusId: true, programId: true, branchId: true, sectionId: true }
        }
      }
    });
    if (!teacher || teacher.isArchived) throw new NotFoundException("Teacher profile not found.");
    return teacher;
  }

  private async loadSection(sectionId: string): Promise<SectionTree> {
    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, isArchived: false, status: StructureStatus.ACTIVE },
      include: this.sectionInclude
    });
    if (!section) throw new NotFoundException("Section not found.");
    return section;
  }

  private async loadTeam(teamId: string): Promise<TeamWithMembers> {
    const team = await this.prisma.studentTeam.findFirst({
      where: { id: teamId, status: StudentTeamStatus.ACTIVE },
      include: this.teamInclude
    });
    if (!team) throw new NotFoundException("Team not found.");
    return team;
  }

  private canViewTeam(user: AuthUser, team: TeamWithMembers) {
    return this.permissions.can(user, { action: PermissionAction.VIEW_TEAMS, scope: this.sectionToScope(team.section) }).allowed;
  }

  private assertSectionAccess(user: AuthUser, section: SectionTree, action: PermissionAction) {
    const allowed = this.permissions.can(user, { action, scope: this.sectionToScope(section) }).allowed;
    if (!allowed) throw new ForbiddenException("You cannot manage teams for this section.");
  }

  private assertTeamAccess(user: AuthUser, team: TeamWithMembers, action: PermissionAction) {
    const allowed = this.permissions.can(user, { action, scope: this.sectionToScope(team.section) }).allowed;
    if (!allowed) throw new ForbiddenException("You cannot access this team.");
  }

  private sectionLabel(section: SectionTree) {
    const program = section.class.batch.branch.program;
    const programShort = program.name.replace(/^B\.?Tech\s*/i, "B.Tech ");
    return `${programShort} · Sem ${section.class.semesterNumber} · ${section.name}`;
  }

  private memberInitials(fullName: string) {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
  }

  private toTeamCard(team: TeamWithMembers) {
    const members = [...team.members].sort((a, b) => a.leaderRank - b.leaderRank);
    const sectionLabel = this.sectionLabel(team.section);
    return {
      id: team.id,
      name: team.name,
      section: { id: team.section.id, label: sectionLabel },
      metaLabel: `${sectionLabel} · ${members.length} member${members.length === 1 ? "" : "s"}`,
      members: members.map((member) => ({
        id: member.id,
        studentProfileId: member.studentProfileId,
        fullName: member.studentProfile.user.fullName,
        initials: this.memberInitials(member.studentProfile.user.fullName),
        leaderRank: member.leaderRank,
        leaderLabel: `L${member.leaderRank}`
      }))
    };
  }

  private sectionToScope(section: SectionTree) {
    return {
      campusId: section.campusId,
      programId: section.class.batch.branch.programId,
      branchId: section.class.batch.branchId,
      batchId: section.class.batchId,
      classId: section.classId,
      sectionId: section.id
    };
  }

  private audit(user: AuthUser, action: string, entityId: string, metadata?: Prisma.InputJsonObject) {
    return this.prisma.auditLog.create({
      data: { userId: user.auditUserId, action, entity: "StudentTeam", entityId, metadata }
    });
  }

  private readonly sectionInclude = {
    class: { include: { batch: { include: { branch: { include: { program: true } } } } } }
  } satisfies Prisma.SectionInclude;

  private readonly teamInclude = {
    section: { include: this.sectionInclude },
    members: {
      include: { studentProfile: { include: { user: { select: { fullName: true } } } } },
      orderBy: { leaderRank: "asc" }
    }
  } satisfies Prisma.StudentTeamInclude;
}