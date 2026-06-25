/** Teacher portal section picker label: section name first, department in parentheses. */
export function formatTeacherSectionLabel(section: {
  name: string;
  class: { batch: { branch: { program: { name: string } } } };
}) {
  const raw = section.class.batch.branch.program.name.trim();
  const department = /^B\.?\s*Tech\b/i.test(raw)
    ? raw.replace(/^B\.?\s*Tech\s*/i, "B.Tech ").replace(/\s+/g, " ").trim()
    : raw;
  return `${section.name} (${department})`;
}

/** Syllabus / filters: section name · ongoing semester · department code. */
export function formatTeacherSectionSemDeptLabel(section: {
  name: string;
  class: { semesterNumber: number; batch: { branch: { program: { code: string } } } };
}) {
  const department = section.class.batch.branch.program.code;
  return `${section.name} · Sem ${section.class.semesterNumber} · ${department}`;
}
