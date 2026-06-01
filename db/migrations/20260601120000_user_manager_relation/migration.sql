ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "managerId" TEXT;

CREATE INDEX IF NOT EXISTS "User_managerId_idx" ON "User"("managerId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'User_managerId_fkey'
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_managerId_fkey"
      FOREIGN KEY ("managerId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
