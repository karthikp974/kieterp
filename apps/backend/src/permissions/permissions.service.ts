import { Injectable } from "@nestjs/common";
import { PermissionAction, UserType } from "@prisma/client";
import { DEFAULT_TEACHER_ROLE_ACTIONS } from "./teacher-portal-modules";
import { PermissionDecision, PermissionRequest, PermissionSubject } from "./permission.types";
import { hasScopeBoundary, scopeContains } from "./scope.util";

@Injectable()
export class PermissionsService {
  can(user: PermissionSubject, request: PermissionRequest): PermissionDecision {
    if (user.type === UserType.ADMIN) {
      if (!this.campusBoundaryMatches(user, request)) {
        return { allowed: false, reason: "Campus boundary mismatch." };
      }
      return { allowed: true, reason: "Admin has full ERP control." };
    }

    if (user.type === UserType.STUDENT) {
      return this.canStudent(user, request);
    }

    if (user.type === UserType.TEACHER) {
      return this.canTeacher(user, request);
    }

    return { allowed: false, reason: "Unknown user type." };
  }

  private canStudent(user: PermissionSubject, request: PermissionRequest): PermissionDecision {
    if (
      !new Set<PermissionAction>([
        PermissionAction.VIEW_STUDENT_PORTAL,
        PermissionAction.VIEW_APPLICATIONS,
        PermissionAction.VIEW_ANNOUNCEMENTS,
        PermissionAction.VIEW_TEAMS,
        PermissionAction.SUBMIT_FEEDBACK
      ]).has(request.action)
    ) {
      return { allowed: false, reason: "Students can only access their own allowed student portal data." };
    }

    if (!this.campusBoundaryMatches(user, request)) {
      return { allowed: false, reason: "Campus boundary mismatch." };
    }

    return { allowed: true, reason: "Student can access own portal." };
  }

  private canTeacher(user: PermissionSubject, request: PermissionRequest): PermissionDecision {
    if (!this.campusBoundaryMatches(user, request)) {
      return { allowed: false, reason: "Campus boundary mismatch." };
    }

    for (const assignment of user.assignments) {
      const defaults = DEFAULT_TEACHER_ROLE_ACTIONS[assignment.role];
      const explicit = assignment.permissions as PermissionAction[];
      const allowedActions = new Set([...defaults, ...explicit]);

      if (!allowedActions.has(request.action)) {
        continue;
      }

      if (!hasScopeBoundary(request.scope ?? {}) || scopeContains(assignment, request.scope)) {
        return { allowed: true, reason: `${assignment.role} assignment allows this action in scope.` };
      }
    }

    return { allowed: false, reason: "No active teacher assignment allows this action in the requested scope." };
  }

  private campusBoundaryMatches(user: PermissionSubject, request: PermissionRequest): boolean {
    const scope = request.scope;
    if (!scope) {
      return true;
    }

    if (scope.campusGroupId && user.campusGroupId && scope.campusGroupId !== user.campusGroupId) {
      return false;
    }

    if (scope.campusId && user.campusId && scope.campusId !== user.campusId) {
      // KIET + KIEK share one academic group — operational campus labels may differ.
      if (user.campusGroupId && scope.campusGroupId && user.campusGroupId === scope.campusGroupId) {
        return true;
      }
      return false;
    }

    // Group-scoped admin/teacher without a campus label can access either KIET or KIEK operational scope.
    if (scope.campusId && user.campusGroupId && !user.campusId && scope.campusGroupId && user.campusGroupId === scope.campusGroupId) {
      return true;
    }

    // Scoped to a campus group but request only sets campusId — validated async in CampusScopeService.
    if (scope.campusId && user.campusGroupId && !user.campusId && !scope.campusGroupId) {
      return false;
    }

    return true;
  }
}
