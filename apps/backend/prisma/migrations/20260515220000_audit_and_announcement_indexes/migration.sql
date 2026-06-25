-- CreateIndex
CREATE INDEX IF NOT EXISTS "Announcement_teacherRoleFilter_idx" ON "Announcement"("teacherRoleFilter");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
