-- CreateEnum
CREATE TYPE "SubscriptionPackage" AS ENUM ('FREE', 'BASIC', 'ADVANCE', 'ADVANCE_5L', 'ENTERPRISE');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "address" TEXT,
ADD COLUMN     "expiryDate" TIMESTAMP(3),
ADD COLUMN     "isPhoneVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "package" "SubscriptionPackage" NOT NULL DEFAULT 'FREE',
ADD COLUMN     "whatsappNumber" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "lastIp" TEXT;
