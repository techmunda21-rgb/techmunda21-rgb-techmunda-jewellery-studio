-- CreateTable
CREATE TABLE "security_events" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "ip_hash" TEXT,
    "tenant_id" UUID,
    "user_id" UUID,
    "detail" JSONB,
    "alerted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "security_events_type_ip_hash_created_at_idx" ON "security_events"("type", "ip_hash", "created_at");

-- CreateIndex
CREATE INDEX "security_events_created_at_idx" ON "security_events"("created_at");
