export type HtpoSubjectTeacherRow = {
  id: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  sectionId: string;
  sectionLabel: string;
  stpoTeacherId: string | null;
  stpoTeacherName: string | null;
};

export type HtpoSubjectTeacherList = {
  rows: HtpoSubjectTeacherRow[];
};

export type HtpoAssignTeacherOptions = {
  sections: { id: string; label: string }[];
  subjects: { id: string; code: string; name: string; label: string }[];
  teachers: { id: string; label: string }[];
  selectedSectionId: string | null;
  selectedSubjectId: string | null;
  selectedTeacherId: string | null;
};

export type HtpoYourTimetableRow = {
  id: string;
  sectionLabel: string;
  semesterLabel: string;
  subjectName: string;
  subjectCode: string | null;
  timePeriod: string;
};

export type HtpoYourTimetableList = {
  rows: HtpoYourTimetableRow[];
};
