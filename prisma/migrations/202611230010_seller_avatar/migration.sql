-- Additive only: existing users, sessions, orders and inventory are preserved.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SELLER';
ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT,
                   ADD COLUMN "avatarPublicId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "href" TEXT;
