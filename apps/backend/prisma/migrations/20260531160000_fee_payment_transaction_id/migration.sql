ALTER TABLE "FeePayment" ADD COLUMN "transactionId" TEXT;

UPDATE "FeePayment" SET "transactionId" = 'TXN-' || "receiptNo" WHERE "transactionId" IS NULL;

CREATE UNIQUE INDEX "FeePayment_transactionId_key" ON "FeePayment"("transactionId");
