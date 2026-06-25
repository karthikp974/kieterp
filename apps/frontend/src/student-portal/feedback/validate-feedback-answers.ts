import type { StudentFeedbackQuestion } from "./student-feedback-types";

export function validateFeedbackAnswers(
  questions: StudentFeedbackQuestion[],
  answers: Record<string, unknown>
): string | null {
  for (const q of questions) {
    if (!q.required) continue;
    const v = answers[q.id];
    if (q.type === "PARAGRAPH" || q.type === "MULTIPLE_CHOICE") {
      if (!String(v ?? "").trim()) return `Please answer: ${q.prompt}`;
    } else if (q.type === "YES_NO") {
      if (typeof v !== "boolean") return `Please answer: ${q.prompt}`;
    } else if (q.type === "RATING_SCALE") {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 1 || n > 5) return `Please rate: ${q.prompt}`;
    }
  }
  return null;
}

export function buildSubmitPayload(questions: StudentFeedbackQuestion[], answers: Record<string, unknown>) {
  const payload: { questionId: string; value: unknown }[] = [];
  for (const q of questions) {
    const v = answers[q.id];
    if (q.type === "PARAGRAPH" || q.type === "MULTIPLE_CHOICE") {
      const s = String(v ?? "").trim();
      if (!q.required && !s.length) continue;
      payload.push({ questionId: q.id, value: s });
    } else {
      payload.push({ questionId: q.id, value: v });
    }
  }
  return payload;
}

export function initialAnswersForQuestions(questions: StudentFeedbackQuestion[]) {
  const init: Record<string, unknown> = {};
  for (const q of questions) {
    if (q.type === "YES_NO") init[q.id] = false;
    else if (q.type === "RATING_SCALE") init[q.id] = 3;
    else init[q.id] = "";
  }
  return init;
}

export function answersFromSubmission(
  questions: StudentFeedbackQuestion[],
  submission: { answers: { questionId: string; value: unknown }[] } | null
) {
  if (!submission) return initialAnswersForQuestions(questions);
  const map = new Map(submission.answers.map((a) => [a.questionId, a.value]));
  const out: Record<string, unknown> = {};
  for (const q of questions) {
    out[q.id] = map.has(q.id) ? map.get(q.id) : q.type === "RATING_SCALE" ? 3 : q.type === "YES_NO" ? false : "";
  }
  return out;
}
