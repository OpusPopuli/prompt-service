-- AlterTable
ALTER TABLE "prompt_request_logs" ADD COLUMN "region" TEXT NOT NULL DEFAULT 'unknown';

-- CreateIndex
CREATE INDEX "prompt_request_logs_region_idx" ON "prompt_request_logs"("region");
