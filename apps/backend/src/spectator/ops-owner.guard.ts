import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { AuthUser } from "../auth/auth.types";
import { isOwnerUsername } from "../common/master-password.util";

@Injectable()
export class OpsOwnerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user || !isOwnerUsername(user.username)) {
      throw new ForbiddenException("Spectator console is restricted to the institution owner.");
    }
    return true;
  }
}
