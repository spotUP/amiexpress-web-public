/**
 * Declarations for packages the tests use that ship no types and are not
 * direct dependencies (ws and js-yaml arrive transitively). Only the surface
 * the tests and src/server/ws-terminal-server.ts touch is declared; this file
 * is part of tsconfig.tests.json only, so the production build is unchanged.
 */
declare module 'ws' {
  import { EventEmitter } from 'events';
  import type { IncomingMessage } from 'http';
  import type { Duplex } from 'stream';

  export class WebSocket extends EventEmitter {
    constructor(url: string);
    close(): void;
    terminate(): void;
    send(data: string | Buffer, opts?: { binary?: boolean }): void;
  }

  export class WebSocketServer extends EventEmitter {
    constructor(options: { noServer: boolean });
    readonly clients: Set<WebSocket>;
    handleUpgrade(
      req: IncomingMessage,
      socket: Duplex,
      head: Buffer,
      cb: (ws: WebSocket) => void,
    ): void;
  }
}

declare module 'js-yaml' {
  export function load(input: string): unknown;
}
