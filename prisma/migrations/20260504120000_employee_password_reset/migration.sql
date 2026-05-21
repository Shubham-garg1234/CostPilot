-- CreateTable
CREATE TABLE "EmployeePasswordReset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeePasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeePasswordReset_tokenHash_key" ON "EmployeePasswordReset"("tokenHash");

-- CreateIndex
CREATE INDEX "EmployeePasswordReset_userId_idx" ON "EmployeePasswordReset"("userId");

-- AddForeignKey
ALTER TABLE "EmployeePasswordReset" ADD CONSTRAINT "EmployeePasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
