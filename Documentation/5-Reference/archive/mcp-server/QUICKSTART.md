# MCP Server Quick Start

## Install & Configure (3 steps)

These steps work for any MCP-aware agent (Claude Desktop, other MCP clients, or a custom harness).

### 1. Install dependencies (already done)
```bash
cd ~/Code/AmiExpress/amiexpress-web/mcp-server
npm install
```

### 2. Configure your MCP client

For Claude Desktop: open `~/Library/Application Support/Claude/claude_desktop_config.json`.

For other MCP agents (including this one), add/merge the stanza below into the client’s MCP config block (the key is usually `mcpServers` or similar).

Add (or merge) this block:
```json
{
  "mcpServers": {
    "amiexpress-docs": {
      "command": "node",
      "args": ["~/Code/AmiExpress/amiexpress-web/mcp-server/index.js"]
    }
  }
}
```

### 3. Restart your agent

For Claude Desktop: fully quit (Cmd+Q) and reopen so it picks up the MCP server. For other clients: reload/restart per their MCP discovery rules.

## Verify It's Working

In your client (Claude Desktop or compatible MCP-aware agent), try:

```
User: What documentation resources are available?
```

Claude should list the 7 available documentation resources.

Or try:

```
User: Search the docs for "database"
```

Claude should use the search_docs tool.

## What You Get

### 7 Documentation Resources
1. **claude-md** - Main project guidelines
2. **database-rules** - Database management
3. **deployment-guide** - Production deployment
4. **code-architecture** - Code structure
5. **amiga-reference** - AmigaOS & testing
6. **amiga-implementation-guide** - Door implementation
7. **testing-guide** - Puppeteer testing

### 2 Tools
1. **search_docs** - Search across all documentation
2. **get_all_docs** - Get all docs combined (use sparingly)

## Example Usage

```
User: I'm deploying to production. What should I check?
Claude: [Accesses deployment-guide resource]
        Here's the pre-deployment checklist...

User: Search for "UNIQUE constraints"
Claude: [Uses search_docs tool]
        Found in database-rules.md...

User: What are the critical rules for this project?
Claude: [Accesses claude-md resource]
        The critical rules are:
        1. Always check E sources first...
```

## Benefits

- **87% smaller CLAUDE.md** (40KB → 5.4KB)
- **On-demand docs** (only load what's needed)
- **Searchable** (find info across all docs)
- **Always current** (reads from disk)

## Troubleshooting

**MCP server not showing?**
- Check config file location
- Restart Claude Desktop
- Look for errors in Help → Developer Tools

**Resources not loading?**
- Verify file paths in index.js
- Check files exist in Docs/
- Test server: `node index.js`

## Full Documentation

See:
- `README.md` - Complete server documentation
- `CLAUDE_DESKTOP_CONFIG.md` - Detailed setup guide
- `../Docs/MCP_SERVER_SETUP.md` - Full project context

## That's It!

You now have a fully functional MCP server providing AmiExpress documentation on-demand to Claude Desktop.

Context saved: **87%**
Happiness increased: **100%** 🎉
