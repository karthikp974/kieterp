import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { AuthUser } from "../auth/auth.types";
import { auditContextStorage } from "./audit-context";

@Injectable()
export class AuditContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    if (context.getType() === "http") {
      const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
      if (user) {
        auditContextStorage.enterWith({ auditUserId: user.auditUserId ?? user.id });
      }
    }
    return next.handle();
  }
}
