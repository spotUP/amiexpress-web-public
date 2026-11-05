"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrate = migrate;
const schema = __importStar(require("./schema"));
const schema2 = __importStar(require("./schema2"));
const indexes_1 = require("./indexes");
const emojis_1 = require("./emojis");
/** Default channels */
const DEFAULTS = [
    { id: 'general', name: 'general', display: 'General', topic: 'Welcome!' },
    { id: 'random', name: 'random', display: 'Random', topic: 'Off-topic' },
    { id: 'help', name: 'help', display: 'Help', topic: 'Get help' },
    { id: 'system', name: 'system', display: 'System', topic: 'Events' }
];
/** Run all migrations */
async function migrate(db) {
    await db.exec(schema.CHANNELS_TABLE);
    await db.exec(schema.MEMBERS_TABLE);
    await db.exec(schema.MESSAGES_TABLE);
    await db.exec(schema.REACTIONS_TABLE);
    await db.exec(schema2.PINNED_TABLE);
    await db.exec(schema2.PRESENCE_TABLE);
    await db.exec(schema2.PREFS_TABLE);
    await db.exec(schema2.EVENTS_TABLE);
    await db.exec(schema2.INVITES_TABLE);
    await db.exec(emojis_1.EMOJIS_TABLE);
    await (0, indexes_1.createIndexes)(db);
    for (const ch of DEFAULTS) {
        await db.run(`INSERT OR IGNORE INTO chat_channels (id, name, display_name, topic, type, category)
       VALUES (?, ?, ?, ?, 'public', 'Public')`, [ch.id, ch.name, ch.display, ch.topic]);
    }
    for (const e of emojis_1.DEFAULT_EMOJIS) {
        await db.run(`INSERT OR IGNORE INTO chat_custom_emojis (code, name, ascii_art) VALUES (?, ?, ?)`, [e.code, e.name, e.ascii]);
    }
}
