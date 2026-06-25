import { PrismaClient } from "@prisma/client";
import { DEMO_TEACHER_PASSWORD, DEMO_TEACHER_PRESETS, ensureTeacherDemoAccounts } from "./teacher-demo";

/** @deprecated Use `DEMO_TEACHER_PRESETS` / `ensureTeacherDemoAccounts`. */
export const DEMO_HTPO_EMAIL = DEMO_TEACHER_PRESETS[0].email;
export const DEMO_HTPO_EMPLOYEE_CODE = DEMO_TEACHER_PRESETS[0].employeeCode;
export const DEMO_HTPO_PASSWORD = DEMO_TEACHER_PASSWORD;

export type EnsureHtpoDemoResult = { ok: true } | { ok: false; reason: string };

/** Ensures demo teacher accounts (all role combinations). */
export async function ensureHtpoDemoTeacher(prisma: PrismaClient): Promise<EnsureHtpoDemoResult> {
  const result = await ensureTeacherDemoAccounts(prisma);
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}
