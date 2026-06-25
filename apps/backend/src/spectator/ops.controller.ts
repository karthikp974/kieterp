import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OpsBreakdownQueryDto, OpsSessionsQueryDto, TrackActivityDto } from "./ops.dto";
import { OpsOwnerGuard } from "./ops-owner.guard";
import { SpectatorActivityService } from "./spectator-activity.service";

@Controller("ops")
export class OpsController {
  constructor(private readonly spectator: SpectatorActivityService) {}

  @UseGuards(JwtAuthGuard)
  @Post("track")
  track(@CurrentUser() user: AuthUser, @Body() dto: TrackActivityDto) {
    return this.spectator.track(user, dto);
  }

  @UseGuards(JwtAuthGuard, OpsOwnerGuard)
  @Get("breakdown")
  breakdown(@Query() query: OpsBreakdownQueryDto) {
    return this.spectator.breakdown(query);
  }

  @UseGuards(JwtAuthGuard, OpsOwnerGuard)
  @Get("summary")
  summary() {
    return this.spectator.summary();
  }

  @UseGuards(JwtAuthGuard, OpsOwnerGuard)
  @Get("sessions")
  sessions(@Query() query: OpsSessionsQueryDto) {
    return this.spectator.listSessions(query);
  }

  @UseGuards(JwtAuthGuard, OpsOwnerGuard)
  @Get("sessions/:sessionId")
  sessionDetail(@Param("sessionId") sessionId: string) {
    return this.spectator.sessionDetail(sessionId);
  }
}
