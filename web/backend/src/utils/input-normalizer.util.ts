/**
 * Input Normalizer
 * Provides helper utilities for trimming and normalizing
 * user-provided text so the BBS can compare values in a
 * case-insensitive, whitespace-tolerant manner.
 */
export function sanitizeInput(value: string | undefined | null): string {
  return (value ?? '').trim();
}

export function normalizeForComparison(value: string | undefined | null): string {
  return sanitizeInput(value).toLowerCase();
}
