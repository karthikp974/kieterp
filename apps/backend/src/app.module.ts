import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AnnouncementsModule } from "./announcements/announcements.module";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuditContextInterceptor } from "./common/audit-context.interceptor";
import { CacheModule } from "./cache/cache.module";
import { AuditLogPatchService } from "./common/audit-log-patch.service";
import { ApplicationsModule } from "./applications/applications.module";
import { AuditModule } from "./audit/audit.module";
import { AttendanceModule } from "./attendance/attendance.module";
import { AuthModule } from "./auth/auth.module";
import { BatchesModule } from "./batches/batches.module";
import { ClassesSectionsModule } from "./classes-sections/classes-sections.module";
import { CoreModule } from "./core/core.module";
import { DatabaseBrowserModule } from "./database-browser/database-browser.module";
import { DepartmentBranchModule } from "./department-branch/department-branch.module";
import { FeedbackModule } from "./feedback/feedback.module";
import { FinanceModule } from "./finance/finance.module";
import { PermissionsModule } from "./permissions/permissions.module";
import { PortalsModule } from "./portals/portals.module";
import { PrismaModule } from "./prisma/prisma.module";
import { PromotionsModule } from "./promotions/promotions.module";
import { QueuesModule } from "./queues/queues.module";
import { ReportsModule } from "./reports/reports.module";
import { ResultsModule } from "./results/results.module";
import { StudentsModule } from "./students/students.module";
import { SubjectsModule } from "./subjects/subjects.module";
import { SyllabusModule } from "./syllabus/syllabus.module";
import { TeamsModule } from "./teams/teams.module";
import { TeachersModule } from "./teachers/teachers.module";
import { SpectatorModule } from "./spectator/spectator.module";
import { TimetableModule } from "./timetable/timetable.module";
import { HealthController, ApiRootController } from "./health.controller";

@Module({
  controllers: [ApiRootController, HealthController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [".env", "../../.env"] }),
    // Global rate limit: 100 requests/min/IP. Auth routes override this with
    // tighter limits via @Throttle. In-memory store = per-instance; switch to a
    // Redis throttler store if you run multiple instances and need shared counts.
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 100 }]),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>("REDIS_HOST") ?? "localhost",
          port: config.get<number>("REDIS_PORT") ?? 6379
        }
      })
    }),
    PrismaModule,
    CacheModule,
    PermissionsModule,
    AnnouncementsModule,
    ApplicationsModule,
    AuditModule,
    AttendanceModule,
    FinanceModule,
    FeedbackModule,
    AuthModule,
    BatchesModule,
    ClassesSectionsModule,
    CoreModule,
    DatabaseBrowserModule,
    DepartmentBranchModule,
    TeachersModule,
    TeamsModule,
    StudentsModule,
    SubjectsModule,
    SyllabusModule,
    TimetableModule,
    PromotionsModule,
    ReportsModule,
    ResultsModule,
    PortalsModule,
    QueuesModule,
    SpectatorModule
  ],
  providers: [
    AuditLogPatchService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditContextInterceptor }
  ]
})
export class AppModule {}
