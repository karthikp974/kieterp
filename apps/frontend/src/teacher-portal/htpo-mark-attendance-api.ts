import { todayIstDate } from "../shared/ist-time";
type MarkSetup = {
  section: { id: string; label: string };
  scope: {
    campusId: string;
    programId: string;
    branchId: string;
    batchId: string;
    classId: string;
    sectionId: string;
  };
  attendanceDate: string;
  students: { id: string; rollNumber: string; fullName?: string }[];
};

type TeacherStructure = {
  campuses: { id: string; code: string }[];
  programs: { id: string; campusId: string; code: string }[];
  branches: { id: string; programId: string; code: string; name: string }[];
  batches: { id: string; branchId: string }[];
  classes: { id: string; batchId: string; semesterNumber: number; label: string }[];
  sections: { id: string; classId: string; name: string }[];
};

export async function loadHtpoMarkSetup(
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  sectionId: string
): Promise<MarkSetup> {
  const markRes = await authFetch(`/api/portals/teacher/htpo/sections/${sectionId}/mark-setup`);
  if (markRes.ok) {
    return (await markRes.json()) as MarkSetup;
  }

  const structureRes = await authFetch("/api/portals/teacher/structure");
  if (!structureRes.ok) {
    const payload = (await markRes.json().catch(() => null)) as { message?: string } | null;
    const fallback = payload?.message ?? `Unable to load mark attendance (server returned ${markRes.status}).`;
    throw new Error(fallback);
  }

  const structure = (await structureRes.json()) as TeacherStructure;
  const section = structure.sections.find((row) => row.id === sectionId);
  if (!section) throw new Error("Section not found in your HTPO scope.");

  const academicClass = structure.classes.find((row) => row.id === section.classId);
  const batch = academicClass ? structure.batches.find((row) => row.id === academicClass.batchId) : undefined;
  const branch = batch ? structure.branches.find((row) => row.id === batch.branchId) : undefined;
  const program = branch ? structure.programs.find((row) => row.id === branch.programId) : undefined;
  const campus = program ? structure.campuses.find((row) => row.id === program.campusId) : undefined;

  if (!academicClass || !batch || !branch || !program || !campus) {
    throw new Error("Could not resolve section scope for marking attendance.");
  }

  const scope = {
    campusId: campus.id,
    programId: program.id,
    branchId: branch.id,
    batchId: batch.id,
    classId: academicClass.id,
    sectionId: section.id
  };

  const rosterRes = await authFetch("/api/attendance/roster", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(scope)
  });
  if (!rosterRes.ok) {
    const payload = (await rosterRes.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message ?? "Unable to load student roster.");
  }

  const roster = (await rosterRes.json()) as { students: { id: string; rollNumber: string; fullName?: string }[] };
  const today = todayIstDate();

  return {
    section: {
      id: section.id,
      label: `${branch.name} · Sem ${academicClass.semesterNumber} · ${section.name}`
    },
    scope,
    attendanceDate: today,
    students: roster.students.map((student) => ({
      id: student.id,
      rollNumber: student.rollNumber,
      fullName: student.fullName
    }))
  };
}
