import type { FeedbackQuestionDraft } from "./feedback-create-validation";

export function toDateInputValue(iso: string) {
  return iso.slice(0, 10);
}

export function buildQuestionsPayload(questions: FeedbackQuestionDraft[]) {
  return questions
    .map((q, i) => ({
      order: i,
      type: q.type,
      prompt: q.prompt.trim(),
      required: q.required,
      options:
        q.type === "MULTIPLE_CHOICE"
          ? { choices: q.choicesText.split("\n").map((s) => s.trim()).filter(Boolean) }
          : q.type === "RATING_SCALE"
            ? { minLabel: "Poor", maxLabel: "Excellent" }
            : undefined
    }))
    .filter((q) => q.prompt.trim().length >= 2);
}

type ApiQuestion = {
  id: string;
  order: number;
  type: string;
  prompt: string;
  required: boolean;
  options: { choices?: string[] } | null;
};

export function questionsFromApi(questions: ApiQuestion[]): FeedbackQuestionDraft[] {
  return questions.map((q) => ({
    localKey: q.id,
    order: q.order,
    type: q.type,
    prompt: q.prompt,
    required: q.required,
    choicesText:
      q.type === "MULTIPLE_CHOICE" && q.options && typeof q.options === "object" && "choices" in q.options
        ? (q.options.choices ?? []).join("\n")
        : ""
  }));
}
