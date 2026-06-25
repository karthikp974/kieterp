import { IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../common/pagination.dto";
import { SubmitFeedbackDto } from "../feedback/feedback.dto";

export class StudentFeedbackFormsQueryDto extends PaginationQueryDto {}

export class StudentFeedbackSubmitDto extends SubmitFeedbackDto {}
