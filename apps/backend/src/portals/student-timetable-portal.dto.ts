import { IsOptional, IsIn } from "class-validator";

/**
 * Reserved for future timetable filters (e.g. week variant).
 * The current student timetable endpoint takes no query parameters.
 */
export class StudentTimetableQueryDto {
  @IsOptional()
  @IsIn(["section"])
  view?: "section";
}
