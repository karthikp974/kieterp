import { Module } from "@nestjs/common";
import { QueuesModule } from "../queues/queues.module";
import { ResultsController } from "./results.controller";
import { ResultsService } from "./results.service";

@Module({
  imports: [QueuesModule],
  controllers: [ResultsController],
  providers: [ResultsService],
  exports: [ResultsService]
})
export class ResultsModule {}
