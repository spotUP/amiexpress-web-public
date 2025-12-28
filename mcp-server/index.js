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

// Core project files
const CORE_DOCS = {
  'claude-md': {
    path: path.join(PROJECT_ROOT, 'CLAUDE.md'),
    description: 'Main project guidelines and critical rules for AI development',
    mimeType: 'text/markdown'
  },
  'agents-md': {
    path: path.join(PROJECT_ROOT, 'AGENTS.md'),
    description: 'Amiga Guru agent role and door emulation rules',
    mimeType: 'text/markdown'
  },
  'handoff-md': {
    path: path.join(PROJECT_ROOT, 'handoff.md'),
    description: 'Current session handoff and progress tracking',
    mimeType: 'text/markdown'
  },
  'readme': {
    path: path.join(PROJECT_ROOT, 'README.md'),
    description: 'Project README with overview and quick start',
    mimeType: 'text/markdown'
  },
  'project-safety': {
    path: path.join(PROJECT_ROOT, 'PROJECT_SAFETY.md'),
    description: 'Project safety context and technical terms explanation (educational/historical preservation project)',
    mimeType: 'text/markdown'
  }
};

// Documentation index and navigation
const DOC_INDEX = {
  'documentation-index': {
    path: path.join(PROJECT_ROOT, 'Documentation', 'README.md'),
    description: 'Complete documentation index organized by role (Users/Sysops/Developers/Door-Developers)',
    mimeType: 'text/markdown'
  }
};

// User documentation
const USER_DOCS = {
  'user-guide': {
    path: path.join(PROJECT_ROOT, 'Documentation', '1-Users', 'USER_GUIDE.md'),
    description: 'Complete user guide for using the BBS (includes import guide)',
    mimeType: 'text/markdown'
  }
};

// Sysop documentation
const SYSOP_DOCS = {
  'installation': {
    path: path.join(PROJECT_ROOT, 'Documentation', '2-Sysops', 'INSTALLATION.md'),
    description: 'Installation guide with prerequisites and setup steps',
    mimeType: 'text/markdown'
  },
  'configuration': {
    path: path.join(PROJECT_ROOT, 'Documentation', '2-Sysops', 'CONFIGURATION.md'),
    description: 'BBS configuration guide',
    mimeType: 'text/markdown'
  },
  'administration': {
    path: path.join(PROJECT_ROOT, 'Documentation', '2-Sysops', 'ADMINISTRATION.md'),
    description: 'Day-to-day BBS administration',
    mimeType: 'text/markdown'
  },
  'deployment': {
    path: path.join(PROJECT_ROOT, 'Documentation', '2-Sysops', 'DEPLOYMENT.md'),
    description: 'Production deployment procedures',
    mimeType: 'text/markdown'
  },
  'troubleshooting': {
    path: path.join(PROJECT_ROOT, 'Documentation', '2-Sysops', 'TROUBLESHOOTING.md'),
    description: 'Common issues and solutions',
    mimeType: 'text/markdown'
  },
  'sysop-guide': {
    path: path.join(PROJECT_ROOT, 'Documentation', '2-Sysops', 'SYSOP_GUIDE.md'),
    description: 'Sysop guide for getting BBS running (was QUICK_START.md)',
    mimeType: 'text/markdown'
  },
  'ci-cd': {
    path: path.join(PROJECT_ROOT, 'Documentation', '2-Sysops', 'CI_CD.md'),
    description: 'Continuous integration and deployment configuration',
    mimeType: 'text/markdown'
  },
  'docker': {
    path: path.join(PROJECT_ROOT, 'Documentation', '2-Sysops', 'DOCKER.md'),
    description: 'Docker containerization guide',
    mimeType: 'text/markdown'
  }
};

// Developer documentation
const DEVELOPER_DOCS = {
  'getting-started': {
    path: path.join(PROJECT_ROOT, 'Documentation', '3-Developers', 'GETTING_STARTED.md'),
    description: 'Developer setup and getting started guide',
    mimeType: 'text/markdown'
  },
  'architecture': {
    path: path.join(PROJECT_ROOT, 'Documentation', '3-Developers', 'ARCHITECTURE.md'),
    description: 'System architecture and code organization',
    mimeType: 'text/markdown'
  },
  'database': {
    path: path.join(PROJECT_ROOT, 'Documentation', '3-Developers', 'DATABASE.md'),
    description: 'Database schema, rules, and management',
    mimeType: 'text/markdown'
  },
  'api-reference': {
    path: path.join(PROJECT_ROOT, 'Documentation', '3-Developers', 'API_REFERENCE.md'),
    description: 'Backend API reference',
    mimeType: 'text/markdown'
  },
  'testing': {
    path: path.join(PROJECT_ROOT, 'Documentation', '3-Developers', 'TESTING.md'),
    description: 'Testing guide with Puppeteer',
    mimeType: 'text/markdown'
  },
  'contributing': {
    path: path.join(PROJECT_ROOT, 'Documentation', '3-Developers', 'CONTRIBUTING.md'),
    description: 'Contribution guidelines',
    mimeType: 'text/markdown'
  },
  'multinode-chat': {
    path: path.join(PROJECT_ROOT, 'Documentation', '3-Developers', 'MULTINODE_CHAT.md'),
    description: 'Multi-node chat system architecture (692 lines)',
    mimeType: 'text/markdown'
  },
  'arexx-implementation': {
    path: path.join(PROJECT_ROOT, 'Documentation', '3-Developers', 'AREXX_IMPLEMENTATION.md'),
    description: 'AREXX interpreter implementation (629 lines)',
    mimeType: 'text/markdown'
  },
  'import-export-api': {
    path: path.join(PROJECT_ROOT, 'Documentation', '3-Developers', 'IMPORT_EXPORT_API.md'),
    description: 'Import/Export API reference (685 lines)',
    mimeType: 'text/markdown'
  },
  'dos-file-io': {
    path: path.join(PROJECT_ROOT, 'Documentation', '3-Developers', 'DOS_FILE_IO.md'),
    description: 'AmigaOS DOS file I/O implementation (495 lines)',
    mimeType: 'text/markdown'
  },
  'security': {
    path: path.join(PROJECT_ROOT, 'Documentation', '3-Developers', 'SECURITY.md'),
    description: 'Security patterns and fixes (567 lines)',
    mimeType: 'text/markdown'
  },
  'amigaguide': {
    path: path.join(PROJECT_ROOT, 'Documentation', '3-Developers', 'AMIGAGUIDE.md'),
    description: 'AmigaGuide format support (516 lines)',
    mimeType: 'text/markdown'
  },
  'telnet-ssh-servers': {
    path: path.join(PROJECT_ROOT, 'Documentation', '3-Developers', 'TELNET_SSH_SERVERS.md'),
    description: 'Telnet and SSH server implementation (296 lines)',
    mimeType: 'text/markdown'
  },
  'backend-architecture': {
    path: path.join(PROJECT_ROOT, 'Documentation', '3-Developers', 'BACKEND_ARCHITECTURE.md'),
    description: 'Backend code architecture and organization',
    mimeType: 'text/markdown'
  },
  'clean-architecture': {
    path: path.join(PROJECT_ROOT, 'Documentation', '3-Developers', 'CLEAN_ARCHITECTURE.md'),
    description: 'Clean architecture principles for the project',
    mimeType: 'text/markdown'
  },
  'moira-debugging': {
    path: path.join(PROJECT_ROOT, 'Documentation', '3-Developers', 'MOIRA_DEBUGGING.md'),
    description: 'Debugging 68K emulation with MOIRA',
    mimeType: 'text/markdown'
  },
  'operator-chat': {
    path: path.join(PROJECT_ROOT, 'Documentation', '3-Developers', 'OPERATOR_CHAT_IMPLEMENTATION.md'),
    description: 'Operator chat system implementation',
    mimeType: 'text/markdown'
  }
};

// Door developer documentation
const DOOR_DOCS = {
  'door-development': {
    path: path.join(PROJECT_ROOT, 'Documentation', '4-Door-Developers', 'DOOR_DEVELOPMENT.md'),
    description: 'Complete door development guide',
    mimeType: 'text/markdown'
  },
  'amiga-emulation': {
    path: path.join(PROJECT_ROOT, 'Documentation', '3-Developers', 'AMIGA_EMULATION.md'),
    description: 'AmigaOS emulation details',
    mimeType: 'text/markdown'
  },
  'aedoor-api': {
    path: path.join(PROJECT_ROOT, 'Documentation', '4-Door-Developers', 'AEDOOR_API.md'),
    description: 'AEDoor.library API reference',
    mimeType: 'text/markdown'
  },
  'dos-library-api': {
    path: path.join(PROJECT_ROOT, 'Documentation', '4-Door-Developers', 'DOS_LIBRARY_API.md'),
    description: 'dos.library API reference',
    mimeType: 'text/markdown'
  },
  'examples': {
    path: path.join(PROJECT_ROOT, 'Documentation', '4-Door-Developers', 'EXAMPLES.md'),
    description: 'Door development examples',
    mimeType: 'text/markdown'
  },
  'aedoor-disasm': {
    path: path.join(PROJECT_ROOT, 'Documentation', '7-Reference Sources', 'disasm', 'aedoor_library_disasm.asm'),
    description: 'AEDoor library disassembly',
    mimeType: 'text/plain'
  },
  'bulls-disasm': {
    path: path.join(PROJECT_ROOT, 'Documentation', '7-Reference Sources', 'disasm', 'bulls_disasm.asm'),
    description: 'Bulls door disassembly',
    mimeType: 'text/plain'
  },
  'import-export': {
    path: path.join(PROJECT_ROOT, 'Documentation', '4-Door-Developers', 'IMPORT_EXPORT.md'),
    description: 'Amiga BBS import/export implementation (780 lines)',
    mimeType: 'text/markdown'
  },
  'door-manager': {
    path: path.join(PROJECT_ROOT, 'Documentation', '4-Door-Developers', 'DOOR_MANAGER.md'),
    description: 'Door management system (493 lines)',
    mimeType: 'text/markdown'
  },
  '68k-door-development': {
    path: path.join(PROJECT_ROOT, 'Documentation', '4-Door-Developers', '68K_DOOR_DEVELOPMENT.md'),
    description: 'Native 68K Amiga door development guide',
    mimeType: 'text/markdown'
  },
  'c-door-development': {
    path: path.join(PROJECT_ROOT, 'Documentation', '4-Door-Developers', 'C_DOOR_DEVELOPMENT.md'),
    description: 'C language door development guide',
    mimeType: 'text/markdown'
  },
  'python-door-development': {
    path: path.join(PROJECT_ROOT, 'Documentation', '4-Door-Developers', 'PYTHON_DOOR_DEVELOPMENT.md'),
    description: 'Python door development guide',
    mimeType: 'text/markdown'
  },
  'typescript-door-guide': {
    path: path.join(PROJECT_ROOT, 'Documentation', '4-Door-Developers', 'TYPESCRIPT_DOOR_GUIDE.md'),
    description: 'TypeScript/SDK door development guide',
    mimeType: 'text/markdown'
  },
  'game-mode-mouse': {
    path: path.join(PROJECT_ROOT, 'Documentation', '4-Door-Developers', 'GAME_MODE_AND_MOUSE.md'),
    description: 'Game mode and mouse support for doors',
    mimeType: 'text/markdown'
  },
};

// SDK documentation (engine quick references)
const SDK_DOCS = {
  'sdk-neo-blessed-guide': {
    path: path.join(PROJECT_ROOT, 'sdk', 'docs', 'NEO_BLESSED_GUIDE.md'),
    description: 'Complete Neo-Blessed UI framework guide',
    mimeType: 'text/markdown'
  },
  'sdk-ui-blessed': {
    path: path.join(PROJECT_ROOT, 'sdk', 'docs', 'UI_BLESSED_QUICK_REFERENCE.md'),
    description: 'Neo-Blessed UI widgets quick reference',
    mimeType: 'text/markdown'
  },
  'sdk-network-guide': {
    path: path.join(PROJECT_ROOT, 'sdk', 'docs', 'NETWORK_ENGINE_GUIDE.md'),
    description: 'Network engine full documentation (multiplayer, lobbies, matchmaking)',
    mimeType: 'text/markdown'
  },
  'sdk-network': {
    path: path.join(PROJECT_ROOT, 'sdk', 'docs', 'NETWORK_ENGINE_QUICK_REFERENCE.md'),
    description: 'Network engine quick reference',
    mimeType: 'text/markdown'
  },
  'sdk-ai': {
    path: path.join(PROJECT_ROOT, 'sdk', 'docs', 'AI_ENGINE_QUICK_REFERENCE.md'),
    description: 'AI engine quick reference (behavior trees, FSM, pathfinding)',
    mimeType: 'text/markdown'
  },
  'sdk-audio': {
    path: path.join(PROJECT_ROOT, 'sdk', 'docs', 'AUDIO_ENGINE_QUICK_REFERENCE.md'),
    description: 'Audio engine quick reference (MOD, sound effects)',
    mimeType: 'text/markdown'
  },
  'sdk-cards': {
    path: path.join(PROJECT_ROOT, 'sdk', 'docs', 'CARDS_ENGINE_QUICK_REFERENCE.md'),
    description: 'Card game engine quick reference (deck, hand, poker)',
    mimeType: 'text/markdown'
  },
  'sdk-graphics': {
    path: path.join(PROJECT_ROOT, 'sdk', 'docs', 'GRAPHICS_ENGINE_QUICK_REFERENCE.md'),
    description: 'Graphics engine quick reference (sprites, tiles, animation)',
    mimeType: 'text/markdown'
  },
  'sdk-input': {
    path: path.join(PROJECT_ROOT, 'sdk', 'docs', 'INPUT_ENGINE_QUICK_REFERENCE.md'),
    description: 'Input engine quick reference (keyboard, mouse, gamepad)',
    mimeType: 'text/markdown'
  },
  'sdk-physics': {
    path: path.join(PROJECT_ROOT, 'sdk', 'docs', 'PHYSICS_ENGINE_QUICK_REFERENCE.md'),
    description: 'Physics engine quick reference (collision, gravity)',
    mimeType: 'text/markdown'
  },
  'sdk-poker': {
    path: path.join(PROJECT_ROOT, 'sdk', 'docs', 'POKER_ENGINE_QUICK_REFERENCE.md'),
    description: 'Poker engine quick reference (hand evaluation, betting)',
    mimeType: 'text/markdown'
  },
  'sdk-tactical': {
    path: path.join(PROJECT_ROOT, 'sdk', 'docs', 'TACTICAL_ENGINE_QUICK_REFERENCE.md'),
    description: 'Tactical RPG engine quick reference (grid, units, combat)',
    mimeType: 'text/markdown'
  },
};

// Reference documentation
const REFERENCE_DOCS = {
  'command-reference': {
    path: path.join(PROJECT_ROOT, 'Documentation', '5-Reference', 'COMMAND_REFERENCE.md'),
    description: 'Complete BBS command reference',
    mimeType: 'text/markdown'
  },
  'hotkeys': {
    path: path.join(PROJECT_ROOT, 'Documentation', '5-Reference', 'HOTKEYS.md'),
    description: 'Keyboard shortcuts and hotkeys',
    mimeType: 'text/markdown'
  },
  'mci-codes': {
    path: path.join(PROJECT_ROOT, 'Documentation', '5-Reference', 'MCI_CODES.md'),
    description: 'MCI codes reference',
    mimeType: 'text/markdown'
  },
  'screen-files': {
    path: path.join(PROJECT_ROOT, 'Documentation', '5-Reference', 'SCREEN_FILES.md'),
    description: 'Screen file format reference',
    mimeType: 'text/markdown'
  },
  'file-structure': {
    path: path.join(PROJECT_ROOT, 'Documentation', '5-Reference', 'FILE_STRUCTURE.md'),
    description: 'Project file structure',
    mimeType: 'text/markdown'
  },
};

// Progress and status documentation
const PROGRESS_DOCS = {
  'current-status': {
    path: path.join(PROJECT_ROOT, 'Documentation', '6-Progress', 'CURRENT_STATUS.md'),
    description: 'Current project status (~95% complete): what works, what\'s in progress',
    mimeType: 'text/markdown'
  },
  'known-issues': {
    path: path.join(PROJECT_ROOT, 'Documentation', '6-Progress', 'KNOWN_ISSUES.md'),
    description: 'Known bugs and workarounds',
    mimeType: 'text/markdown'
  },
  '68k-door-completion-plan': {
    path: path.join(PROJECT_ROOT, 'Documentation', '6-Progress', '68K_DOOR_COMPLETION_PLAN.md'),
    description: '68K door emulation completion plan (93% complete, Phase 3 polish remaining)',
    mimeType: 'text/markdown'
  }
};

// Reference sources (external references)
const REFERENCE_SOURCES = {
  'reference-sources-index': {
    path: path.join(PROJECT_ROOT, 'Documentation', '7-Reference Sources', 'README.md'),
    description: 'Index of reference source bundles and archives',
    mimeType: 'text/markdown'
  },
  'amiexpress-sources': {
    path: path.join(PROJECT_ROOT, 'Documentation', '7-Reference Sources', 'AmiExpress-Sources', 'README.md'),
    description: 'AmiExpress original sources documentation',
    mimeType: 'text/markdown'
  },
  'lvos': {
    path: path.join(PROJECT_ROOT, 'Documentation', '7-Reference Sources', 'LVOs.i'),
    description: 'AmigaOS Library Vector Offsets (LVO) definitions',
    mimeType: 'text/plain'
  },
  'bulls-log': {
    path: path.join(PROJECT_ROOT, 'Documentation', '7-Reference Sources', 'bulls.log'),
    description: 'Bulls door reference execution log',
    mimeType: 'text/plain'
  },
  'getanswer-notes': {
    path: path.join(PROJECT_ROOT, 'Documentation', '7-Reference Sources', 'disasm', 'GetAnswer_notes.md'),
    description: 'GetAnswer door disassembly notes (48 lines)',
    mimeType: 'text/markdown'
  },
  'testing-guide': {
    path: path.join(PROJECT_ROOT, 'Documentation', '7-Reference Sources', 'reference', 'TESTING_GUIDE.md'),
    description: 'Full BBS testing guide (archived)',
    mimeType: 'text/markdown'
  },
  'deployment-scripts': {
    path: path.join(PROJECT_ROOT, 'Documentation', '7-Reference Sources', 'reference', 'DEPLOYMENT_SCRIPTS.md'),
    description: 'Deployment scripts documentation (archived)',
    mimeType: 'text/markdown'
  },
  'webhooks': {
    path: path.join(PROJECT_ROOT, 'Documentation', '7-Reference Sources', 'reference', 'WEBHOOKS.md'),
    description: 'Webhook configuration guide (archived)',
    mimeType: 'text/markdown'
  },
  'ported-doors-catalog': {
    path: path.join(PROJECT_ROOT, 'Documentation', '7-Reference Sources', 'reference', 'PORTED_DOORS_CATALOG.md'),
    description: 'Catalog of ported E doors (archived)',
    mimeType: 'text/markdown'
  },
  'main-menu': {
    path: path.join(PROJECT_ROOT, 'Documentation', '7-Reference Sources', 'reference', 'MAIN_MENU.md'),
    description: 'AmiExpress main menu documentation (archived)',
    mimeType: 'text/markdown'
  },
  'milestones': {
    path: path.join(PROJECT_ROOT, 'Documentation', '7-Reference Sources', 'reference', 'MILESTONES.md'),
    description: 'Major project milestones (archived)',
    mimeType: 'text/markdown'
  },
  'masterplan': {
    path: path.join(PROJECT_ROOT, 'Documentation', '7-Reference Sources', 'reference', 'MASTERPLAN.md'),
    description: 'Overall project master plan (archived)',
    mimeType: 'text/markdown'
  },
  'implementation-roadmap': {
    path: path.join(PROJECT_ROOT, 'Documentation', '7-Reference Sources', 'reference', 'IMPLEMENTATION_ROADMAP.md'),
    description: 'Complete feature implementation roadmap (archived)',
    mimeType: 'text/markdown'
  },
  'door-sources-analysis': {
    path: path.join(PROJECT_ROOT, 'Documentation', '7-Reference Sources', 'research', 'DOOR_SOURCES_ANALYSIS.md'),
    description: 'AmiExpress door sources analysis (archived)',
    mimeType: 'text/markdown'
  },
  'door-research': {
    path: path.join(PROJECT_ROOT, 'Documentation', '7-Reference Sources', 'research', 'DOOR_RESEARCH.md'),
    description: 'Amiga door research and findings (archived)',
    mimeType: 'text/markdown'
  }
};

// AmiExpress source files (loaded on-demand only)
const SOURCES = {
  'express-e': {
    path: path.join(PROJECT_ROOT, 'Documentation', '7-Reference Sources', 'AmiExpress-Sources', 'express.e'),
    description: 'Original AmiExpress BBS source code in E language (35,000+ lines) - PRIMARY REFERENCE',
    mimeType: 'text/plain',
    moduleMap: path.join(__dirname, 'express-modules.json')
  },
  'hydra-e': {
    path: path.join(PROJECT_ROOT, 'Documentation', '7-Reference Sources', 'AmiExpress-Sources', 'hydra.e'),
    description: 'Hydra protocol implementation in E language (file transfer)',
    mimeType: 'text/plain'
  },
  'acp-e': {
    path: path.join(PROJECT_ROOT, 'Documentation', '7-Reference Sources', 'AmiExpress-Sources', 'ACP.e'),
    description: 'AmiExpress Control Panel source code (configuration tool)',
    mimeType: 'text/plain'
  },
  'zmodem-e': {
    path: path.join(PROJECT_ROOT, 'Documentation', '7-Reference Sources', 'AmiExpress-Sources', 'zmodem.e'),
    description: 'ZModem protocol implementation in E language (file transfer)',
    mimeType: 'text/plain'
  },
  'ftpd-e': {
    path: path.join(PROJECT_ROOT, 'Documentation', '7-Reference Sources', 'AmiExpress-Sources', 'ftpd.e'),
    description: 'FTP daemon implementation in E language',
    mimeType: 'text/plain'
  }
};

// Combine all documentation resources
const ALL_DOCS = {
  ...CORE_DOCS,
  ...DOC_INDEX,
  ...USER_DOCS,
  ...SYSOP_DOCS,
  ...DEVELOPER_DOCS,
  ...DOOR_DOCS,
  ...SDK_DOCS,
  ...REFERENCE_DOCS,
  ...PROGRESS_DOCS,
  ...REFERENCE_SOURCES
};

class AmiExpressDocsServer {
  constructor() {
    this.server = new Server(
      {
        name: 'amiexpress-docs-mcp-server',
        version: '2.0.0',
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
      for (const [key, doc] of Object.entries(ALL_DOCS)) {
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
        const doc = ALL_DOCS[docKey];

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
          },
          {
            name: 'read_express_module',
            description: 'Read express.e by logical module (mci, commands, doors, etc.) - more efficient than line ranges',
            inputSchema: {
              type: 'object',
              properties: {
                module: {
                  type: 'string',
                  description: 'Module name',
                  enum: [
                    'init', 'core', 'security', 'io', 'messaging', 'doors',
                    'commands', 'mci', 'display', 'rexx', 'windows', 'logging',
                    'mail', 'files', 'conference', 'internal-commands',
                    'command-priority', 'mainloop', 'startup'
                  ]
                }
              },
              required: ['module']
            }
          },
          {
            name: 'list_express_modules',
            description: 'List all available express.e modules with descriptions and line ranges',
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

      try {
        switch (name) {
          case 'search_docs':
            return await this.handleSearchDocs(args);
          case 'get_all_docs':
            return await this.handleGetAllDocs();
          case 'search_ndk_autodocs':
            return await this.handleSearchNDK(args);
          case 'read_source_range':
            return await this.handleReadSourceRange(args);
          case 'search_express_source':
            return await this.handleSearchExpressSource(args);
          case 'read_express_module':
            return await this.handleReadExpressModule(args);
          case 'list_express_modules':
            return await this.handleListExpressModules();
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${error.message}`
          }],
          isError: true
        };
      }
    });
  }

  async handleSearchDocs(args) {
    const { query, caseSensitive = false } = args;
    const results = [];
    const searchRegex = new RegExp(query, caseSensitive ? 'g' : 'gi');

    for (const [key, doc] of Object.entries(ALL_DOCS)) {
      try {
        const content = await fs.readFile(doc.path, 'utf-8');
        const lines = content.split('\n');
        const matches = [];

        lines.forEach((line, index) => {
          if (searchRegex.test(line)) {
            matches.push({
              line: index + 1,
              text: line.trim()
            });
          }
        });

        if (matches.length > 0) {
          results.push({
            document: key,
            path: doc.path,
            matches: matches.slice(0, 10)
          });
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(results, null, 2)
      }]
    };
  }

  async handleGetAllDocs() {
    const allContent = [];

    for (const [key, doc] of Object.entries(ALL_DOCS)) {
      try {
        const content = await fs.readFile(doc.path, 'utf-8');
        allContent.push(`\n\n=== ${key} ===\n${doc.description}\n\n${content}`);
      } catch (error) {
        allContent.push(`\n\n=== ${key} ===\nError: ${error.message}`);
      }
    }

    return {
      content: [{
        type: 'text',
        text: allContent.join('\n')
      }]
    };
  }

  async handleSearchNDK(args) {
    const { query, library = null } = args;
    const autodocsDir = path.join(
      PROJECT_ROOT,
      'Documentation',
      '7-Reference Sources',
      'NDK3.2R4',
      'Autodocs'
    );

    let files = [];
    try {
      files = await fs.readdir(autodocsDir);
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `NDK Autodocs directory not found: ${error.message}\nExpected: ${autodocsDir}`
        }],
        isError: true
      };
    }

    const escaped = String(query || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(escaped, 'i');
    const results = [];

    const candidates = files.filter((file) => file.toLowerCase().endsWith('.doc'));
    const filtered = library
      ? candidates.filter((file) => {
          const lower = file.toLowerCase();
          const lib = String(library).toLowerCase();
          return lower.startsWith(`${lib}.`) || lower.includes(`${lib}_`) || lower.includes(`${lib}-`);
        })
      : candidates;

    for (const file of filtered) {
      const filePath = path.join(autodocsDir, file);
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        const matches = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (!searchRegex.test(line)) continue;
          const start = Math.max(0, i - 2);
          const end = Math.min(lines.length, i + 3);
          const context = lines.slice(start, end).map((text, idx) => ({
            line: start + idx + 1,
            text: text.trimEnd()
          }));
          matches.push({
            line: i + 1,
            text: line.trimEnd(),
            context
          });
          if (matches.length >= 10) break;
        }

        if (matches.length > 0) {
          results.push({
            document: file,
            path: filePath,
            matches
          });
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          query,
          library,
          results
        }, null, 2)
      }]
    };
  }

  async handleReadSourceRange(args) {
    const { source, startLine, endLine } = args;
    const sourceKey = source;
    const sourceFile = SOURCES[sourceKey];

    if (!sourceFile) {
      throw new Error(`Unknown source: ${sourceKey}`);
    }

    const content = await fs.readFile(sourceFile.path, 'utf-8');
    const lines = content.split('\n');
    const selectedLines = lines.slice(startLine - 1, endLine);

    return {
      content: [{
        type: 'text',
        text: selectedLines.map((line, i) => `${startLine + i}: ${line}`).join('\n')
      }]
    };
  }

  async handleSearchExpressSource(args) {
    const { query, context = 3 } = args;
    const expressPath = SOURCES['express-e'].path;
    try {
      const content = await fs.readFile(expressPath, 'utf-8');
      const lines = content.split('\n');
      const results = [];

    lines.forEach((line, index) => {
      if (line.includes(query)) {
        const start = Math.max(0, index - context);
        const end = Math.min(lines.length, index + context + 1);
        const contextLines = lines.slice(start, end).map((l, i) =>
          `${start + i + 1}: ${l}`
        );
        results.push({
          line: index + 1,
          context: contextLines.join('\n')
        });
      }
    });

      return {
        content: [{
          type: 'text',
          text: `Found ${results.length} matches:\n\n${results.slice(0, 20).map(r => r.context).join('\n\n---\n\n')}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to search express.e: ${error.message} (path: ${expressPath})`);
    }
  }

  async handleReadExpressModule(args) {
    const { module } = args;
    const modulesPath = path.join(__dirname, 'express-modules.json');
    const modulesData = JSON.parse(await fs.readFile(modulesPath, 'utf-8'));
    const moduleInfo = modulesData.modules[module];

    if (!moduleInfo) {
      throw new Error(`Unknown module: ${module}. Available: ${Object.keys(modulesData.modules).join(', ')}`);
    }

    const expressPath = SOURCES['express-e'].path;
    const content = await fs.readFile(expressPath, 'utf-8');
    const lines = content.split('\n');
    const selectedLines = lines.slice(moduleInfo.startLine - 1, moduleInfo.endLine);

    return {
      content: [{
        type: 'text',
        text: `Module: ${module}\nDescription: ${moduleInfo.description}\nLines: ${moduleInfo.startLine}-${moduleInfo.endLine}\n\n${selectedLines.map((line, i) => `${moduleInfo.startLine + i}: ${line}`).join('\n')}`
      }]
    };
  }

  async handleListExpressModules() {
    const modulesPath = path.join(__dirname, 'express-modules.json');
    const modules = JSON.parse(await fs.readFile(modulesPath, 'utf-8'));

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(modules, null, 2)
      }]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('AmiExpress Docs MCP server running on stdio');
  }
}

const server = new AmiExpressDocsServer();
server.run().catch(console.error);
