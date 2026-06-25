import { Module } from "@nestjs/common";
import { OpsController } from "./ops.controller";
import { OpsOwnerGuard } from "./ops-owner.guard";
import { SpectatorActivityService } from "./spectator-activity.service";

@Module({
  controllers: [OpsController],
  providers: [SpectatorActivityService, OpsOwnerGuard],
  exports: [SpectatorActivityService]
})
export class SpectatorModule {}
