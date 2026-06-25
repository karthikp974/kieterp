import { Module, forwardRef } from "@nestjs/common";
import { QueuesModule } from "../queues/queues.module";
import { StudentsController } from "./students.controller";
import { StudentsService } from "./students.service";

@Module({
  imports: [forwardRef(() => QueuesModule)],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService]
})
export class StudentsModule {}
