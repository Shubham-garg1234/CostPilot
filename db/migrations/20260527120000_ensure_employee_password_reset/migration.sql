-- Idempotent guard: fixes DBs where Prisma history marked the reset migration applied
-- but table never existed (or was dropped). Safe to run on every environment.

CREATE TABLE IF NOT EXISTS "EmployeePasswordReset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeePasswordReset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmployeePasswordReset_tokenHash_key" ON "EmployeePasswordReset"("tokenHash");

CREATE INDEX IF NOT EXISTS "EmployeePasswordReset_userId_idx" ON "EmployeePasswordReset"("userId");

DO $$
BEGIN
  ALTER TABLE "EmployeePasswordReset"
    ADD CONSTRAINT "EmployeePasswordReset_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
