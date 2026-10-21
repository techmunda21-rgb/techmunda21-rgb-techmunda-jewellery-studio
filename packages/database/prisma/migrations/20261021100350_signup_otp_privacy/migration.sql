-- CreateEnum
CREATE TYPE "SignupStatus" AS ENUM ('PENDING', 'VERIFIED', 'LOCKED', 'EXPIRED');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "demo_expires_at" TIMESTAMP(3),
ADD COLUMN     "is_demo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verified_at" TIMESTAMP(3),
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "phone_verified_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "signup_requests" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "business_name" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'IN',
    "password_hash" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "otp_hash" TEXT NOT NULL,
    "otp_expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "resend_count" INTEGER NOT NULL DEFAULT 0,
    "last_sent_at" TIMESTAMP(3) NOT NULL,
    "status" "SignupStatus" NOT NULL DEFAULT 'PENDING',
    "policy_version" TEXT NOT NULL,
    "marketing_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "ip_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signup_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_acceptances" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "policy_version" TEXT NOT NULL,
    "terms_accepted" BOOLEAN NOT NULL,
    "privacy_accepted" BOOLEAN NOT NULL,
    "marketing_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "ip_hash" TEXT,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "signup_requests_email_created_at_idx" ON "signup_requests"("email", "created_at");

-- CreateIndex
CREATE INDEX "signup_requests_ip_hash_created_at_idx" ON "signup_requests"("ip_hash", "created_at");

-- CreateIndex
CREATE INDEX "policy_acceptances_tenant_id_user_id_idx" ON "policy_acceptances"("tenant_id", "user_id");

-- AddForeignKey
ALTER TABLE "policy_acceptances" ADD CONSTRAINT "policy_acceptances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_acceptances" ADD CONSTRAINT "policy_acceptances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
