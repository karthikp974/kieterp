export type ResultLine = {
  id: string;
  examType: string;
  subjectCode: string;
  subjectName: string;
  internals: number | null;
  externals: number | null;
  totalMarks: number | null;
  grade: string | null;
  credits: number | null;
  status: "PASS" | "FAIL" | "ABSENT" | "WITHHELD";
  passFail: string;
};

export type SemesterSummary = {
  creditsAttempted: number;
  creditsEarned: number;
  sgpa: number | null;
  weightedMarksAvg: number | null;
  weightedMarksBasis: string;
};

export type MarksSemesterBlock = {
  semesterNumber: number;
  semesterLabel: string;
  summary: SemesterSummary;
  subjects: ResultLine[];
};

export type MarksCumulative = {
  creditsEarned: number;
  cgpa: number | null;
  equivalentPercentage: number | null;
  weightedMarksAvg: number | null;
  weightedMarksBasis: string;
};

export type StudentMarksPageResponse = {
  student: { id: string; fullName: string; rollNumber: string };
  section: {
    id: string;
    name: string;
    code: string;
    classLabel: string;
    currentSemesterNumber: number;
    batchCode: string;
    branchName: string;
    departmentName: string;
    campusName: string;
  };
  ingestion: { pipeline: string; jobName: string; gpaPolicy?: string };
  overview: { totalResultRows: number; semesterCount: number; passed: number; failed: number };
  cumulative: MarksCumulative;
  semesters: MarksSemesterBlock[];
  chart: { semesterLabel: string; semesterNumber: number; sgpa: number | null; cgpa: number | null; subjects: number }[];
};
