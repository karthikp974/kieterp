export async function readApiError(response: Response, fallback: string) {
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    return "API server is not running. Start the backend on port 4000 (npm run dev from repo root).";
  }

  const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
  const message = formatApiMessages(payload?.message, fallback);

  if (response.status === 404 && typeof message === "string" && /^cannot get \/api\//i.test(message)) {
    return "Backend is running old code without this route. Stop the process on port 4000, then run npm run dev from the repo root.";
  }

  return message || fallback;
}

function formatApiMessages(message: string | string[] | undefined, fallback: string) {
  if (Array.isArray(message)) {
    const formatted = message.map(humanizeValidationMessage).filter(Boolean);
    return formatted.length ? formatted.join(" ") : fallback;
  }
  if (typeof message === "string" && message.trim()) {
    return humanizeValidationMessage(message);
  }
  return fallback;
}

function humanizeValidationMessage(message: string) {
  const rowMatch = message.match(/^rows\.(\d+)\.(\w+)\s+(.+)$/i);
  if (rowMatch) {
    const rowNumber = Number(rowMatch[1]) + 1;
    const field = fieldLabel(rowMatch[2]);
    return `Subject ${rowNumber} — ${field}: ${humanizeConstraint(rowMatch[3])}`;
  }

  const plainFieldMatch = message.match(/^(\w+)\s+(.+)$/);
  if (plainFieldMatch && fieldLabel(plainFieldMatch[1]) !== plainFieldMatch[1]) {
    return `${fieldLabel(plainFieldMatch[1])}: ${humanizeConstraint(plainFieldMatch[2])}`;
  }

  return humanizeConstraint(message);
}

function fieldLabel(property: string) {
  const labels: Record<string, string> = {
    subjectCode: "Sub code",
    subjectName: "Sub name",
    internals: "Internals",
    externals: "Externals",
    grade: "Grade",
    credits: "Credits",
    semesterNumber: "Semester",
    sectionId: "Section",
    studentProfileId: "Student",
    examType: "Exam type",
    rows: "Subjects",
    file: "File"
  };
  return labels[property] ?? property;
}

function humanizeConstraint(message: string) {
  return message
    .replace(/^[a-zA-Z0-9_.]+\s+/u, "")
    .replace(/must not be greater than (\d+(?:\.\d+)?)/gi, "must be $1 or less")
    .replace(/must not be less than (\d+(?:\.\d+)?)/gi, "must be at least $1")
    .replace(/must be shorter than or equal to (\d+) characters?/gi, "must be $1 characters or fewer")
    .replace(/should not be empty/gi, "is required")
    .replace(/must be a string/gi, "must be text")
    .replace(/must be a number conforming to the specified constraints/gi, "must be a valid number");
}
