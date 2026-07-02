import { IsIn, IsString, MinLength } from "class-validator";
import { PaginationQueryDto } from "../common/pagination.dto";
import { TABULAR_EXPORT_FORMATS, type TabularExportFormat } from "../common/tabular-export.util";

export const SECTION_OVERVIEW_VIEWS = ["personal", "fee", "academic", "marks"] as const;
export type SectionOverviewView = (typeof SECTION_OVERVIEW_VIEWS)[number];

export class SectionOverviewQueryDto extends PaginationQueryDto {
  @IsString()
  @MinLength(1)
  sectionId!: string;

  @IsIn([...SECTION_OVERVIEW_VIEWS])
  view!: SectionOverviewView;
}

export class SectionOverviewExportQueryDto extends SectionOverviewQueryDto {
  @IsIn([...TABULAR_EXPORT_FORMATS])
  format!: TabularExportFormat;
}
