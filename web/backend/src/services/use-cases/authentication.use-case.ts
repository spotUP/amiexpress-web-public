/**
 * Authentication Use Case
 *
 * Clean Architecture: Business logic for user authentication
 * Isolates authentication logic from handlers and database
 */

import { injectable, inject } from 'tsyringe';
import { DI_TOKENS } from '../../container';

export interface AuthenticationResult {
  success: boolean;
  user?: any;
  error?: string;
}

@injectable()
export class AuthenticationUseCase {
  constructor(
    @inject(DI_TOKENS.Database) private db: any
  ) {}

  /**
   * Authenticate a user with username and password
   * Handles case-insensitive password matching (for C64 uppercase input)
   */
  async authenticate(username: string, password: string): Promise<AuthenticationResult> {
    try {
      // Try lowercase first (for C64 uppercase input)
      const passwordLower = password.toLowerCase();
      let user = await this.db.authenticateUser(username, passwordLower);

      // If lowercase failed and original password is different, try original case
      if (!user && password !== passwordLower) {
        user = await this.db.authenticateUser(username, password);
      }

      if (!user) {
        return {
          success: false,
          error: 'Invalid username or password'
        };
      }

      return {
        success: true,
        user
      };
    } catch (error) {
console.error('[AuthenticationUseCase] Authentication error:', error);
      return {
        success: false,
        error: 'Authentication failed'
      };
    }
  }

  /**
   * Verify user credentials (without full authentication flow)
   */
  async verifyCredentials(username: string, password: string): Promise<boolean> {
    const result = await this.authenticate(username, password);
    return result.success;
  }
}
