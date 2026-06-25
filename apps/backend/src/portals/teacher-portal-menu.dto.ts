import type { TeacherPortalModuleKey } from "../permissions/teacher-portal-modules";

export type TeacherPortalMenuItemDto = {
  key: TeacherPortalModuleKey;
  label: string;
  path: string;
};

export type TeacherPortalMenuDto = {
  modules: TeacherPortalMenuItemDto[];
  roles: string[];
};
