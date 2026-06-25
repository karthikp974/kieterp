import { IsIn } from "class-validator";
import { TABULAR_EXPORT_FORMATS, type TabularExportFormat } from "./tabular-export.util";

export class TabularExportFormatQueryDto {
  @IsIn([...TABULAR_EXPORT_FORMATS])
  format!: TabularExportFormat;
}
