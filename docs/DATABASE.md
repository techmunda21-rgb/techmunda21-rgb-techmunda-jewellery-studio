# Database

PostgreSQL 16, Prisma 6 (`packages/database/prisma/schema.prisma`, migration `…_init`). UUID primary keys, `created_at/updated_at`, snake_case columns/tables via `@map`. Every tenant-owned table has `tenant_id` (FK → `tenants`, `ON DELETE CASCADE`).

| Table | Notes |
|---|---|
| tenants, users | `users` unique `(tenant_id, email)`; roles enum `PLATFORM_ADMIN…VIEWER` |
| refresh_tokens | *(added)* hashed rotating tokens, `family_id`, revoke/replace tracking |
| products | unique `(tenant_id, sku)`; specs are tenant-entered only (never AI-generated) |
| product_media | `storage_key`, `checksum`, `rights_confirmed` *(added)*, `review_status`; unique `(tenant_id, storage_key)` |
| creative_jobs | prompt/brief (JSON), style, aspect ratio, `provider`, `simulated` flag, status/error |
| generated_assets | provenance via job → source media; `accuracy_flags`, `review_status`, reviewer fields |
| campaigns, campaign_assets | assets attach only when `APPROVED` (enforced in API) |
| contacts | consent status/source/text/IP/timestamp |
| leads | score, reason, `qualification_source` (`LLM`/`SIMULATED_RULES`), full structured output JSON, stage enum, `next_follow_up_at` |
| lead_notes, tasks | *(added)* CRM notes and follow-up reminders |
| opportunities | stage mirrors the lead's stage |
| communication_drafts | `version`, `approved_version`, `provider_draft_id`, `provider_message_id`, unique `send_idempotency_key`, `last_error` |
| approval_requests | polymorphic (`resource_type`, `resource_id`) |
| integration_connections | `encrypted_credentials_reference` holds AES-256-GCM ciphertext (not a pointer); unique `(tenant, provider, account)` |
| automation_runs | unique `(tenant_id, workflow_name, correlation_id)` → idempotency |
| activity_logs | CRM timeline (denormalised `lead_id`) |
| audit_logs | security audit trail (IP, metadata) |
| notifications | *(added)* in-app notifications |

Indexes: `(tenant_id, status)`, `(tenant_id, created_at)`, `(tenant_id, next_follow_up_at)`, `(tenant_id, assigned_to)`, `(tenant_id, lead_id, created_at)` on activity, contact email/phone.

Commands: `pnpm db:migrate` (deploy) · `pnpm db:migrate:dev` (create) · `pnpm db:seed` (wipes & recreates the demo tenants by slug; safe to re-run). **Backups:** use `pg_dump -Fc` nightly + WAL archiving/PITR on managed Postgres; test restores; back up the object-storage bucket (versioning on); never back up `.env` into the same place as the dump.
