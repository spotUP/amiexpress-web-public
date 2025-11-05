# MCP Server Setup - Documentation Optimization

## What We Built

An MCP (Model Context Protocol) server that provides AmiExpress-Web documentation as on-demand resources to Claude Desktop.

## The Problem We Solved

**Before:**
- CLAUDE.md was 40KB+ (massive context usage)
- All documentation loaded into every conversation
- Ran out of context quickly
- No way to search across documentation
- Had to manually reference specific files

**After:**
- CLAUDE.md is 5.4KB (87% smaller!)
- Documentation loaded only when needed
- Context saved for actual work
- Built-in search across all docs
- Claude can access docs automatically

## File Structure

```
amiexpress-web/
├── CLAUDE.md                           # 5.4KB - Core rules & links
├── Docs/
│   ├── DATABASE_RULES.md              # Database management
│   ├── DEPLOYMENT_GUIDE.md            # Deployment procedures
│   ├── CODE_ARCHITECTURE.md           # Code structure
│   ├── AMIGA_REFERENCE.md             # AmigaOS & testing
│   ├── AMIGA_DOOR_IMPLEMENTATION_GUIDE.md
│   ├── TESTING_WITH_PUPPETEER.md
│   └── MCP_SERVER_SETUP.md            # This file
└── mcp-server/
    ├── package.json                    # MCP SDK dependency
    ├── index.js                        # MCP server implementation
    ├── README.md                       # Server documentation
    └── CLAUDE_DESKTOP_CONFIG.md       # Setup instructions
```

## MCP Server Features

### 1. Resources (7 total)
Exposes documentation files as MCP resources:
- `amiexpress://docs/claude-md`
- `amiexpress://docs/database-rules`
- `amiexpress://docs/deployment-guide`
- `amiexpress://docs/code-architecture`
- `amiexpress://docs/amiga-reference`
- `amiexpress://docs/amiga-implementation-guide`
- `amiexpress://docs/testing-guide`

### 2. Tools (2 total)

**search_docs**
- Search across all documentation
- Case-sensitive or case-insensitive
- Returns matches with context

**get_all_docs**
- Combines all docs into one resource
- Use sparingly (loads everything)

## Quick Setup for Claude Desktop

1. **Configure Claude Desktop:**
   ```bash
   open ~/Library/Application\ Support/Claude/claude_desktop_config.json
   ```

2. **Add this configuration:**
   ```json
   {
     "mcpServers": {
       "amiexpress-docs": {
         "command": "node",
         "args": ["~/Code/amiexpress-web/mcp-server/index.js"]
       }
     }
   }
   ```

3. **Restart Claude Desktop**

See `mcp-server/CLAUDE_DESKTOP_CONFIG.md` for detailed setup instructions.

## How It Works

### Traditional Approach (Before)
```
User: "What are the database rules?"
  ↓
Claude reads CLAUDE.md (40KB loaded into context)
  ↓
Finds database section
  ↓
Responds
```
**Cost:** 40KB of context every conversation

### MCP Approach (After)
```
User: "What are the database rules?"
  ↓
Claude requests: amiexpress://docs/database-rules
  ↓
MCP server reads Docs/DATABASE_RULES.md
  ↓
Returns only that file to Claude
  ↓
Responds
```
**Cost:** Only the specific doc needed (~3-5KB)

## Benefits

### Context Efficiency
- 87% reduction in base context usage
- More room for actual code and conversation
- Can reference multiple docs in one conversation

### Search Capability
```
User: "Search the docs for deployment checklist"
Claude: [Uses search_docs tool]
        Found in deployment-guide.md, lines 95-110...
```

### Always Current
- MCP server reads files from disk
- Updates to docs are immediate
- No need to restart anything

### Modular
- Easy to add new documentation
- Each doc can be maintained separately
- Clear separation of concerns

## Usage Examples

### Example 1: Quick Reference
```
User: I need to deploy. What's the checklist?
Claude: [Accesses deployment-guide resource]
        Here's the pre-deployment checklist:
        1. Test locally...
        2. Commit changes...
        [etc]
```

### Example 2: Search
```
User: Where does it talk about UNIQUE constraints?
Claude: [Uses search_docs("UNIQUE")]
        Found in:
        - database-rules.md: Lines 15-30
        - [Shows relevant sections]
```

### Example 3: Multiple Docs
```
User: I'm implementing a door that needs database access
Claude: [Accesses both amiga-implementation-guide and database-rules]
        For door implementation, you need to:
        1. [From amiga-implementation-guide]
        2. [From database-rules]
```

## Maintenance

### Adding New Documentation

1. Create the markdown file in `Docs/`
2. Edit `mcp-server/index.js`, add to `DOCS` object:
   ```javascript
   'new-doc': {
     path: path.join(PROJECT_ROOT, 'Docs', 'NEW_DOC.md'),
     description: 'Description',
     mimeType: 'text/markdown'
   }
   ```
3. Restart Claude Desktop

### Updating Existing Documentation

1. Edit the file normally
2. Save
3. **That's it!** (MCP reads from disk)

### Testing the Server

```bash
cd mcp-server
npm install -g @modelcontextprotocol/inspector
npx @modelcontextprotocol/inspector node index.js
```

Opens a web UI to test resources and tools.

## Technical Details

### Implementation
- Built with `@modelcontextprotocol/sdk`
- Runs as stdio transport server
- Pure Node.js, no build step required
- Reads files synchronously from disk

### Resources
- Each doc is a separate resource
- URI scheme: `amiexpress://docs/{key}`
- MIME type: `text/markdown`
- Lazy loading (only when requested)

### Tools
- `search_docs`: Grep-like search across all docs
- `get_all_docs`: Emergency "load everything" option
- Both return structured JSON responses

### Security
- Read-only access to documentation
- No write capabilities
- No network access
- Sandboxed to project directory

## Performance

### Before (Traditional)
- Context used per conversation: ~40KB base
- Max docs per conversation: 1 (CLAUDE.md)
- Search capability: Manual (Ctrl+F)

### After (MCP)
- Context used per conversation: 5.4KB base
- Max docs per conversation: Unlimited (loaded on demand)
- Search capability: Built-in (search_docs tool)

### Real-World Impact
```
Typical conversation about deployment:
Before: 40KB (CLAUDE.md) + conversation = ~60KB
After:  5.4KB (CLAUDE.md) + 4KB (deployment-guide) = ~30KB
Savings: 50% context reduction
```

## Troubleshooting

See `mcp-server/CLAUDE_DESKTOP_CONFIG.md` for detailed troubleshooting.

**Common issues:**
- MCP server not appearing: Check config file path
- Resources not loading: Verify file paths
- Search not working: Check query is non-empty string

## Next Steps

Potential future enhancements:

1. **Code Search Tool**
   - Search TypeScript/JavaScript files
   - Find function definitions
   - Locate where functions are called

2. **Git Integration**
   - Read commit history
   - Show recent changes
   - Find when specific code was added

3. **Test Results**
   - Access test logs
   - View test coverage
   - Check test status

4. **Door Status**
   - List available doors
   - Show door configurations
   - Check which doors are tested

## Credits

- MCP Protocol: Anthropic
- SDK: @modelcontextprotocol/sdk
- Implementation: Claude Code session 2025-11-01
- Optimization goal: Reduce context usage for AmiExpress-Web project

## Related Documentation

- MCP Protocol: https://modelcontextprotocol.io
- MCP SDK: https://github.com/modelcontextprotocol/sdk
- Claude Desktop: https://claude.ai/desktop
