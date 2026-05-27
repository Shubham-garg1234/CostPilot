-- Employee password auth (aligned with application schema)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordSetAt" TIMESTAMP(3);
ALTER TABLE "User" ALTER COLUMN "clerkUserId" DROP NOT NULL;
