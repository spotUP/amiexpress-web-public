/**
 * Secrets Encryption Utility
 *
 * Provides AES-256-GCM encryption for sensitive configuration data
 * like SMTP passwords, API keys, etc.
 *
 * Key Management:
 * - Key derived from SECRETS_KEY environment variable or JWT_SECRET
 * - Falls back to a machine-specific key if neither is set (dev only)
 *
 * Storage Format:
 * - Encrypted values are prefixed with "enc:" for identification
 * - Format: enc:{iv}:{authTag}:{ciphertext} (all base64)
 */

import * as crypto from 'crypto';
import * as os from 'os';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const ENCRYPTED_PREFIX = 'enc:';

// List of fields that should be encrypted
export const SENSITIVE_FIELDS = [
  'smtp_password',
  'smtp_username', // Could contain auth tokens
  'sendgrid_api_key',
  'reg_key',
  'ftp_password',
  'ssh_host_key',
  'jwt_secret',
  'api_key',
  'discord_webhook_url',
  'render_deploy_hook_url',
] as const;

export type SensitiveField = typeof SENSITIVE_FIELDS[number];

/**
 * Check if a field name is sensitive and should be encrypted
 */
export function isSensitiveField(fieldName: string): boolean {
  const lowerField = fieldName.toLowerCase();
  return (
    lowerField.includes('password') ||
    lowerField.includes('secret') ||
    lowerField.includes('api_key') ||
    lowerField.includes('apikey') ||
    lowerField.includes('token') ||
    lowerField.includes('webhook') ||
    lowerField.includes('deploy_hook') ||
    SENSITIVE_FIELDS.includes(lowerField as SensitiveField)
  );
}

/**
 * Get or derive encryption key
 * Priority: SECRETS_KEY > JWT_SECRET > machine-derived (dev only)
 */
function getEncryptionKey(): Buffer {
  // Try SECRETS_KEY first (recommended for production)
  let keySource = process.env.SECRETS_KEY;

  // Fall back to JWT_SECRET
  if (!keySource) {
    keySource = process.env.JWT_SECRET;
  }

  // Development fallback: machine-specific key (NOT secure for production)
  if (!keySource) {
console.warn('[SecretsEncryption] WARNING: No SECRETS_KEY or JWT_SECRET set. Using machine-derived key (dev only).');
    keySource = `amiexpress-dev-${os.hostname()}-${os.userInfo().username}`;
  }

  // Derive a fixed-length key using PBKDF2
  return crypto.pbkdf2Sync(
    keySource,
    'amiexpress-secrets-salt', // Static salt (key derivation, not password hashing)
    100000,
    KEY_LENGTH,
    'sha256'
  );
}

/**
 * Encrypt a sensitive value
 * Returns: enc:{iv}:{authTag}:{ciphertext}
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return '';

  // Already encrypted?
  if (plaintext.startsWith(ENCRYPTED_PREFIX)) {
    return plaintext;
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  const authTag = cipher.getAuthTag();

  // Format: enc:{iv}:{authTag}:{ciphertext}
  return `${ENCRYPTED_PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Decrypt a sensitive value
 * Handles both encrypted (enc:...) and plain text values
 */
export function decryptSecret(encryptedValue: string): string {
  if (!encryptedValue) return '';

  // Not encrypted? Return as-is (backward compatibility)
  if (!encryptedValue.startsWith(ENCRYPTED_PREFIX)) {
    return encryptedValue;
  }

  try {
    const parts = encryptedValue.slice(ENCRYPTED_PREFIX.length).split(':');
    if (parts.length !== 3) {
console.error('[SecretsEncryption] Invalid encrypted format');
      return '';
    }

    const [ivBase64, authTagBase64, ciphertextBase64] = parts;

    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');
    const ciphertext = Buffer.from(ciphertextBase64, 'base64');

    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
  } catch (error: any) {
console.error('[SecretsEncryption] Decryption failed:', error.message);
    // Return empty string on failure (prevents exposing partial data)
    return '';
  }
}

/**
 * Check if a value is encrypted
 */
export function isEncrypted(value: string): boolean {
  return value?.startsWith(ENCRYPTED_PREFIX) ?? false;
}

/**
 * Encrypt all sensitive fields in a config object
 * Returns a new object with sensitive fields encrypted
 */
export function encryptConfigSecrets<T extends Record<string, any>>(config: T): T {
  const result = { ...config };

  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'string' && isSensitiveField(key)) {
      (result as any)[key] = encryptSecret(value);
    }
  }

  return result;
}

/**
 * Decrypt all sensitive fields in a config object
 * Returns a new object with sensitive fields decrypted
 */
export function decryptConfigSecrets<T extends Record<string, any>>(config: T): T {
  const result = { ...config };

  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'string' && isEncrypted(value)) {
      (result as any)[key] = decryptSecret(value);
    }
  }

  return result;
}
