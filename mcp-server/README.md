# AmiExpress Documentation MCP Server

This MCP (Model Context Protocol) server provides access to all AmiExpress-Web documentation and source code for Claude and other AI assistants.

## Version 2.1 - Cleanup and Organization

**Updated**: 2025-12-08
**Total Resources**: 55+ documentation files + 5 source files

## What's New in v2.1

- **Removed 20 Duplicate Archive Files**: Deleted exact copies that were promoted to active directories
- **Added PROJECT_SAFETY.md**: Moved to project root for AI safety context
- **Added TELNET_SSH_SERVERS.md**: Promoted to 3-Developers/ (296 lines)
- **Fixed MCP Paths**: All resources now point to correct active file locations
- **Removed Obsolete Stubs**: Cleaned up redirect-only files

## Available Resources

### Core Project Files (5)
- `claude-md` - Main project guidelines and critical rules
- `agents-md` - Amiga Guru agent role and door emulation rules (includes MCP usage guide)
- `handoff-md` - Current session handoff
- `readme` - Project README
- `project-safety` - Project safety context and technical terms (306 lines)

### User Documentation (2)
- `user-guide` - Complete user guide (594 lines)
- `importing` - Import from classic Amiga BBS (507 lines)

### Sysop Documentation (8)
- `installation` - Installation guide
- `configuration` - Configuration guide
- `administration` - Administration guide
- `deployment` - Deployment guide
- `troubleshooting` - Troubleshooting guide
- `quick-start` - Quick start guide (632 lines)
- `deployment-scripts` - Deployment automation (743 lines)
- `webhooks` - Webhook configuration (501 lines)

### Developer Documentation (17)
- `getting-started` - Development setup
- `architecture` - System architecture
- `database` - Database schema and rules
- `api-reference` - Backend API
- `testing` - Testing with Puppeteer
- `contributing` - Contribution guidelines
- `testing-guide-full` - Complete testing guide (634 lines)
- `arexx-implementation` - AREXX interpreter (629 lines)
- `multinode-chat` - Chat system architecture (692 lines)
- `import-export-api` - Data migration API (685 lines)
- `dos-file-io` - AmigaOS file operations (495 lines)
- `security` - Security patterns (567 lines)
- `amigaguide` - AmigaGuide format (516 lines)
- `telnet-ssh-servers` - Telnet/SSH implementation (296 lines)
- `sdk-*` - SDK documentation (6 guides)

### Door Developer Documentation (11)
- `door-development` - Complete door guide
- `amiga-emulation` - Emulation details
- `aedoor-api` - AEDoor.library reference
- `dos-library-api` - dos.library reference
- `examples` - Example doors
- `door-sources-analysis` - Original door analysis (1069 lines)
- `door-research` - Research findings (905 lines)
- `import-export` - BBS data migration (780 lines)
- `ported-doors-catalog` - Available doors (729 lines)
- `door-manager` - Door management (493 lines)
- `config-app` - Web config interface (2264 lines)

### Reference Documentation (6)
- `command-reference` - All BBS commands
- `hotkeys` - Keyboard shortcuts
- `mci-codes` - MCI code reference
- `screen-files` - Screen file format
- `file-structure` - Project organization
- `main-menu` - Classic menu system (720 lines)

### Progress & Status (6)
- `current-status` - Implementation status
- `progress-history` - Complete milestone history (consolidated from 119 reports)
- `implementation-roadmap` - Complete feature roadmap (1043 lines)
- `milestones` - Major achievements
- `masterplan` - Overall project plan
- `known-issues` - Known bugs and workarounds

### Reference Sources (5)
- `reference-sources-index` - Index of reference bundles
- `amiexpress-sources` - Original sources documentation
- `lvos` - AmigaOS Library Vector Offsets
- `bulls-log` - Bulls door reference log
- `getanswer-notes` - GetAnswer disassembly notes

### Source Files (5)
- `express-e` - Original AmiExpress BBS source (35,000+ lines)
- `hydra-e` - Hydra protocol implementation
- `acp-e` - AmiExpress Control Panel
- `zmodem-e` - ZModem protocol
- `ftpd-e` - FTP daemon

## Available Tools

### search_docs
Search across all documentation for keywords or phrases.

```typescript
{
  query: string,
  caseSensitive?: boolean
}
```

### get_all_docs
Get all documentation as a single combined resource (use sparingly due to size).

### search_ndk_autodocs
Search NDK 3.2R4 Autodocs for AmigaOS function specifications.

```typescript
{
  query: string,
  library?: string  // dos, exec, graphics, intuition, etc.
}
```

### read_source_range
Read specific line range from express.e source file (98% token savings vs full read).

```typescript
{
  source: 'express-e' | 'hydra-e' | 'acp-e',
  startLine: number,
  endLine: number
}
```

### search_express_source
Search express.e source code for commands, functions, or keywords.

```typescript
{
  query: string,
  context?: number  // lines of context (default: 3)
}
```

### read_express_module
Read express.e by logical module (more efficient than line ranges).

```typescript
{
  module: 'init' | 'core' | 'security' | 'io' | 'messaging' | 'doors' |
          'commands' | 'mci' | 'display' | 'rexx' | 'windows' | 'logging' |
          'mail' | 'files' | 'conference' | 'internal-commands' |
          'command-priority' | 'mainloop' | 'startup'
}
```

### list_express_modules
List all available express.e modules with descriptions and line ranges.

### search_ndk_structs
Search NDK 3.1 structs, constants, and library functions by name. Returns field layouts, offsets, LVOs, register assignments.

```typescript
{
  query: string,           // name to search (case-insensitive substring)
  type?: 'all' | 'structs' | 'constants' | 'functions',
  library?: string         // e.g. "dos.library", "exec.library"
}
```

**Source:** amiga-reversing knowledge base (NDK 3.1 parsed includes)

### search_hw_registers
Search Amiga custom chip hardware registers by name or address. Returns register function, access mode, chip, and bit definitions.

```typescript
{
  query: string  // register name (e.g. "DMACON") or hex address (e.g. "DFF096")
}
```

**Source:** amiga-reversing knowledge base (Hardware Reference Manual)

### search_m68k_isa
Search M68K instruction set by mnemonic or keyword. Returns syntax, operation, condition codes, description.

```typescript
{
  query: string  // mnemonic (e.g. "MOVE", "JSR") or keyword in description
}
```

**Source:** amiga-reversing knowledge base (Motorola M68K PRM)

## Usage in Claude Desktop

The MCP server is already configured in `.mcp.json`. Available tools will appear automatically in Claude Desktop.

### Quick Examples

**Find AREXX implementation:**
```
Use mcp__amiexpress-docs__search_docs with query "AREXX"
```

**Read door development guide:**
```
Access resource: amiexpress://docs/door-development
```

**Search express.e source:**
```
Use mcp__amiexpress-docs__search_express_source with query "StrCmp(cmdcode,'DOWNLOAD')"
```

## Documentation Organization

All documentation follows this structure:

- **1-Users/** - End-user guides
- **2-Sysops/** - System operator guides
- **3-Developers/** - Developer guides
- **4-Door-Developers/** - Door development guides
- **5-Reference/** - Quick reference materials
- **6-Progress/** - Status tracking
- **7-Reference Sources/** - External reference archives

Important docs are now in active directories, historical session logs remain in `archive/` subdirectories.

## Changes from v1.0

### Promoted from Archives (20 files)
1. User Guide (594 lines)
2. Importing Guide (507 lines)
3. Quick Start (632 lines)
4. Deployment Scripts (743 lines)
5. Webhooks (501 lines)
6. AREXX Implementation (629 lines)
7. Multi-Node Chat (692 lines)
8. Import/Export API (685 lines)
9. Testing Guide (634 lines)
10. DOS File I/O (495 lines)
11. Security (567 lines)
12. AmigaGuide (516 lines)
13. Door Sources Analysis (1069 lines)
14. Door Research (905 lines)
15. Import/Export (780 lines)
16. Ported Doors Catalog (729 lines)
17. Door Manager (493 lines)
18. Config App (2264 lines)
19. Main Menu (720 lines)
20. Implementation Roadmap (1043 lines)

### Removed
- `backend-amiexpress-docs/` (duplicate of AmiExpressDocs)
- Obsolete stub files

## For Development

The MCP server is a Node.js application using the Model Context Protocol SDK.

**Test the server:**
```bash
cd mcp-server
node test-mcp.js
```

**Start the server:**
```bash
cd mcp-server
node index.js
```

The server runs on stdio transport and is designed to be used with Claude Desktop via the MCP configuration.
