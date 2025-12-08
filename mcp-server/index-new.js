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
    description: 'Critical rules and project guidelines',
    mimeType: 'text/markdown'
  },
  'agents-md': {
    path: path.join(PROJECT_ROOT, 'AGENTS.md'),
    description: 'Amiga Guru agent role with MCP usage guide',
    mimeType: 'text/markdown'
  },
  'handoff-md': {
    path: path.join(PROJECT_ROOT, 'handoff.md'),
    description: 'Current session handoff',
    mimeType: 'text/markdown'
  },
  'readme': {
    path: path.join(PROJECT_ROOT, 'README.md'),
    description: 'Project overview and quick start',
    mimeType: 'text/markdown'
  },
  'project-safety': {
    path: path.join(PROJECT_ROOT, 'PROJECT_SAFETY.md'),
    description: 'Safety context and technical terms explanation',
    mimeType: 'text/markdown'
  }
};

// Essential user-facing documentation
const USER_DOCS = {
  'user-guide': {
    path: path.join(PROJECT_ROOT, 'Documentation', '1-Users', 'USER_GUIDE.md'),
    description: 'Complete BBS user guide',
    mimeType: 'text/markdown'
  }
};

// Essential sysop documentation
const SYSOP_DOCS = {
  'sysop-guide': {
    path: path.join(PROJECT_ROOT, 'Documentation', '2-Sysops', 'SYSOP_GUIDE.md'),
    description: 'Complete sysop installation and administration guide',
    mimeType: 'text/markdown'
  },
  'installation': {
    path: path.join(PROJECT_ROOT, 'Documentation', '2-Sysops', 'INSTALLATION.md'),
    description: 'Installation quick reference',
    mimeType: 'text/markdown'
  },
  'configuration': {
    path: path.join(PROJECT_ROOT, 'Documentation', '2-Sysops', 'CONFIGURATION.md'),
    description: 'Configuration quick reference',
    mimeType: 'text/markdown'
  },
  'administration': {
    path: path.join(PROJECT_ROOT, 'Documentation', '2-Sysops', 'ADMINISTRATION.md'),
    description: 'Administration quick reference',
    mimeType: 'text/markdown'
  },
  'deployment': {
    path: path.join(PROJECT_ROOT, 'Documentation', '2-Sysops', 'DEPLOYMENT.md'),
    description: 'Deployment quick reference',
    mimeType: 'text/markdown'
  },
  'troubleshooting': {
    path: path.join(PROJECT_ROOT, 'Documentation', '2-Sysops', 'TROUBLESHOOTING.md'),
    description: 'Troubleshooting guide',
    mimeType: 'text/markdown'
  }
};

// Essential developer documentation
const DEVELOPER_DOCS = {
  'getting-started': {
    path: path.join(PROJECT_ROOT, 'Documentation', '3-Developers', 'GETTING_STARTED.md'),
    description: 'Developer setup quick reference',
    mimeType: 'text/markdown'
  },
  'architecture': {
    path: path.join(PROJECT_ROOT, 'Documentation', '3-Developers', 'ARCHITECTURE.md'),
    description: 'Architecture overview',
    mimeType: 'text/markdown'
  },
  'database': {
    path: path.join(PROJECT_ROOT, 'Documentation', '3-Developers', 'DATABASE.md'),
    description: 'Database schema overview',
    mimeType: 'text/markdown'
  },
  'api-reference': {
    path: path.join(PROJECT_ROOT, 'Documentation', '3-Developers', 'API_REFERENCE.md'),
    description: 'API quick reference',
    mimeType: 'text/markdown'
  },
  'testing': {
    path: path.join(PROJECT_ROOT, 'Documentation', '3-Developers', 'TESTING.md'),
    description: 'Testing overview',
    mimeType: 'text/markdown'
  },
  'contributing': {
    path: path.join(PROJECT_ROOT, 'Documentation', '3-Developers', 'CONTRIBUTING.md'),
    description: 'Contribution guidelines',
    mimeType: 'text/markdown'
  }
};

// Essential door developer documentation
const DOOR_DOCS = {
  'door-development': {
    path: path.join(PROJECT_ROOT, 'Documentation', '4-Door-Developers', 'DOOR_DEVELOPMENT.md'),
    description: 'Door development overview',
    mimeType: 'text/markdown'
  },
  'amiga-emulation': {
    path: path.join(PROJECT_ROOT, 'Documentation', '4-Door-Developers', 'AMIGA_EMULATION.md'),
    description: 'Emulation overview',
    mimeType: 'text/markdown'
  },
  'aedoor-api': {
    path: path.join(PROJECT_ROOT, 'Documentation', '4-Door-Developers', 'AEDOOR_API.md'),
    description: 'AEDoor library reference',
    mimeType: 'text/markdown'
  },
  'dos-library-api': {
    path: path.join(PROJECT_ROOT, 'Documentation', '4-Door-Developers', 'DOS_LIBRARY_API.md'),
    description: 'DOS library reference',
    mimeType: 'text/markdown'
  },
  'examples': {
    path: path.join(PROJECT_ROOT, 'Documentation', '4-Door-Developers', 'EXAMPLES.md'),
    description: 'Door examples',
    mimeType: 'text/markdown'
  }
};

// Quick reference docs
const REFERENCE_DOCS = {
  'command-reference': {
    path: path.join(PROJECT_ROOT, 'Documentation', '5-Reference', 'COMMAND_REFERENCE.md'),
    description: 'BBS command reference',
    mimeType: 'text/markdown'
  },
  'hotkeys': {
    path: path.join(PROJECT_ROOT, 'Documentation', '5-Reference', 'HOTKEYS.md'),
    description: 'Keyboard shortcuts',
    mimeType: 'text/markdown'
  },
  'mci-codes': {
    path: path.join(PROJECT_ROOT, 'Documentation', '5-Reference', 'MCI_CODES.md'),
    description: 'MCI code reference',
    mimeType: 'text/markdown'
  },
  'screen-files': {
    path: path.join(PROJECT_ROOT, 'Documentation', '5-Reference', 'SCREEN_FILES.md'),
    description: 'Screen file format',
    mimeType: 'text/markdown'
  },
  'file-structure': {
    path: path.join(PROJECT_ROOT, 'Documentation', '5-Reference', 'FILE_STRUCTURE.md'),
    description: 'Project structure',
    mimeType: 'text/markdown'
  }
};

// Progress tracking
const PROGRESS_DOCS = {
  'current-status': {
    path: path.join(PROJECT_ROOT, 'Documentation', '6-Progress', 'CURRENT_STATUS.md'),
    description: 'Current implementation status',
    mimeType: 'text/markdown'
  },
  'known-issues': {
    path: path.join(PROJECT_ROOT, 'Documentation', '6-Progress', 'KNOWN_ISSUES.md'),
    description: 'Known bugs and workarounds',
    mimeType: 'text/markdown'
  },
  'progress-history': {
    path: path.join(PROJECT_ROOT, 'Documentation', '6-Progress', 'PROGRESS_HISTORY.md'),
    description: 'Complete project milestone history',
    mimeType: 'text/markdown'
  }
};

// Reference materials (archived but accessible)
const REFERENCE_MATERIALS = {
  'testing-guide': {
    path: path.join(PROJECT_ROOT, 'Documentation', '7-Reference Sources', 'reference', 'TESTING_GUIDE.md'),
    description: 'Comprehensive testing methodology',
    mimeType: 'text/markdown'
  },
  'webhooks': {
    path: path.join(PROJECT_ROOT, 'Documentation', '7-Reference Sources', 'reference', 'WEBHOOKS.md'),
    description: 'Webhook configuration reference',
    mimeType: 'text/markdown'
  },
  'deployment-scripts': {
    path: path.join(PROJECT_ROOT, 'Documentation', '7-Reference Sources', 'reference', 'DEPLOYMENT_SCRIPTS.md'),
    description: 'Deployment automation scripts',
    mimeType: 'text/markdown'
  },
  'main-menu': {
    path: path.join(PROJECT_ROOT, 'Documentation', '7-Reference Sources', 'reference', 'MAIN_MENU.md'),
    description: 'Classic AmiExpress main menu documentation',
    mimeType: 'text/markdown'
  },
  'ported-doors': {
    path: path.join(PROJECT_ROOT, 'Documentation', '7-Reference Sources', 'reference', 'PORTED_DOORS_CATALOG.md'),
    description: 'Catalog of ported doors',
    mimeType: 'text/markdown'
  },
  'roadmap': {
    path: path.join(PROJECT_ROOT, 'Documentation', '7-Reference Sources', 'reference', 'IMPLEMENTATION_ROADMAP.md'),
    description: 'Implementation roadmap',
    mimeType: 'text/markdown'
  }
};

// Combine all documentation
const ALL_DOCS = {
  ...CORE_DOCS,
  ...USER_DOCS,
  ...SYSOP_DOCS,
  ...DEVELOPER_DOCS,
  ...DOOR_DOCS,
  ...REFERENCE_DOCS,
  ...PROGRESS_DOCS,
  ...REFERENCE_MATERIALS
};

// Source code files (via MCP tools only)
const EXPRESS_E_PATH = path.join(PROJECT_ROOT, 'Documentation', '7-Reference Sources', 'AmiExpress-Sources', 'Express.e');

// ... [REST OF THE ORIGINAL MCP SERVER CODE WITH TOOLS] ...
// (I'll keep this abbreviated since we're focused on the resource changes)

export { server };
