import type { Prisma } from '@prisma/client';
export async function invalidateAccountChallenges(tx: Prisma.TransactionClient, userId: string) {
  await tx.authToken.updateMany({ where: { userId, purpose: { in: ['RESET', 'GOOGLE_LOGIN'] }, usedAt: null }, data: { usedAt: new Date() } });
  await tx.passwordRecovery.updateMany({ where: { userId, consumedAt: null }, data: { consumedAt: new Date() } });
  await tx.storeSetting.deleteMany({ where: { key: `mfa-setup:${userId}` } });
}
