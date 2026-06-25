export type HtpoTeamsSectionOption = {
  id: string;
  label: string;
};

export type HtpoTeamsSetup = {
  mode: "htpo" | "ctpo" | "teacher";
  roles: string[];
  canManage: boolean;
  showAllSections: boolean;
  sections: HtpoTeamsSectionOption[];
  fixedSectionId: string | null;
};

export type HtpoTeamMemberCard = {
  id: string;
  studentProfileId: string;
  fullName: string;
  initials: string;
  leaderRank: number;
  leaderLabel: string;
};

export type HtpoTeamCard = {
  id: string;
  name: string;
  section: HtpoTeamsSectionOption;
  metaLabel: string;
  members: HtpoTeamMemberCard[];
};

export type HtpoTeamsListResponse = {
  items: HtpoTeamCard[];
  total: number;
  page: number;
  pageSize: number;
  sectionCount: number;
};

export type HtpoTeamStudentOption = {
  id: string;
  rollNumber: string;
  fullName: string;
  label: string;
};

export type HtpoTeamMemberDraft = {
  studentProfileId: string;
  fullName: string;
  label: string;
  leaderRank: number;
};
