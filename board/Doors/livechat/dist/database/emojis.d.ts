/** Custom emojis table schema */
export declare const EMOJIS_TABLE = "\nCREATE TABLE IF NOT EXISTS chat_custom_emojis (\n  code TEXT PRIMARY KEY,\n  name TEXT NOT NULL,\n  ascii_art TEXT NOT NULL,\n  created_by INTEGER,\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP\n)";
/** Default BBS emojis */
export declare const DEFAULT_EMOJIS: {
    code: string;
    name: string;
    ascii: string;
}[];
/** Custom emoji repository */
export declare class EmojiRepository {
    private db;
    constructor(db: any);
    getAll(): Promise<any[]>;
    get(code: string): Promise<any>;
    create(code: string, name: string, ascii: string, createdBy: number): Promise<void>;
    delete(code: string): Promise<void>;
}
