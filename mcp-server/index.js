#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Documentation files to expose as MCP resources
const DOCS = {
  'claude-md': {
    path: path.join(PROJECT_ROOT, 'CLAUDE.md'),
    description: 'Main project guidelines and critical rules',
    mimeType: 'text/markdown'
  },
  'documentation-index': {
    path: path.join(PROJECT_ROOT, 'Documentation', 'README.md'),
    description: 'Complete documentation index organized by role (Users/Sysops/Developers/Door-Developers)',
    mimeType: 'text/markdown'
  },
  'user-guide': {
    path: path.join(PROJECT_ROOT, 'Documentation', '1-Users', 'USER_GUIDE.md'),
    description: 'Complete user guide for using the BBS (500+ lines)',
    mimeType: 'text/markdown'
  },
  'deployment': {
    path: path.join(PROJECT_ROOT, 'Documentation', '2-Sysops', 'DEPLOYMENT.md'),
    description: 'Production deployment procedures and troubleshooting',
    mimeType: 'text/markdown'
  },
  'architecture': {
    path: path.join(PROJECT_ROOT, 'Documentation', '3-Developers', 'ARCHITECTURE.md'),
    description: 'System architecture, modularization, and code structure',
    mimeType: 'text/markdown'
  },
  'database': {
    path: path.join(PROJECT_ROOT, 'Documentation', '3-Developers', 'DATABASE.md'),
    description: 'Database management rules (column names, UNIQUE constraints, init patterns)',
    mimeType: 'text/markdown'
  },
  'testing': {
    path: path.join(PROJECT_ROOT, 'Documentation', '3-Developers', 'TESTING.md'),
    description: 'Complete guide for testing BBS features with Puppeteer',
    mimeType: 'text/markdown'
  },
  'door-development': {
    path: path.join(PROJECT_ROOT, 'Documentation', '4-Door-Developers', 'DOOR_DEVELOPMENT.md'),
    description: 'Complete guide for implementing Amiga door functions',
    mimeType: 'text/markdown'
  },
  'amiga-emulation': {
    path: path.join(PROJECT_ROOT, 'Documentation', '4-Door-Developers', 'AMIGA_EMULATION.md'),
    description: 'AmigaOS documentation, vAmiga sources, and Amiga emulation details',
    mimeType: 'text/markdown'
  }
};

class AmiExpressDocsServer {
  constructor() {
    this.server = new Server(
      {
        name: 'amiexpress-docs-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.setupErrorHandling();
  }

  setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  setupHandlers() {
    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources = [];

      for (const [key, doc] of Object.entries(DOCS)) {
        try {
          await fs.access(doc.path);
          resources.push({
            uri: `amiexpress://docs/${key}`,
            mimeType: doc.mimeType,
            name: key,
            description: doc.description
          });
        } catch (error) {
          console.error(`[MCP] Document not found: ${doc.path}`);
        }
      }

      return { resources };
    });

    // Read a specific resource
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;
      const match = uri.match(/^amiexpress:\/\/docs\/(.+)$/);

      if (!match) {
        throw new Error(`Invalid URI: ${uri}`);
      }

      const docKey = match[1];
      const doc = DOCS[docKey];

      if (!doc) {
        throw new Error(`Unknown document: ${docKey}`);
      }

      try {
        const content = await fs.readFile(doc.path, 'utf-8');
        return {
          contents: [{
            uri,
            mimeType: doc.mimeType,
            text: content
          }]
        };
      } catch (error) {
        throw new Error(`Failed to read ${docKey}: ${error.message}`);
      }
    });

    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'search_docs',
            description: 'Search across all AmiExpress documentation for a keyword or phrase',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query (keyword or phrase)'
                },
                caseSensitive: {
                  type: 'boolean',
                  description: 'Whether search should be case-sensitive',
                  default: false
                }
              },
              required: ['query']
            }
          },
          {
            name: 'get_all_docs',
            description: 'Get all documentation as a single combined resource (use sparingly)',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          }
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (name === 'search_docs') {
        return await this.searchDocs(args.query, args.caseSensitive ?? false);
      } else if (name === 'get_all_docs') {
        return await this.getAllDocs();
      } else {
        throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  async searchDocs(query, caseSensitive = false) {
    const results = [];
    const searchQuery = caseSensitive ? query : query.toLowerCase();

    for (const [key, doc] of Object.entries(DOCS)) {
      try {
        const content = await fs.readFile(doc.path, 'utf-8');
        const searchContent = caseSensitive ? content : content.toLowerCase();
        const lines = content.split('\n');

        let matches = [];
        lines.forEach((line, index) => {
          const searchLine = caseSensitive ? line : line.toLowerCase();
          if (searchLine.includes(searchQuery)) {
            matches.push({
              line: index + 1,
              text: line.trim(),
              context: lines.slice(Math.max(0, index - 1), Math.min(lines.length, index + 2)).join('\n')
            });
          }
        });

        if (matches.length > 0) {
          results.push({
            document: key,
            description: doc.description,
            matches: matches.slice(0, 10) // Limit to 10 matches per doc
          });
        }
      } catch (error) {
        console.error(`[MCP] Failed to search ${key}: ${error.message}`);
      }
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ query, results, totalDocuments: results.length }, null, 2)
      }]
    };
  }

  async getAllDocs() {
    const allDocs = [];

    for (const [key, doc] of Object.entries(DOCS)) {
      try {
        const content = await fs.readFile(doc.path, 'utf-8');
        allDocs.push({
          name: key,
          description: doc.description,
          content: content
        });
      } catch (error) {
        console.error(`[MCP] Failed to read ${key}: ${error.message}`);
      }
    }

    const combined = allDocs.map(doc =>
      `# ${doc.name}\n\n${doc.description}\n\n${doc.content}\n\n---\n\n`
    ).join('\n');

    return {
      content: [{
        type: 'text',
        text: combined
      }]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('AmiExpress Docs MCP Server running on stdio');
  }
}

const server = new AmiExpressDocsServer();
server.run().catch(console.error);
