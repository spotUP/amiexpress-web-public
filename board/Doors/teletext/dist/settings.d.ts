export interface TeletextSettings {
    /** Pack id to open directly, or '' for the service list. */
    defaultService: string;
    /** Carousel dwell for a page that does not carry its own CT timing. */
    dwellSeconds: number;
    /** How block graphics are drawn for a caller who is not in teletext mode. */
    mosaicStyle: 'ascii' | 'sextant';
    /** Whether V reveals concealed text. */
    allowReveal: boolean;
}
export declare const DEFAULT_SETTINGS: TeletextSettings;
export declare function applySettings(raw: Record<string, string | number | boolean>): TeletextSettings;
export declare function loadSettings(): TeletextSettings;
