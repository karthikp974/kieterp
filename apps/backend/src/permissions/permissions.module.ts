import { Global, Module } from "@nestjs/common";
import { CampusScopeService } from "./campus-scope.service";
import { PermissionGuard } from "./permission.guard";
import { PermissionsService } from "./permissions.service";
import { SharedGroupAcademicService } from "./shared-group-academic.service";

@Global()
@Module({
  providers: [PermissionsService, PermissionGuard, CampusScopeService, SharedGroupAcademicService],
  exports: [PermissionsService, PermissionGuard, CampusScopeService, SharedGroupAcademicService]
})
export class PermissionsModule {}
