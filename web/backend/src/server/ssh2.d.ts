/**
 * Type declarations for ssh2 module
 * The @types/ssh2 package exists but has version compatibility issues
 * This provides minimal type definitions for our usage
 */

declare module 'ssh2' {
  import { EventEmitter } from 'events';

  export class Server extends EventEmitter {
    constructor(options: ServerOptions, connectionListener?: (client: Connection) => void);
    listen(port: number, hostname?: string, callback?: () => void): void;
    close(callback?: () => void): void;
  }

  export interface ServerOptions {
    hostKeys: Buffer[];
  }

  export class Connection extends EventEmitter {
    end(): void;
  }

  export type AcceptConnection<T> = () => T;
}
