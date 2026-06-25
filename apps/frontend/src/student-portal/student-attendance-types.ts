export type StudentAttendanceStat = {
  total: number;
  present: number;
  absent: number;
  percentage: number | null;
};

export type StudentAttendanceMonthStat = StudentAttendanceStat & { monthLabel: string };

export type StudentAttendanceSemesterStat = StudentAttendanceStat & {
  semesterNumber: number;
  classLabel: string;
  label: string;
};

export type StudentAttendanceTrendPoint = {
  monthLabel: string;
  total: number;
  present: number;
  absent: number;
  percentage: number | null;
};

export type StudentAttendanceSemesterBreakdownRow = {
  semesterNumber: number;
  classLabel: string;
  total: number;
  present: number;
  absent: number;
  percentage: number | null;
};

export type StudentAttendanceChartEntry = {
  date: string;
  status: "PRESENT" | "ABSENT";
  semesterNumber: number;
};

export type StudentAttendanceHistoryItem = {
  id: string;
  date: string;
  status: "PRESENT" | "ABSENT";
  facultyName: string;
  semesterNumber: number;
  classLabel: string;
};

export type StudentAttendancePageResponse = {
  student: { id: string; fullName: string; rollNumber: string };
  section: {
    id: string;
    name: string;
    code: string;
    classLabel: string;
    semesterNumber: number;
    batchCode: string;
    branchName: string;
    departmentName: string;
    campusName: string;
  };
  thisMonth: StudentAttendanceMonthStat;
  overall: StudentAttendanceStat & { label: string };
  semester: StudentAttendanceSemesterStat;
  semesterBreakdown: StudentAttendanceSemesterBreakdownRow[];
  monthlyTrend: StudentAttendanceTrendPoint[];
  chartEntries: StudentAttendanceChartEntry[];
  history: {
    total: number;
    page: number;
    pageSize: number;
    items: StudentAttendanceHistoryItem[];
  };
};
