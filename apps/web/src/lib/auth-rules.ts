/** Client-side rules for email/password auth. Supabase enforces its own minimum server-side. */
export const MIN_PASSWORD_LENGTH = 8;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
