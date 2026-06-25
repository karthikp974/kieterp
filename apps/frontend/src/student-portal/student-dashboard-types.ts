export type StudentDashboardResponse = {
  student: { id: string; fullName: string; rollNumber: string };
  section: {
    id: string;
    name: string;
    code: string | null;
    classLabel: string;
    semesterNumber: number;
    batchCode: string;
    branchName: string;
    departmentName: string;
    campusName: string;
  };
  attendance: {
    thisMonthPercentage: number | null;
    semesterPercentage: number | null;
    thisMonthRecorded: number;
    semesterRecorded: number;
  };
  fees: { outstandingRupees: number; currency: "INR" };
  todayClasses: {
    id: string;
    startTime: string;
    endTime: string;
    room: string | null;
    subjectName: string;
    teacherName: string | null;
  }[];
  announcements: {
    id: string;
    title: string;
    bodyPreview: string;
    priority: string;
    pinned: boolean;
    publishedAt: string | null;
    createdBy: string;
  }[];
};

export type AttendanceSummaryResponse = {
  semester: { percentage: number | null; recordedSessions: number; presentCount: number };
  thisMonth: { percentage: number | null; recordedSessions: number; presentCount: number; monthLabel: string };
  history: { id: string; date: string; status: string }[];
};

export type FeeSummaryResponse = {
  currency: "INR";
  totalOutstandingRupees: number;
  assignments: {
    assignmentId: string;
    feeHeadName: string;
    dueRupees: number;
    paidRupees: number;
    balanceRupees: number;
    paymentStatus: string;
    dueDate: string | null;
  }[];
};
