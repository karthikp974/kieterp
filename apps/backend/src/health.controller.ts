import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

/** GET /api — avoids confusing 404 when someone opens the API root in a browser. */
@SkipThrottle()
@Controller()
export class ApiRootController {
  @Get()
  root() {
    return {
      ok: true,
      service: "college-erp-api",
      message: "API is running. Open the ERP in your browser on port 5173 (not 4000).",
      health: "/api/health",
      login: "/api/auth/login"
    };
  }
}

/** Public liveness probe for smoke checks and load balancers. */
@SkipThrottle()
@Controller("health")
export class HealthController {
  @Get()
  check() {
    return { ok: true, service: "college-erp-api" };
  }
}
