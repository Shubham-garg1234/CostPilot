-- CreateEnum
CREATE TYPE "ManagedClientType" AS ENUM ('CURSOR', 'CLAUDE', 'OTHER');

-- CreateEnum
CREATE TYPE "ManagedGatewayKeyStatus" AS ENUM ('ACTIVE', 'REVOKED', 'ROTATED');

-- CreateEnum
CREATE TYPE "ManagedCursorComplianceStatus" AS ENUM ('PENDING', 'COMPLIANT', 'NON_COMPLIANT');

-- AlterTable
ALTER TABLE "Organization"
ADD COLUMN "governedCursorRequired" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "cursorComplianceStatus" "ManagedCursorComplianceStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "cursorComplianceUpdatedAt" TIMESTAMP(3),
ADD COLUMN "lastGovernedCursorRequestAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ManagedGatewayKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientType" "ManagedClientType" NOT NULL DEFAULT 'CURSOR',
    "encryptedSecret" TEXT NOT NULL,
    "secretPreview" TEXT NOT NULL,
    "status" "ManagedGatewayKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "issuedBy" TEXT,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagedGatewayKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManagedGatewayKey_orgId_clientType_status_idx" ON "ManagedGatewayKey"("orgId", "clientType", "status");

-- CreateIndex
CREATE INDEX "ManagedGatewayKey_userId_clientType_status_idx" ON "ManagedGatewayKey"("userId", "clientType", "status");

-- AddForeignKey
ALTER TABLE "ManagedGatewayKey" ADD CONSTRAINT "ManagedGatewayKey_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagedGatewayKey" ADD CONSTRAINT "ManagedGatewayKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
