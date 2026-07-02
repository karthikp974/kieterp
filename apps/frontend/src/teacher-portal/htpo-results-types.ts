export type HtpoResultsSetup = {
  mode: "htpo" | "ctpo" | "teacher";
  roles: string[];
  canUpload: boolean;
  sections: { id: string; label: string }[];
  fixedSectionId: string | null;
};

export type HtpoResultsViewRow = {
  studentProfileId: string;
  rollNumber: string;
  fullName: string;
  subjectCode: string | null;
  subjectName: string | null;
  internals: number | null;
  grade: string | null;
  credits: number | null;
  sgpa: number | null;
  cgpa: number | null;
};

export type HtpoResultsImportJob = {
  job: {
    id: string;
    status: string;
    error: string | null;
    createdAt: string;
    result?: {
      parsed?: number;
      imported?: number;
      skipped?: number;
      errors?: string[];
    } | null;
  };
  sectionReports: {
    sectionId: string;
    sectionLabel: string;
    studentCount: number;
    importedCount: number;
    missingFromPdf: { rollNumber: string; fullName: string }[];
  }[];
  missingRollNumbersFromPdf: string[];
  autoPublished: boolean;
  publishedCount: number;
};

export type HtpoResultSubjectRow = {
  subjectCode: string;
  subjectName: string;
  internals: number | null;
  grade: string | null;
  credits: number | null;
};
