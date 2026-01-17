/**
 * Type declarations for zmodem.js module
 * ZMODEM file transfer protocol implementation
 */

declare module 'zmodem.js' {
  export interface SentryOptions {
    to_terminal: (data: any) => void;
    sender: (data: any) => void;
    on_detect: (detection: Detection) => void;
    on_retract?: () => void;
  }

  export interface Detection {
    confirm(): ZmodemSession;
    deny(): void;
    is_valid(): boolean;
  }

  export interface ZmodemSession {
    // Session control
    abort(): void;
    close(): void;
    has_ended(): boolean;
    type: 'send' | 'receive';

    // For receive sessions
    on(event: 'offer', callback: (offer: FileOffer) => void): void;
    on(event: 'session_end', callback: () => void): void;
    start(): void;

    // For send sessions
    send_offer(fileInfo: FileInfo): Promise<Transfer | null>;
  }

  export interface FileOffer {
    name: string;
    size: number;
    mtime: Date | null;
    mode: number | null;
    serial: number | null;
    files_remaining: number | null;
    bytes_remaining: number | null;

    accept(opts?: { on_input?: (data: Uint8Array) => void }): Transfer;
    skip(): void;
  }

  export interface FileInfo {
    name: string;
    size: number;
    mtime?: Date;
    mode?: number;
    files_remaining?: number;
    bytes_remaining?: number;
  }

  export interface Transfer {
    // For receive transfers
    on(event: 'input', callback: (data: Uint8Array) => void): void;
    end(): Promise<void>;

    // For send transfers
    send(data: Uint8Array): Promise<void>;

    // Progress tracking
    get_details(): {
      name: string;
      size: number;
      bytes_sent?: number;
    };
  }

  export class Sentry {
    constructor(options: SentryOptions);
    consume(data: Uint8Array | Buffer | number[]): void;
    get_confirmed_session(): ZmodemSession | null;
    abort(): void;
  }

  export namespace Header {
    function build(type: string, options?: any): {
      to_binary(): number[];
      to_hex(): number[];
      get_name(): string;
    };
  }

  export const ZMACHINE_CONSTANTS: {
    ZRQINIT: number;
    ZRINIT: number;
    ZSINIT: number;
    ZACK: number;
    ZFILE: number;
    ZSKIP: number;
    ZNAK: number;
    ZABORT: number;
    ZFIN: number;
    ZRPOS: number;
    ZDATA: number;
    ZEOF: number;
    ZFERR: number;
    ZCRC: number;
    ZCHALLENGE: number;
    ZCOMPL: number;
    ZCAN: number;
    ZFREECNT: number;
    ZCOMMAND: number;
    ZSTDERR: number;
  };
}
