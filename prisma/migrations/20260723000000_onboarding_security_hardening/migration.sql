-- AlterEnum: Add PAYMENT_FAILED and CREATED to SubscriptionStatus
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'PAYMENT_FAILED';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'CREATED';

-- AlterEnum: Add PENDING_PAYMENT to InvitationStatus
ALTER TYPE "InvitationStatus" ADD VALUE IF NOT EXISTS 'PENDING_PAYMENT';

-- AlterTable: Add staging fields to ClientInvitation
ALTER TABLE "client_invitations"
  ADD COLUMN IF NOT EXISTS "stagingOrgName"       TEXT,
  ADD COLUMN IF NOT EXISTS "stagingPasswordHash"  TEXT,
  ADD COLUMN IF NOT EXISTS "stagingPlanId"        TEXT,
  ADD COLUMN IF NOT EXISTS "stagingBillingCycle"  TEXT,
  ADD COLUMN IF NOT EXISTS "pendingRazorpaySubId" TEXT;

-- AlterTable: Add idempotency + pre-org fields to RazorpaySubscription
ALTER TABLE "razorpay_subscriptions"
  ADD COLUMN IF NOT EXISTS "lastPaymentId"    TEXT,
  ADD COLUMN IF NOT EXISTS "invitationEmail"  TEXT;

-- AlterTable: Make organizationId nullable on RazorpaySubscription
ALTER TABLE "razorpay_subscriptions"
  ALTER COLUMN "organizationId" DROP NOT NULL;
