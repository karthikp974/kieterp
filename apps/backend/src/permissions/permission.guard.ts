import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthUser, ScopeRef } from "../auth/auth.types";
import { PermissionsService } from "./permissions.service";
import { REQUIRED_PERMISSION_KEY, RequiredPermissionMetadata } from "./requires-permission.decorator";
import { hasScopeBoundary, pickScopeRef } from "./scope.util";

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const metadata = this.reflector.getAllAndOverride<RequiredPermissionMetadata>(REQUIRED_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (!metadata) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user: AuthUser;
      query: ScopeRef;
      body: ScopeRef & { scope?: ScopeRef };
    }>();
    this.applyImplicitCampusScope(request);

    const scope = metadata.skipRequestScope ? undefined : this.resolveRequestScope(request);
    const decision = this.permissions.can(request.user, {
      action: metadata.action,
      scope
    });

    if (!decision.allowed) {
      throw new ForbiddenException(decision.reason);
    }

    return true;
  }

  private applyImplicitCampusScope(request: { user: AuthUser; query: ScopeRef }) {
    if (!request.query) {
      request.query = {};
    }
    if (request.user.campusId && !request.query.campusId) {
      request.query.campusId = request.user.campusId;
    }
    if (request.user.campusGroupId && !request.query.campusGroupId) {
      request.query.campusGroupId = request.user.campusGroupId;
    }
  }

  private resolveRequestScope(request: { query: ScopeRef; body: ScopeRef & { scope?: ScopeRef } }): ScopeRef | undefined {
    const explicitScope = pickScopeRef(request.body?.scope);
    if (hasScopeBoundary(explicitScope)) return explicitScope;

    const bodyScope = pickScopeRef(request.body);
    if (hasScopeBoundary(bodyScope)) return bodyScope;

    const queryScope = pickScopeRef(request.query);
    if (hasScopeBoundary(queryScope)) return queryScope;

    return undefined;
  }
}
