-- CreateTable
CREATE TABLE "nodes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "public_key" TEXT,
    "api_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "certified_at" TIMESTAMPTZ,
    "certification_expires_at" TIMESTAMPTZ,
    "decertified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "node_audit_logs" (
    "id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "performed_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "node_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nodes_name_key" ON "nodes"("name");

-- CreateIndex
CREATE UNIQUE INDEX "nodes_api_key_key" ON "nodes"("api_key");

-- CreateIndex
CREATE INDEX "nodes_region_idx" ON "nodes"("region");

-- CreateIndex
CREATE INDEX "nodes_status_idx" ON "nodes"("status");

-- CreateIndex
CREATE INDEX "nodes_api_key_idx" ON "nodes"("api_key");

-- CreateIndex
CREATE INDEX "node_audit_logs_node_id_idx" ON "node_audit_logs"("node_id");

-- CreateIndex
CREATE INDEX "node_audit_logs_action_idx" ON "node_audit_logs"("action");

-- AddForeignKey
ALTER TABLE "node_audit_logs" ADD CONSTRAINT "node_audit_logs_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
