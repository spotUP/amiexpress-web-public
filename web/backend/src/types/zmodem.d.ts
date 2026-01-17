/**
 * Type declarations for zmodem.js
 * @see https://github.com/nickcoutsos/node-zmodem
 */

declare module 'zmodem.js' {
  export interface SentryOptions {
    to_terminal: (octets: number[]) => void;
    on_detect: (detection: Detection) => void;
    on_retract?: () => void;
    sender?: (octets: number[]) => void;
  }

  export interface Detection {
    confirm: () => Session;
    deny: () => void;
    is_valid: () => boolean;
  }

  export interface Session {
    type: 'send' | 'receive';
    abort: () => void;
    has_ended: () => boolean;

    // For receive sessions
    on: (event: string, callback: (...args: any[]) => void) => void;
    start: () => void;

    // For send sessions
    send_offer: (file: FileOffer) => Promise<Transfer | null>;
    close: () => Promise<void>;
  }

  export interface FileOffer {
    name: string;
    size: number;
    mtime?: Date;
    mode?: number;
    files_remaining?: number;
    bytes_remaining?: number;
  }

  export interface Transfer {
    end: (data?: Uint8Array | number[]) => Promise<void>;
    skip: () => void;
  }

  export interface Offer {
    name: string;
    size: number;
    mtime: Date | null;
    mode: number | null;
    accept: (options?: { on_input?: (payload: Uint8Array) => void }) => Transfer;
    skip: () => void;
  }

  export class Sentry {
    constructor(options: SentryOptions);
    consume(data: Uint8Array | Buffer | number[]): void;
    get_confirmed_session(): Session | null;
    abort(): void;
  }

  export class Browser {
    static send_files(
      session: Session,
      files: File[],
      options?: { on_offer_response?: (file: File, transfer: Transfer | null) => void }
    ): Promise<void>;
  }

  export const ZMLIB_VERSION: string;

  export namespace Header {
    function build(type: string, options?: any): {
      to_binary(): number[];
      to_hex(): number[];
      get_name(): string;
    };
    function parse(data: Uint8Array | number[]): any;
  }
}
