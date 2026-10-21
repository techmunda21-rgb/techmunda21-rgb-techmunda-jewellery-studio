-- CreateTable
CREATE TABLE "showcase_documents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "page_count" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "showcase_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "showcase_documents_tenant_id_is_active_created_at_idx" ON "showcase_documents"("tenant_id", "is_active", "created_at");

-- AddForeignKey
ALTER TABLE "showcase_documents" ADD CONSTRAINT "showcase_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
