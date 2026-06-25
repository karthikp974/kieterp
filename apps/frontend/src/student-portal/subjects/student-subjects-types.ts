export type StudentMySubjectCard = {
  id: string;
  code: string;
  name: string;
  semesterNumber: number;
  teacherName: string | null;
  progressPercent: number;
  completedUnits: number;
  totalUnits: number;
  completedTopics: number;
  totalTopics: number;
  hasSyllabus: boolean;
};

export type StudentMySubjectsResponse = {
  section: {
    id: string;
    name: string;
    code: string | null;
    semesterNumber: number;
    selectedSemesterNumber: number;
    classLabel: string;
    campusCode: string;
  };
  subjects: StudentMySubjectCard[];
};

export type StudentSubjectSemesterOption = {
  value: number;
  label: string;
  isCurrent: boolean;
};

export type StudentSubjectSemestersResponse = {
  sectionId: string;
  currentSemesterNumber: number;
  semesters: StudentSubjectSemesterOption[];
};

export type StudentSyllabusTopic = { id: string; title: string; order: number; isCompleted: boolean };

export type StudentSyllabusUnit = { id: string; unitTitle: string; unitOrder: number; topics: StudentSyllabusTopic[] };

export type StudentSyllabusDetailResponse = {
  sectionId: string;
  subject: { id: string; name: string; code: string };
  progressPercent: number;
  completedUnits: number;
  totalUnits: number;
  completedTopics: number;
  totalTopics: number;
  teacherName: string | null;
  units: StudentSyllabusUnit[];
};
