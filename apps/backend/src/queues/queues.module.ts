import { BullModule, InjectQueue } from "@nestjs/bullmq";
import { Injectable, Module, OnModuleInit, forwardRef } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Queue } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { StudentsModule } from "../students/students.module";
import { SESSION_CLEANUP_EVERY_MS, SESSION_CLEANUP_JOB, SYSTEM_QUEUE } from "./queue.constants";
import { SystemProcessor } from "./system.processor";

@Injectable()
export class QueueService implements OnModuleInit {
  constructor(
    @InjectQueue(SYSTEM_QUEUE)
    private readonly systemQueue: Queue,
    private readonly prisma: PrismaService
  ) {}

  /** Register the daily expired-session cleanup as a repeatable job (deduped by repeat key). */
  async onModuleInit() {
    await this.systemQueue.add(
      SESSION_CLEANUP_JOB,
      {},
      {
        repeat: { every: SESSION_CLEANUP_EVERY_MS },
        removeOnComplete: true,
        removeOnFail: 50
      }
    );
  }

  async cancelBackgroundJob(recordId: string, reason: string) {
    const record = await this.prisma.backgroundJobRecord.findUnique({ where: { id: recordId } });
    if (!record || record.status === "completed") {
      return { cancelled: false as const, reason: "not_active" as const };
    }

    if (record.externalId) {
      const job = await this.systemQueue.getJob(record.externalId);
      if (job) {
        const state = await job.getState();
        if (state === "waiting" || state === "delayed") {
          await job.remove();
        }
      }
    }

    const existingResult = (record.result ?? {}) as Record<string, unknown>;
    await this.prisma.backgroundJobRecord.update({
      where: { id: recordId },
      data: {
        status: "failed",
        error: reason,
        result: { ...existingResult, cancelled: true } as Prisma.InputJsonObject
      }
    });

    return { cancelled: true as const, reason: "cancelled" as const };
  }

  async enqueueSystemJob(name: string, payload: Record<string, unknown>) {
    const record = await this.prisma.backgroundJobRecord.create({
      data: {
        queueName: SYSTEM_QUEUE,
        jobName: name,
        status: "queued",
        payload: payload as Prisma.InputJsonObject,
        result: {
          progress: { phase: "queued", processed: 0, total: 0, percent: 6 }
        } as Prisma.InputJsonObject
      }
    });

    const job = await this.systemQueue.add(name, payload, {
      jobId: record.id,
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 200
    });

    await this.prisma.backgroundJobRecord.update({
      where: { id: record.id },
      data: { externalId: job.id }
    });

    return record;
  }
}

@Module({
  imports: [BullModule.registerQueue({ name: SYSTEM_QUEUE }), forwardRef(() => StudentsModule)],
  providers: [QueueService, SystemProcessor],
  exports: [QueueService]
})
export class QueuesModule {}
