export type TeacherEngageSetup = {
  mode: "htpo" | "ctpo" | "stpo" | "teacher";
  roles: string[];
  showSectionFilter: boolean;
  canManageFeedback: boolean;
  canManageAnnouncements: boolean;
  sections: { id: string; label: string; name: string }[];
  fixedSectionId: string | null;
};

export function appendSectionQuery(path: string, sectionId: string) {
  if (!sectionId.trim()) return path;
  const joiner = path.includes("?") ? "&" : "?";
  return `${path}${joiner}sectionId=${encodeURIComponent(sectionId.trim())}`;
}
