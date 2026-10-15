/**
 * TetriNET Server Browser
 *
 * Fetches and parses the TetriNET server list from the public API.
 */
import { EventEmitter } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
export interface TetriNetServer {
    name: string;
    host: string;
    port: number;
    players: number;
    maxPlayers: number;
    version: string;
    country: string;
    uptime: string;
}
/**
 * Fetches and parses TetriNET server list from XML API
 */
export declare class TetriNetServerBrowser extends EventEmitter {
    private servers;
    private apiUrl;
    /**
     * Fetch servers from the public API
     */
    fetchServers(): Promise<TetriNetServer[]>;
    /**
     * Get cached servers
     */
    getServers(): TetriNetServer[];
    /**
     * Simple XML parser using regex to avoid external dependencies
     */
    private parseXml;
    /**
     * Extract content from a specific XML tag
     */
    private extractTag;
}
//# sourceMappingURL=tetrinet-server-browser.d.ts.map