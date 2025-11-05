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
  'current-status': {
    path: path.join(PROJECT_ROOT, 'Documentation', '6-Progress', 'CURRENT_STATUS.md'),
    description: 'Current project status: what works, what\'s in progress, known issues',
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
  },
  'mci-codes': {
    path: path.join(PROJECT_ROOT, 'Docs', 'MCI_CODES_TODO.md'),
    description: 'Complete MCI codes implementation status (52/60+ codes, priorities, reference)',
    mimeType: 'text/markdown'
  }
};

// Large reference source files (loaded on-demand only)
const SOURCES = {
  'express-e': {
    path: path.join(PROJECT_ROOT, 'AmiExpress-Sources', 'express.e'),
    description: 'Original AmiExpress BBS source code in E language (35,000+ lines) - PRIMARY REFERENCE',
    mimeType: 'text/plain'
  },
  'hydra-e': {
    path: path.join(PROJECT_ROOT, 'AmiExpress-Sources', 'hydra.e'),
    description: 'Hydra protocol implementation in E language',
    mimeType: 'text/plain'
  },
  'acp-e': {
    path: path.join(PROJECT_ROOT, 'AmiExpress-Sources', 'ACP.e'),
    description: 'AmiExpress Control Panel source code',
    mimeType: 'text/plain'
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

      // Add documentation resources
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

      // Add source file resources (on-demand only)
      for (const [key, src] of Object.entries(SOURCES)) {
        try {
          await fs.access(src.path);
          resources.push({
            uri: `amiexpress://sources/${key}`,
            mimeType: src.mimeType,
            name: key,
            description: src.description
          });
        } catch (error) {
          console.error(`[MCP] Source not found: ${src.path}`);
        }
      }

      return { resources };
    });

    // Read a specific resource
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;

      // Check for source files first
      const sourceMatch = uri.match(/^amiexpress:\/\/sources\/(.+)$/);
      if (sourceMatch) {
        const sourceKey = sourceMatch[1];
        const source = SOURCES[sourceKey];

        if (!source) {
          throw new Error(`Unknown source: ${sourceKey}`);
        }

        try {
          const content = await fs.readFile(source.path, 'utf-8');
          return {
            contents: [{
              uri,
              mimeType: source.mimeType,
              text: content
            }]
          };
        } catch (error) {
          throw new Error(`Failed to read ${sourceKey}: ${error.message}`);
        }
      }

      // Check for documentation files
      const docMatch = uri.match(/^amiexpress:\/\/docs\/(.+)$/);
      if (docMatch) {
        const docKey = docMatch[1];
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
      }

      throw new Error(`Invalid URI: ${uri}`);
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
          },
          {
            name: 'search_ndk_autodocs',
            description: 'Search NDK 3.2R4 Autodocs (30MB) for AmigaOS function specifications',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Function name or keyword to search for'
                },
                library: {
                  type: 'string',
                  description: 'Optional: specific library to search (dos, exec, graphics, intuition, etc.)',
                  default: null
                }
              },
              required: ['query']
            }
          },
          {
            name: 'read_source_range',
            description: 'Read specific line range from express.e source file (98% token savings vs full read)',
            inputSchema: {
              type: 'object',
              properties: {
                source: {
                  type: 'string',
                  description: 'Source file to read (express-e, hydra-e, acp-e)',
                  enum: ['express-e', 'hydra-e', 'acp-e']
                },
                startLine: {
                  type: 'number',
                  description: 'Starting line number (1-indexed)'
                },
                endLine: {
                  type: 'number',
                  description: 'Ending line number (inclusive)'
                }
              },
              required: ['source', 'startLine', 'endLine']
            }
          },
          {
            name: 'search_express_source',
            description: 'Search express.e source code for commands, functions, or keywords',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Keyword or pattern to search for'
                },
                context: {
                  type: 'number',
                  description: 'Number of context lines to show around matches',
                  default: 3
                }
              },
              required: ['query']
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
      } else if (name === 'search_ndk_autodocs') {
        return await this.searchNDKAutodocs(args.query, args.library ?? null);
      } else if (name === 'read_source_range') {
        return await this.readSourceRange(args.source, args.startLine, args.endLine);
      } else if (name === 'search_express_source') {
        return await this.searchExpressSource(args.query, args.context ?? 3);
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

  async searchNDKAutodocs(query, library = null) {
    const autodocsPath = path.join(PROJECT_ROOT, 'NDK3.2R4', 'Autodocs');
    const results = [];

    try {
      // Determine which files to search
      let filesToSearch = [];
      if (library) {
        const libraryFile = path.join(autodocsPath, library);
        try {
          await fs.access(libraryFile);
          filesToSearch.push({ name: library, path: libraryFile });
        } catch {
          throw new Error(`Library not found: ${library}`);
        }
      } else {
        // Search all autodoc files
        const files = await fs.readdir(autodocsPath);
        filesToSearch = files
          .filter(f => !f.startsWith('.'))
          .map(f => ({ name: f, path: path.join(autodocsPath, f) }));
      }

      // Search each file
      for (const file of filesToSearch) {
        try {
          const content = await fs.readFile(file.path, 'utf-8');
          const lines = content.split('\n');

          // Search for @Node entries matching the query
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Check if this is a function node matching our query
            if (line.includes('@Node') && line.toLowerCase().includes(query.toLowerCase())) {
              // Extract function name
              const match = line.match(/@Node\s+"([^"]+)"/);
              const functionName = match ? match[1] : 'Unknown';

              // Collect the full function documentation (next ~50 lines or until next @Node)
              let docLines = [line];
              for (let j = i + 1; j < Math.min(i + 100, lines.length); j++) {
                if (lines[j].includes('@Node')) break;
                docLines.push(lines[j]);
              }

              results.push({
                library: file.name,
                function: functionName,
                documentation: docLines.join('\n'),
                lineNumber: i + 1
              });
            }
          }
        } catch (error) {
          console.error(`[MCP] Failed to search ${file.name}: ${error.message}`);
        }
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            query,
            library: library || 'all',
            totalMatches: results.length,
            results: results.slice(0, 5) // Limit to 5 results to avoid huge responses
          }, null, 2)
        }]
      };
    } catch (error) {
      throw new Error(`Failed to search NDK autodocs: ${error.message}`);
    }
  }

  async readSourceRange(sourceKey, startLine, endLine) {
    const source = SOURCES[sourceKey];
    if (!source) {
      throw new Error(`Unknown source: ${sourceKey}`);
    }

    try {
      const content = await fs.readFile(source.path, 'utf-8');
      const lines = content.split('\n');

      // Validate line numbers
      if (startLine < 1 || startLine > lines.length) {
        throw new Error(`Invalid start line: ${startLine} (file has ${lines.length} lines)`);
      }
      if (endLine < startLine || endLine > lines.length) {
        throw new Error(`Invalid end line: ${endLine} (must be between ${startLine} and ${lines.length})`);
      }

      // Extract the requested range (convert to 0-indexed)
      const extractedLines = lines.slice(startLine - 1, endLine);

      // Format with line numbers
      const formatted = extractedLines.map((line, idx) =>
        `${String(startLine + idx).padStart(5, ' ')}: ${line}`
      ).join('\n');

      return {
        content: [{
          type: 'text',
          text: `Source: ${sourceKey}\nLines: ${startLine}-${endLine}\nTotal lines in file: ${lines.length}\n\n${formatted}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to read source range: ${error.message}`);
    }
  }

  async searchExpressSource(query, contextLines = 3) {
    const source = SOURCES['express-e'];

    try {
      const content = await fs.readFile(source.path, 'utf-8');
      const lines = content.split('\n');
      const matches = [];

      // Search for matches
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(query.toLowerCase())) {
          // Calculate context range
          const startCtx = Math.max(0, i - contextLines);
          const endCtx = Math.min(lines.length - 1, i + contextLines);

          // Extract context
          const contextBlock = [];
          for (let j = startCtx; j <= endCtx; j++) {
            const prefix = j === i ? '>>> ' : '    ';
            contextBlock.push(`${prefix}${String(j + 1).padStart(5, ' ')}: ${lines[j]}`);
          }

          matches.push({
            line: i + 1,
            text: lines[i].trim(),
            context: contextBlock.join('\n')
          });
        }
      }

      // Limit results to prevent huge responses
      const limitedMatches = matches.slice(0, 20);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            query,
            totalMatches: matches.length,
            showing: limitedMatches.length,
            matches: limitedMatches
          }, null, 2)
        }]
      };
    } catch (error) {
      throw new Error(`Failed to search express.e: ${error.message}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('AmiExpress Docs MCP Server running on stdio');
  }
}

const server = new AmiExpressDocsServer();
server.run().catch(console.error);
