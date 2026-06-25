import { ForbiddenException, Injectable } from "@nestjs/common";
import { PermissionAction, UserType } from "@prisma/client";
import { AuthUser } from "../auth/auth.types";
import { PermissionsService } from "../permissions/permissions.service";
import { PrismaService } from "../prisma/prisma.service";
import { TeacherEngageScopeQueryDto } from "./teacher-portal-engage.dto";
import {
  getActiveTeacherProfile,
  loadTeacherAssignedSections,
  resolveTeacherEngageContext,
  type TeacherEngageContext
} from "./teacher-portal-section-scope.util";

@Injectable()
export class TeacherPortalEngageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService
  ) {}

  async getSetup(user: AuthUser) {
    if (user.type !== UserType.TEACHER) throw new ForbiddenException("Teacher portal only.");
    const canViewFeedback = this.permissions.can(user, { action: PermissionAction.VIEW_FEEDBACK_ANALYTICS }).allowed;
    const canViewAnnouncements = this.permissions.can(user, { action: PermissionAction.VIEW_ANNOUNCEMENTS }).allowed;
    if (!canViewFeedback && !canViewAnnouncements) {
      throw new ForbiddenException("Feedback and announcements are not available for this role.");
    }

    const teacher = await getActiveTeacherProfile(this.prisma, user.id);
    const permissionAction = canViewFeedback
      ? PermissionAction.VIEW_FEEDBACK_ANALYTICS
      : PermissionAction.VIEW_ANNOUNCEMENTS;
    const sections = await loadTeacherAssignedSections(this.prisma, this.permissions, user, teacher, permissionAction);
    const ctx = resolveTeacherEngageContext(user, this.permissions, teacher, sections);

    return {
      mode: ctx.mode,
      roles: ctx.roles,
      showSectionFilter: ctx.showSectionFilter,
      canManageFeedback: ctx.canManageFeedback,
      canManageAnnouncements: ctx.canManageAnnouncements,
      sections: ctx.sections,
      fixedSectionId: ctx.fixedSectionId
    };
  }

  async resolveContext(user: AuthUser, query: TeacherEngageScopeQueryDto, action: PermissionAction): Promise<TeacherEngageContext> {
    if (user.type !== UserType.TEACHER) throw new ForbiddenException("Teacher portal only.");
    if (!this.permissions.can(user, { action }).allowed) {
      throw new ForbiddenException("You do not have access to this module.");
    }
    const teacher = await getActiveTeacherProfile(this.prisma, user.id);
    const sections = await loadTeacherAssignedSections(this.prisma, this.permissions, user, teacher, action);
    return resolveTeacherEngageContext(user, this.permissions, teacher, sections, query.sectionId);
  }
}
