declare module 'zmodem.js';
declare module 'pako';
/**
 * xml2js ships no types, but news-bulletins.ts needs one real signature out of
 * it - the rest of the parse result is read through `any` on purpose, because a
 * feed's shape is exactly what that parse is being asked to discover.
 */
declare module 'xml2js' {
  export interface Xml2jsOptions {
    explicitArray?: boolean;
    [key: string]: unknown;
  }
  export function parseString(
    xml: string,
    options: Xml2jsOptions,
    callback: (err: Error | null, result: unknown) => void,
  ): void;
  /** Doors/whip/core/party-calendar.ts builds a Parser and awaits parseStringPromise. */
  export class Parser {
    constructor(options?: Xml2jsOptions);
    parseStringPromise(xml: string): Promise<unknown>;
  }
}
