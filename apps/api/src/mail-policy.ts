export function recoveryDelivery(config: Record<string, string | undefined>) {
  if (config.NODE_ENV !== 'production' && config.EMAIL_PROVIDER === 'file') return 'local' as const;
  if (config.EMAIL_PROVIDER !== 'smtp' || !config.SMTP_HOST) return 'unavailable' as const;
  if (config.SMTP_HOST === 'smtp.gmail.com' && (!config.SMTP_USER || !config.SMTP_PASSWORD || !(config.SMTP_PORT === '465' && config.SMTP_SECURE === 'true' || config.SMTP_PORT === '587' && config.SMTP_SECURE !== 'true'))) return 'unavailable' as const;
  return 'email' as const;
}
