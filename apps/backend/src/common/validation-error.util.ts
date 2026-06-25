import { BadRequestException } from "@nestjs/common";
import { ValidationError } from "class-validator";

const FIELD_LABELS: Record<string, string> = {
  subjectCode: "Sub code",
  subjectName: "Sub name",
  internals: "Internals",
  externals: "Externals",
  grade: "Grade",
  credits: "Credits",
  semesterNumber: "Semester",
  sectionId: "Section",
  studentProfileId: "Student",
  campusScope: "Campus filter",
  examType: "Exam type",
  rows: "Subjects",
  file: "File"
};

function humanizeConstraint(message: string) {
  return message
    .replace(/^[a-zA-Z0-9_.]+\s+/u, "")
    .replace(/must not be greater than (\d+(?:\.\d+)?)/gi, "must be $1 or less")
    .replace(/must not be less than (\d+(?:\.\d+)?)/gi, "must be at least $1")
    .replace(/must be shorter than or equal to (\d+) characters?/gi, "must be $1 characters or fewer")
    .replace(/must be longer than or equal to (\d+) characters?/gi, "must be at least $1 characters")
    .replace(/should not be empty/gi, "is required")
    .replace(/must be a string/gi, "must be text")
    .replace(/must be a number/gi, "must be a number");
}

function fieldLabel(property: string) {
  return FIELD_LABELS[property] ?? property.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

export function flattenValidationErrors(errors: ValidationError[], subjectRow?: number): string[] {
  const messages: string[] = [];

  for (const error of errors) {
    if (error.property === "rows" && error.children?.length) {
      messages.push(...flattenValidationErrors(error.children));
      continue;
    }

    if (/^\d+$/.test(error.property) && error.children?.length) {
      const rowNumber = Number(error.property) + 1;
      messages.push(...flattenValidationErrors(error.children, rowNumber));
      continue;
    }

    const label = fieldLabel(error.property);
    const prefix = subjectRow ? `Subject ${subjectRow} — ${label}` : label;

    if (error.children?.length) {
      messages.push(...flattenValidationErrors(error.children, subjectRow));
      continue;
    }

    if (error.constraints) {
      for (const message of Object.values(error.constraints)) {
        messages.push(`${prefix}: ${humanizeConstraint(message)}`);
      }
    }
  }

  return messages;
}

export function validationExceptionFactory(errors: ValidationError[]) {
  const messages = flattenValidationErrors(errors);
  return new BadRequestException(messages.length ? messages : ["Some fields are invalid. Please check the form and try again."]);
}
