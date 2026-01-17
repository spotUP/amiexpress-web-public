/**
 * Type declarations for modules without official TypeScript definitions
 */

declare module 'zmodem.js' {
  export interface SentryOptions {
    to_terminal?: (octets: number[]) => void;
    on_detect?: (detection: any) => void;
    on_retract?: () => void;
    sender?: (octets: number[]) => void;
  }

  export class Sentry {
    constructor(options: SentryOptions);
    consume(data: Uint8Array | Buffer): void;
    get_confirmed_session(): any | null;
  }

  export class Header {
    static build(type: string): {
      to_hex(): number[];
    };
  }

  export class Session {
    constructor();
  }

  export function Browser(options?: any): any;
}

declare module 'pako' {
  export function inflate(data: Uint8Array | Buffer): Uint8Array;
  export function deflate(data: Uint8Array | Buffer): Uint8Array;
  export function ungzip(data: Uint8Array | Buffer): Uint8Array;
  export function gzip(data: Uint8Array | Buffer): Uint8Array;
}
