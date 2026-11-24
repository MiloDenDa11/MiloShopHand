-- Additive authentication data only. Existing users, passwords and sessions are unchanged.
CREATE TABLE "ExternalIdentity" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExternalIdentity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExternalIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ExternalIdentity_provider_subject_key" ON "ExternalIdentity"("provider", "subject");
CREATE UNIQUE INDEX "ExternalIdentity_userId_provider_key" ON "ExternalIdentity"("userId", "provider");
CREATE TABLE "PasswordRecovery" (
  "id" TEXT NOT NULL,
  "emailHash" TEXT NOT NULL,
  "userId" TEXT,
  "codeHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "resetTokenHash" TEXT,
  "resetExpiresAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordRecovery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PasswordRecovery_attempts_check" CHECK ("attempts" BETWEEN 0 AND 5),
  CONSTRAINT "PasswordRecovery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PasswordRecovery_resetTokenHash_key" ON "PasswordRecovery"("resetTokenHash");
CREATE INDEX "PasswordRecovery_emailHash_createdAt_idx" ON "PasswordRecovery"("emailHash", "createdAt");
CREATE INDEX "PasswordRecovery_userId_consumedAt_idx" ON "PasswordRecovery"("userId", "consumedAt");
CREATE INDEX "PasswordRecovery_expiresAt_idx" ON "PasswordRecovery"("expiresAt");
