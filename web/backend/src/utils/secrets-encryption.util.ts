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
  // The push signing key. config-repository.ts:1054 already decrypts it on
  // read; nothing was encrypting it on the way in, because no substring rule
  // matched the name.
  'vapid_private_key',
] as const;

export type SensitiveField = typeof SENSITIVE_FIELDS[number];

/**
 * Fields whose name looks sensitive but which the BBS itself must be able to
 * read, so they belong in bbsConfig.info in plain text.
 *
 * Encrypting one of these puts it somewhere express.e cannot look, and the
 * feature simply stops working with nothing to show for it. Add to this list
 * only when the Amiga side reads the value directly; anything the web backend
 * alone consumes should stay encrypted.
 */
const DISK_ONLY_FIELDS = new Set<string>([
  // express.e:30063 reads AUTOVAL_PASSWORD out of bbsConfig.info (falling back
  // to it from the node icon at :30062). It is a shared board password a
  // caller types to be auto-validated, not a credential of the sysop's, and
  // it sits in the same file as the rest of the board's configuration.
  'autoval_password',

  // The password POLICY. These describe the rules a password must satisfy;
  // none of them is a password. The substring rule below caught all five, so
  // they were encrypted into the database and served back masked - and since
  // the form posts what it was given straight back, "***" and null then
  // failed validation and no System Configuration save could succeed at all.
  //
  // Every one has a tooltype the BBS reads, so disk is where they belong.
  'min_password_length',
  'min_password_strength',
  'max_password_fails',
  'password_expiry_days',
  'password_security',
  'strict_password_policy',
]);

/** What a masked secret looks like on the way out of the API. */
export const MASKED_VALUE = '***';

/**
 * Is this the mask standing in for a secret, rather than a value?
 *
 * GET replaces every secret with MASKED_VALUE so it is never exposed. The
 * form posts all of its fields back, so without this the mask is written
 * straight over the secret it was hiding - the only guard dropped a secret
 * when it was EMPTY, and "***" is not empty.
 */
export function isMaskedValue(value: unknown): boolean {
  return typeof value === 'string' && value === MASKED_VALUE;
}

/**
 * Fields that live in the database rather than in bbsConfig.info, but are not
 * secret and must NOT be encrypted.
 *
 * "Is it a secret" and "where does it live" are different questions, and
 * conflating them lost the VAPID push settings: they are not sensitive by
 * name, so they were routed to the disk writer, which has no tooltype for
 * them and dropped them - while their columns sat empty in system_config.
 */
const DATABASE_ONLY_FIELDS = new Set<string>([
  // Web push is a web-BBS extension. express.e knows nothing about it, so
  // there is no tooltype for these to go to.
  'vapid_public_key',
  'vapid_contact_email',

  // A GDPR toggle deciding whether webhook payloads may carry personal
  // details. "webhook" in the name matched the secret rule; it is a boolean
  // about what a payload may contain, and it has a column of its own.
  'webhook_include_pii',
]);

/**
 * Does this field belong in the database rather than on disk, without being a
 * secret? Sensitive fields are database-resident too; this covers the rest.
 */
export function isDatabaseOnlyField(fieldName: string): boolean {
  return DATABASE_ONLY_FIELDS.has(fieldName.toLowerCase());
}

/**
 * Check if a field name is sensitive and should be encrypted
 */
export function isSensitiveField(fieldName: string): boolean {
  const lowerField = fieldName.toLowerCase();

  // Both lists name fields whose CONTENT is not secret, whatever their name
  // looks like. They are checked before the substring rules below, which
  // cannot tell a password from a rule about passwords.
  if (DISK_ONLY_FIELDS.has(lowerField) || DATABASE_ONLY_FIELDS.has(lowerField)) {
    return false;
  }
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
