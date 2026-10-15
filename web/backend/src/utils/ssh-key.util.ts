/**
 * SSH Key Management Utility
 *
 * Provides functionality for generating, deleting, and managing SSH host keys
 * for the BBS SSH server.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync, unlinkSync, statSync } from 'fs';
import { join } from 'path';
import * as crypto from 'crypto';

const execAsync = promisify(exec);

export interface SSHKeyInfo {
  exists: boolean;
  path?: string;
  publicKeyPath?: string;
  fingerprint?: string;
  keyType?: string;
  keySize?: number;
  createdAt?: Date;
}

export interface SSHKeyGenerationResult {
  success: boolean;
  privateKeyPath: string;
  publicKeyPath: string;
  fingerprint: string;
  error?: string;
}

export class SSHKeyUtil {
  /**
   * Get the default SSH key directory path
   */
  static getKeyDirectory(): string {
    const dataDir = process.env.DATABASE_DIR || join(process.cwd(), 'data');
    return join(dataDir, 'ssh');
  }

  /**
   * Get the default SSH private key path
   */
  static getPrivateKeyPath(): string {
    return join(this.getKeyDirectory(), 'ssh_host_rsa_key');
  }

  /**
   * Get the default SSH public key path
   */
  static getPublicKeyPath(): string {
    return join(this.getKeyDirectory(), 'ssh_host_rsa_key.pub');
  }

  /**
   * Check if SSH host keys exist
   */
  static keyExists(): boolean {
    const privateKeyPath = this.getPrivateKeyPath();
    return existsSync(privateKeyPath);
  }

  /**
   * Get information about the current SSH key
   */
  static async getKeyInfo(): Promise<SSHKeyInfo> {
    const privateKeyPath = this.getPrivateKeyPath();
    const publicKeyPath = this.getPublicKeyPath();

    if (!existsSync(privateKeyPath)) {
      return { exists: false };
    }

    try {
      const stats = statSync(privateKeyPath);
      const fingerprint = await this.getKeyFingerprint(privateKeyPath);

      // Read the private key to determine type and size
      const keyContent = readFileSync(privateKeyPath, 'utf8');
      let keyType = 'RSA';
      let keySize = 0;

      // Parse key type from PEM header
      if (keyContent.includes('BEGIN RSA PRIVATE KEY')) {
        keyType = 'RSA';
        // Try to determine key size from the key content
        try {
          const keyBuffer = readFileSync(privateKeyPath);
          const privateKey = crypto.createPrivateKey({
            key: keyBuffer,
            format: 'pem',
            type: 'pkcs1'
          });
          const keyDetails = privateKey.export({ format: 'jwk' }) as any;
          if (keyDetails.n) {
            // Calculate key size from modulus length (in bits)
            keySize = Buffer.from(keyDetails.n, 'base64').length * 8;
          }
        } catch (error) {
          // If we can't parse, default to 4096 (most common)
          keySize = 4096;
        }
      } else if (keyContent.includes('BEGIN EC PRIVATE KEY')) {
        keyType = 'EC';
      } else if (keyContent.includes('BEGIN OPENSSH PRIVATE KEY')) {
        keyType = 'ED25519';
      }

      return {
        exists: true,
        path: privateKeyPath,
        publicKeyPath: publicKeyPath,
        fingerprint,
        keyType,
        keySize: keySize || undefined,
        createdAt: stats.mtime
      };
    } catch (error) {
console.error('[SSH Key] Error getting key info:', error);
      return {
        exists: true,
        path: privateKeyPath,
        publicKeyPath: publicKeyPath
      };
    }
  }

  /**
   * Get the SSH key fingerprint
   */
  static async getKeyFingerprint(keyPath: string): Promise<string> {
    try {
      const { stdout } = await execAsync(`ssh-keygen -l -f "${keyPath}"`);
      // Output format: "2048 SHA256:xxx.... root@host (RSA)"
      // We want to extract the fingerprint part
      const parts = stdout.trim().split(' ');
      if (parts.length >= 2) {
        return parts[1]; // SHA256:xxx...
      }
      return stdout.trim();
    } catch (error) {
console.error('[SSH Key] Error getting fingerprint:', error);
      return 'Unknown';
    }
  }

  /**
   * Generate a new SSH host key
   * @param keySize The size of the RSA key (default: 4096)
   * @param overwrite Whether to overwrite existing keys (default: false)
   */
  static async generateKey(keySize: number = 4096, overwrite: boolean = false): Promise<SSHKeyGenerationResult> {
    const privateKeyPath = this.getPrivateKeyPath();
    const publicKeyPath = this.getPublicKeyPath();
    const keyDir = this.getKeyDirectory();

    // Check if key already exists
    if (this.keyExists() && !overwrite) {
      return {
        success: false,
        privateKeyPath,
        publicKeyPath,
        fingerprint: '',
        error: 'SSH key already exists. Use overwrite option to replace it.'
      };
    }

    try {
      // Ensure key directory exists
      await execAsync(`mkdir -p "${keyDir}"`);

      // Generate the key using ssh-keygen
      // -t rsa: RSA key type
      // -b 4096: Key size
      // -f path: Output file path
      // -N "": Empty passphrase
      // -C comment: Key comment
      const command = `ssh-keygen -t rsa -b ${keySize} -f "${privateKeyPath}" -N "" -C "AmiExpress BBS Host Key"`;

      await execAsync(command);

      // Set proper permissions on the private key (readable only by owner)
      await execAsync(`chmod 600 "${privateKeyPath}"`);

      // Get the fingerprint
      const fingerprint = await this.getKeyFingerprint(privateKeyPath);

console.log(`[SSH Key] Generated new SSH host key at ${privateKeyPath}`);
console.log(`[SSH Key] Fingerprint: ${fingerprint}`);

      return {
        success: true,
        privateKeyPath,
        publicKeyPath,
        fingerprint
      };
    } catch (error: any) {
console.error('[SSH Key] Error generating SSH key:', error);
      return {
        success: false,
        privateKeyPath,
        publicKeyPath,
        fingerprint: '',
        error: error.message || 'Failed to generate SSH key'
      };
    }
  }

  /**
   * Delete the SSH host key
   */
  static async deleteKey(): Promise<{ success: boolean; error?: string }> {
    const privateKeyPath = this.getPrivateKeyPath();
    const publicKeyPath = this.getPublicKeyPath();

    if (!this.keyExists()) {
      return {
        success: false,
        error: 'SSH key does not exist'
      };
    }

    try {
      // Delete private key
      if (existsSync(privateKeyPath)) {
        unlinkSync(privateKeyPath);
console.log(`[SSH Key] Deleted private key: ${privateKeyPath}`);
      }

      // Delete public key
      if (existsSync(publicKeyPath)) {
        unlinkSync(publicKeyPath);
console.log(`[SSH Key] Deleted public key: ${publicKeyPath}`);
      }

      return { success: true };
    } catch (error: any) {
console.error('[SSH Key] Error deleting SSH key:', error);
      return {
        success: false,
        error: error.message || 'Failed to delete SSH key'
      };
    }
  }

  /**
   * Load the SSH host key for use with the SSH server
   */
  static loadHostKey(): Buffer | null {
    const privateKeyPath = this.getPrivateKeyPath();

    if (!existsSync(privateKeyPath)) {
console.warn(`[SSH Key] No SSH host key found at ${privateKeyPath}`);
      return null;
    }

    try {
      const keyBuffer = readFileSync(privateKeyPath);
console.log(`[SSH Key] Loaded SSH host key from ${privateKeyPath}`);
      return keyBuffer;
    } catch (error) {
console.error(`[SSH Key] Failed to load SSH host key:`, error);
      return null;
    }
  }
}
