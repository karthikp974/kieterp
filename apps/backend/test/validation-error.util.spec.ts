import { describe, expect, it } from "vitest";
import { flattenValidationErrors } from "../src/common/validation-error.util";
import { ValidationError } from "class-validator";

describe("flattenValidationErrors", () => {
  it("formats nested subject row errors for teachers", () => {
    const rowError = new ValidationError();
    rowError.property = "0";
    const internalsError = new ValidationError();
    internalsError.property = "internals";
    internalsError.constraints = { max: "internals must not be greater than 100" };
    rowError.children = [internalsError];

    const rowsError = new ValidationError();
    rowsError.property = "rows";
    rowsError.children = [rowError];

    expect(flattenValidationErrors([rowsError])).toEqual(["Subject 1 — Internals: must be 100 or less"]);
  });
});
