"use strict";
/**
 * TetriNET Server Browser
 *
 * Fetches and parses the TetriNET server list from the public API.
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TetriNetServerBrowser = void 0;
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
/**
 * Fetches and parses TetriNET server list from XML API
 */
class TetriNetServerBrowser extends blessed_1.EventEmitter {
    constructor() {
        super(...arguments);
        this.servers = [];
        this.apiUrl = 'https://servers.tetrinet.fr/api/xml/';
    }
    /**
     * Fetch servers from the public API
     */
    async fetchServers() {
        try {
            const https = await Promise.resolve().then(() => __importStar(require('https')));
            const xmlData = await new Promise((resolve, reject) => {
                const req = https.get(this.apiUrl, { timeout: 10000 }, (res) => {
                    if (res.statusCode !== 200) {
                        reject(new Error(`Failed to fetch servers: ${res.statusCode}`));
                        return;
                    }
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => resolve(data));
                });
                req.on('error', reject);
                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error('Fetch timeout'));
                });
            });
            this.servers = this.parseXml(xmlData);
            return this.servers;
        }
        catch (error) {
            console.error('[TetriNetServerBrowser] Error fetching servers:', error);
            return [];
        }
    }
    /**
     * Get cached servers
     */
    getServers() {
        return this.servers;
    }
    /**
     * Simple XML parser using regex to avoid external dependencies
     */
    parseXml(xml) {
        const servers = [];
        // Find all <server> blocks
        const serverRegex = /<server>([\s\S]*?)<\/server>/g;
        let match;
        while ((match = serverRegex.exec(xml)) !== null) {
            const content = match[1];
            const server = {
                name: this.extractTag(content, 'name'),
                host: this.extractTag(content, 'host'),
                port: parseInt(this.extractTag(content, 'port') || '31457', 10),
                players: parseInt(this.extractTag(content, 'players') || '0', 10),
                maxPlayers: parseInt(this.extractTag(content, 'maxplayers') || '0', 10),
                version: this.extractTag(content, 'version'),
                country: this.extractTag(content, 'country'),
                uptime: this.extractTag(content, 'uptime')
            };
            if (server.host) {
                servers.push(server);
            }
        }
        return servers;
    }
    /**
     * Extract content from a specific XML tag
     */
    extractTag(xml, tag) {
        const regex = new RegExp(`<${tag}>(.*?)<\/${tag}>`, 'i');
        const match = xml.match(regex);
        if (match && match[1]) {
            // Decode simple XML entities if present
            return match[1]
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&apos;/g, "'")
                .trim();
        }
        return '';
    }
}
exports.TetriNetServerBrowser = TetriNetServerBrowser;
//# sourceMappingURL=tetrinet-server-browser.js.map