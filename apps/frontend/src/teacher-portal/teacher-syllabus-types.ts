export type TeacherSyllabusSubject = {
  id: string;
  code: string;
  name: string;
  label: string;
  semesterNumber: number;
};

export type TeacherSyllabusTopic = {
  id: string;
  topicTitle: string;
  topicOrder: number;
};

export type TeacherSyllabusUnit = {
  id: string;
  unitTitle: string;
  unitOrder: number;
  topics: TeacherSyllabusTopic[];
};

export type TeacherSyllabusSetup = {
  mode: string;
  roles: string[];
  showSectionFilter: boolean;
  sections: { id: string; label: string; name: string }[];
  fixedSectionId: string | null;
  subjects: TeacherSyllabusSubject[];
};

export type TeacherSyllabusDetailResponse =
  | { exists: false; subject: { id: string; code: string; name: string } }
  | {
      exists: true;
      subject: { id: string; code: string; name: string };
      syllabus: { id: string; units: TeacherSyllabusUnit[] };
    };

export type TeacherSyllabusCompletionUnit = {
  id: string;
  unitTitle: string;
  unitOrder: number;
  topics: { id: string; topicTitle: string; topicOrder: number; isCompleted: boolean }[];
};

export type TeacherSyllabusProgress = {
  progressPercent: number;
  completedUnits: number;
  totalUnits: number;
  completedTopics: number;
  totalTopics: number;
  hasSyllabus: boolean;
};

export function teacherEligibleForSyllabus(roles: string[]) {
  return roles.includes("STPO") || roles.includes("CTPO");
}
