-- Session flag: owner / master-password logins write audit rows as institution admin.
ALTER TABLE "AuthSession" ADD COLUMN "auditAsAdmin" BOOLEAN NOT NULL DEFAULT false;
