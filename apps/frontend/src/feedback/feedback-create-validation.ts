function parseIsoDate(value: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

export type FeedbackQuestionDraft = {
  localKey: string;
  order: number;
  type: string;
  prompt: string;
  required: boolean;
  choicesText: string;
};

export type FeedbackScope = {
  campusId: string;
  programId: string;
  branchId: string;
  batchId: string;
  classId: string;
  sectionId: string;
};

export function validateFeedbackStep1(formType: string, customType: string): string | null {
  if (formType === "OTHER" && !customType.trim()) return "Specify the feedback type.";
  return null;
}

/** Audience must narrow to at least a department (campus is inferred from structure). */
export function validateFeedbackStep2(scope: FeedbackScope): string | null {
  if (!scope.programId && !scope.branchId && !scope.batchId && !scope.classId && !scope.sectionId) {
    return "Select at least a department, or narrow further by branch, batch, class, or section.";
  }
  return null;
}

export function validateFeedbackStep3(title: string, description: string, startsAt: string, endsAt: string): string | null {
  if (title.trim().length < 3) return "Feedback title must be at least 3 characters.";
  if (description.trim().length < 10) return "Description must be at least 10 characters.";
  if (!parseIsoDate(startsAt)) return "Select a valid start date.";
  if (!parseIsoDate(endsAt)) return "Select a valid end date.";
  if (endsAt < startsAt) return "End date must be on or after the start date.";
  return null;
}

export function validateFeedbackStep4(questions: FeedbackQuestionDraft[]): string | null {
  const valid = questions.filter((q) => q.prompt.trim().length >= 2);
  if (!valid.length) return "Add at least one question with prompt text.";
  for (const q of valid) {
    if (q.type === "MULTIPLE_CHOICE") {
      const choices = q.choicesText.split("\n").map((s) => s.trim()).filter(Boolean);
      if (choices.length < 2) return "Multiple-choice questions need at least two options.";
    }
  }
  return null;
}
