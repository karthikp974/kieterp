export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export type CampusGroup = {
  id: string;
  name: string;
  isolationPolicy: "SHARED" | "ISOLATED";
};

export type Campus = {
  id: string;
  code: string;
  name: string;
  groupId: string;
  status?: "ACTIVE" | "ARCHIVED";
  group?: CampusGroup;
};

export type Program = {
  id: string;
  campusId: string;
  code: string;
  name: string;
  durationValue: number;
  semesters: number;
  structureScope?: "CAMPUS_OWNED" | "GROUP_SHARED";
  status?: "ACTIVE" | "ARCHIVED";
  campus?: Campus;
};

export type Branch = {
  id: string;
  programId: string;
  code: string;
  name: string;
  durationYears?: number;
  status?: "ACTIVE" | "ARCHIVED";
  program?: Program;
};

export type Batch = {
  id: string;
  branchId: string;
  startYear: number;
  endYear: number;
  status?: "ACTIVE" | "ARCHIVED";
  branch?: Branch;
};

export type AcademicClass = {
  id: string;
  batchId: string;
  yearNumber: number;
  semesterNumber: number;
  label: string;
  status?: "ACTIVE" | "ARCHIVED";
  batch?: Batch;
};

export type Section = {
  id: string;
  classId: string;
  name: string;
  capacity?: number | null;
  status?: "ACTIVE" | "ARCHIVED";
  class?: AcademicClass;
};

export type Subject = {
  id: string;
  branchId: string;
  code: string;
  name: string;
  semesterNumber: number;
  status?: "ACTIVE" | "ARCHIVED";
  branch?: Branch;
};
