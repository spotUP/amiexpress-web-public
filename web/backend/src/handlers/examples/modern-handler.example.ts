/**
 * Modern Handler Example (Clean Architecture)
 *
 * This example demonstrates the recommended pattern for new handlers:
 * - Class-based with @injectable decorator
 * - Constructor injection of dependencies
 * - Thin adapter layer (delegates to use cases)
 * - Easy to test (inject mocks)
 *
 * USE THIS PATTERN FOR ALL NEW HANDLERS
 */

import { injectable, inject } from 'tsyringe';
import { DI_TOKENS } from '../../container';
import { Socket } from 'socket.io';
import { BBSSession } from '../../index';

/**
 * Example Handler (Clean Architecture Pattern)
 *
 * This handler demonstrates proper separation of concerns:
 * 1. Handler: Thin adapter (Socket.IO → Business Logic)
 * 2. Use Case: Business logic (injected via DI)
 * 3. Repository: Data access (injected into use case)
 */
@injectable()
export class ModernHandler {
  constructor(
    @inject(DI_TOKENS.Database) private db: any,
    @inject(DI_TOKENS.Config) private config: any
  ) {
console.log('[ModernHandler] Initialized with DI');
  }

  /**
   * Register Socket.IO event handlers
   */
  registerHandlers(socket: Socket, session: BBSSession): void {
    socket.on('example-command', (data) => this.handleExampleCommand(socket, session, data));
    socket.on('example-query', (data) => this.handleExampleQuery(socket, session, data));
  }

  /**
   * Handle example command (write operation)
   */
  private async handleExampleCommand(socket: Socket, session: BBSSession, data: any): Promise<void> {
    try {
      // Validate input (handler responsibility)
      if (!data.value) {
        socket.emit('error', { message: 'Value required' });
        return;
      }

      // Delegate to use case service (business logic)
      // In real code, inject use case via constructor
      const result = await this.performBusinessLogic(data.value);

      // Format response (handler responsibility)
      socket.emit('example-result', {
        success: true,
        result
      });
    } catch (error) {
      // Error handling (handler responsibility)
console.error('[ModernHandler] Command error:', error);
      socket.emit('error', {
        message: 'Command failed',
        details: (error as Error).message
      });
    }
  }

  /**
   * Handle example query (read operation)
   */
  private async handleExampleQuery(socket: Socket, session: BBSSession, data: any): Promise<void> {
    try {
      // Use injected dependencies (Clean Architecture)
      const result = await this.db.query('SELECT * FROM example WHERE id = ?', [data.id]);

      socket.emit('example-data', {
        success: true,
        data: result
      });
    } catch (error) {
console.error('[ModernHandler] Query error:', error);
      socket.emit('error', { message: 'Query failed' });
    }
  }

  /**
   * Business logic (should be in use case service in real code)
   */
  private async performBusinessLogic(value: string): Promise<any> {
    // This is just an example - real business logic should be in use case
    const processed = value.toUpperCase();
    await this.db.save({ value: processed });
    return { processed };
  }
}

/**
 * Factory function to create and register handler (backward compatible)
 */
export function registerModernHandler(socket: Socket, session: BBSSession): void {
  const { container } = require('../../container');
  const handler = container.resolve(ModernHandler);
  handler.registerHandlers(socket, session);
}

/**
 * Testing Example:
 *
 * ```typescript
 * describe('ModernHandler', () => {
 *   let handler: ModernHandler;
 *   let mockDb: any;
 *   let mockConfig: any;
 *   let mockSocket: any;
 *   let mockSession: any;
 *
 *   beforeEach(() => {
 *     // Create mocks
 *     mockDb = { query: jest.fn(), save: jest.fn() };
 *     mockConfig = { get: jest.fn() };
 *     mockSocket = { emit: jest.fn(), on: jest.fn() };
 *     mockSession = { userId: '123' };
 *
 *     // Create handler with mocked dependencies
 *     handler = new ModernHandler(mockDb, mockConfig);
 *   });
 *
 *   it('should handle example command', async () => {
 *     mockDb.save.mockResolvedValue({ id: 1 });
 *
 *     await handler.handleExampleCommand(mockSocket, mockSession, { value: 'test' });
 *
 *     expect(mockDb.save).toHaveBeenCalledWith({ value: 'TEST' });
 *     expect(mockSocket.emit).toHaveBeenCalledWith('example-result', expect.objectContaining({
 *       success: true
 *     }));
 *   });
 *
 *   it('should reject invalid input', async () => {
 *     await handler.handleExampleCommand(mockSocket, mockSession, {});
 *
 *     expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
 *       message: 'Value required'
 *     }));
 *   });
 * });
 * ```
 */
