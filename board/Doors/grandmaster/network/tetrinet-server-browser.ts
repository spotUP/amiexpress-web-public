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
export class TetriNetServerBrowser extends EventEmitter {
  private servers: TetriNetServer[] = [];
  private apiUrl = 'https://servers.tetrinet.fr/api/xml/';

  /**
   * Fetch servers from the public API
   */
  async fetchServers(): Promise<TetriNetServer[]> {
    try {
      const https = await import('https');
      const xmlData = await new Promise<string>((resolve, reject) => {
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
    } catch (error) {
      console.error('[TetriNetServerBrowser] Error fetching servers:', error);
      return [];
    }
  }

  /**
   * Get cached servers
   */
  getServers(): TetriNetServer[] {
    return this.servers;
  }

  /**
   * Simple XML parser using regex to avoid external dependencies
   */
  private parseXml(xml: string): TetriNetServer[] {
    const servers: TetriNetServer[] = [];
    
    // Find all <server> blocks
    const serverRegex = /<server>([\s\S]*?)<\/server>/g;
    let match;

    while ((match = serverRegex.exec(xml)) !== null) {
      const content = match[1];
      
      const server: TetriNetServer = {
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
  private extractTag(xml: string, tag: string): string {
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
