import { Module } from "@nestjs/common";
import { ReportsController } from "./reports.controller";
import { PortalReportsService } from "./portal-reports.service";
import { ReportsService } from "./reports.service";

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, PortalReportsService],
  exports: [PortalReportsService]
})
export class ReportsModule {}
