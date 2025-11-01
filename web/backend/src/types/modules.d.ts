/**
 * Type declarations for modules without official @types packages
 */

declare module 'better-sqlite3' {
  const Database: any;
  export = Database;
}

declare module 'jsonwebtoken' {
  export function sign(payload: any, secretOrPrivateKey: string, options?: any): string;
  export function verify(token: string, secretOrPublicKey: string, options?: any): any;
  export function decode(token: string, options?: any): any;
}

declare module 'adm-zip' {
  interface IZipEntry {
    entryName: string;
    isDirectory: boolean;
    getData(): Buffer;
  }

  class AdmZip {
    constructor(filePath?: string);
    getEntries(): IZipEntry[];
    getEntry(name: string): IZipEntry | null;
    extractAllTo(targetPath: string, overwrite?: boolean): void;
    extractEntryTo(entry: string | IZipEntry, targetPath: string, maintainEntryPath?: boolean, overwrite?: boolean): void;
  }
  export = AdmZip;
}

declare module 'pako' {
  export function ungzip(data: Uint8Array): Uint8Array;
  export function inflate(data: Uint8Array): Uint8Array;
}

declare module 'tar-stream' {
  export function extract(): any;
  export function pack(): any;
}
