"use strict";
/**
 * Database Connection
 *
 * Manages SQLite database connection for GRANDMASTER
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseConnection = void 0;
exports.getDatabase = getDatabase;
exports.closeDatabase = closeDatabase;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class DatabaseConnection {
    constructor(dbPath) {
        this.db = null;
        // Default to project data directory
        this.dbPath = dbPath || path.join(process.cwd(), 'data', 'grandmaster.db');
    }
    /**
     * Open database connection
     */
    open() {
        if (this.db) {
            return; // Already open
        }
        // Ensure directory exists
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        // Open database
        this.db = new better_sqlite3_1.default(this.dbPath);
        // Enable WAL mode for better concurrency
        this.db.pragma('journal_mode = WAL');
        // Enable foreign keys
        this.db.pragma('foreign_keys = ON');
        // Initialize schema
        this.initializeSchema();
    }
    /**
     * Get database instance
     */
    getDb() {
        if (!this.db) {
            this.open();
        }
        return this.db;
    }
    /**
     * Close database connection
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
    /**
     * Initialize database schema
     */
    initializeSchema() {
        if (!this.db)
            return;
        try {
            // Read schema file
            const schemaPath = path.join(__dirname, 'schema.sql');
            console.log('[DatabaseConnection] Reading schema from:', schemaPath);
            if (!fs.existsSync(schemaPath)) {
                console.error('[DatabaseConnection] Schema file not found at:', schemaPath);
                throw new Error(`Schema file not found: ${schemaPath}`);
            }
            const schema = fs.readFileSync(schemaPath, 'utf-8');
            console.log('[DatabaseConnection] Schema file loaded, size:', schema.length, 'bytes');
            // Execute schema (SQLite supports multiple statements)
            this.db.exec(schema);
            console.log('[DatabaseConnection] Schema initialized successfully');
        }
        catch (error) {
            console.error('[DatabaseConnection] Failed to initialize schema:', error);
            throw error;
        }
    }
    /**
     * Run migration
     */
    migrate(version, sql) {
        const db = this.getDb();
        // Create migrations table if not exists
        db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      )
    `);
        // Check if already applied
        const existing = db.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(version);
        if (existing) {
            return; // Already applied
        }
        // Run migration in transaction
        const transaction = db.transaction(() => {
            db.exec(sql);
            db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version);
        });
        transaction();
    }
    /**
     * Begin transaction
     */
    begin() {
        this.getDb().exec('BEGIN');
    }
    /**
     * Commit transaction
     */
    commit() {
        this.getDb().exec('COMMIT');
    }
    /**
     * Rollback transaction
     */
    rollback() {
        this.getDb().exec('ROLLBACK');
    }
}
exports.DatabaseConnection = DatabaseConnection;
// Singleton instance
let instance = null;
function getDatabase() {
    if (!instance) {
        instance = new DatabaseConnection();
        instance.open();
    }
    return instance;
}
function closeDatabase() {
    if (instance) {
        instance.close();
        instance = null;
    }
}
//# sourceMappingURL=connection.js.map