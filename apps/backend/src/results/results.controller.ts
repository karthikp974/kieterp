import { Body, Controller, Get, Param, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { PermissionAction } from "@prisma/client";
import { Response } from "express";
import { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionGuard } from "../permissions/permission.guard";
import { RequiresPermission } from "../permissions/requires-permission.decorator";
import { ResultPdfImportDto, ResultsExportQueryDto, ResultsQueryDto, UpsertResultEntryDto } from "./results.dto";
import { ResultsService } from "./results.service";

type UploadedResultFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("results")
export class ResultsController {
  constructor(private readonly results: ResultsService) {}

  @Get()
  @RequiresPermission(PermissionAction.VIEW_RESULTS)
  list(@CurrentUser() user: AuthUser, @Query() query: ResultsQueryDto) {
    return this.results.list(user, query);
  }

  @Get("me")
  @RequiresPermission(PermissionAction.VIEW_RESULTS)
  myResults(@CurrentUser() user: AuthUser) {
    return this.results.myResults(user);
  }

  @Get("options")
  @RequiresPermission(PermissionAction.VIEW_RESULTS)
  options(@CurrentUser() user: AuthUser) {
    return this.results.options(user);
  }

  @Get("export")
  @RequiresPermission(PermissionAction.VIEW_RESULTS)
  export(@CurrentUser() user: AuthUser, @Query() query: ResultsExportQueryDto, @Res() response: Response) {
    return this.results.export(user, query, response);
  }

  @Get("imports")
  @RequiresPermission(PermissionAction.UPLOAD_RESULTS)
  importJobs(@CurrentUser() user: AuthUser, @Query() query: ResultsQueryDto) {
    return this.results.importJobs(user, query);
  }

  @Get("student/:studentProfileId")
  @RequiresPermission(PermissionAction.VIEW_RESULTS)
  studentResults(@CurrentUser() user: AuthUser, @Param("studentProfileId") studentProfileId: string) {
    return this.results.studentResults(user, studentProfileId);
  }

  @Post()
  @RequiresPermission(PermissionAction.UPLOAD_RESULTS)
  upsert(@CurrentUser() user: AuthUser, @Body() dto: UpsertResultEntryDto) {
    return this.results.upsert(user, dto);
  }

  @Post("import/pdf")
  @RequiresPermission(PermissionAction.UPLOAD_RESULTS)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 }
    })
  )
  importPdf(@CurrentUser() user: AuthUser, @UploadedFile() file: UploadedResultFile | undefined, @Body() dto: ResultPdfImportDto) {
    return this.results.importPdf(user, file, dto);
  }
}
