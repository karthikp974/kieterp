import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/auth-context";
import { readApiError } from "../../shared/read-api-error";
import { useToast } from "../../shared/toast-context";
import { RequireTeacherModule } from "../RequireTeacherModule";

type StudentSemestersPayload = {
  student: { id: string; rollNumber: string; fullName: string; sectionLabel: string };
  cgpa: number | null;
  semesters: {
    semesterNumber: number;
    semesterLabel: string;
    sgpa: number | null;
    subjects: {
      subjectCode: string;
      subjectName: string;
      internals: number | null;
      grade: string | null;
      credits: number | null;
    }[];
  }[];
};

export function TeacherPortalResultsStudentPage() {
  const { studentProfileId = "" } = useParams();
  const { authFetch } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [data, setData] = useState<StudentSemestersPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!studentProfileId) return;
    setLoading(true);
    try {
      const res = await authFetch(`/api/portals/teacher/results/students/${studentProfileId}/semesters`);
      if (!res.ok) throw new Error(await readApiError(res, "Could not load student results."));
      setData((await res.json()) as StudentSemestersPayload);
    } catch (error) {
      setData(null);
      showToast(error instanceof Error ? error.message : "Could not load results.", "error");
    } finally {
      setLoading(false);
    }
  }, [authFetch, showToast, studentProfileId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <RequireTeacherModule moduleKey="results">
      <div className="htpo-results-student-page">
        <header className="htpo-results-student-head">
          <button type="button" className="htpo-results-link-btn" onClick={() => void navigate("/teacher/results")}>
            Back to results
          </button>
          {data ? (
            <>
              <h1>{data.student.fullName}</h1>
              <p>
                {data.student.rollNumber} · {data.student.sectionLabel}
                {data.cgpa != null ? ` · CGPA ${data.cgpa}` : ""}
              </p>
            </>
          ) : (
            <h1>Student results</h1>
          )}
        </header>

        {loading ? <p className="htpo-results-empty">Loading…</p> : null}

        {!loading && data?.semesters.length ? (
          <div className="htpo-results-student-stack">
            {data.semesters.map((semester) => (
              <section key={semester.semesterNumber} className="htpo-results-semester-card">
                <header className="htpo-results-semester-head">
                  <h2>{semester.semesterLabel}</h2>
                  {semester.sgpa != null ? <span>SGPA {semester.sgpa}</span> : null}
                </header>
                <div className="htpo-results-table-wrap htpo-tt-table-scroll">
                  <table className="htpo-results-table">
                    <thead>
                      <tr>
                        <th>Sub code</th>
                        <th>Sub name</th>
                        <th>Internals</th>
                        <th>Grade</th>
                        <th>Credits</th>
                      </tr>
                    </thead>
                    <tbody>
                      {semester.subjects.map((subject) => (
                        <tr key={`${semester.semesterNumber}-${subject.subjectCode}`}>
                          <td>{subject.subjectCode}</td>
                          <td>{subject.subjectName}</td>
                          <td>{subject.internals ?? "—"}</td>
                          <td>{subject.grade ?? "—"}</td>
                          <td>{subject.credits ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        ) : null}

        {!loading && !data?.semesters.length ? (
          <p className="htpo-results-empty">No semester results recorded for this student yet.</p>
        ) : null}
      </div>
    </RequireTeacherModule>
  );
}
