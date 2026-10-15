# Claude Desktop Configuration for AmiExpress Docs MCP

## Quick Setup

1. **Open Claude Desktop config file:**
   ```bash
   open ~/Library/Application\ Support/Claude/claude_desktop_config.json
   ```

2. **Add the MCP server configuration:**

   If the file is empty or only has `{}`, replace with:
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

   If you already have other MCP servers, add to the `mcpServers` object:
   ```json
   {
     "mcpServers": {
       "existing-server": {
         "command": "...",
         "args": ["..."]
       },
       "amiexpress-docs": {
         "command": "node",
         "args": ["~/Code/amiexpress-web/mcp-server/index.js"]
       }
     }
   }
   ```

3. **Restart Claude Desktop** (fully quit and reopen)

4. **Verify it's working:**
   - Look for a hammer/tools icon in Claude Desktop
   - You should see "amiexpress-docs" listed
   - Try asking: "What are the database rules?" and it should access the MCP server

## Using the MCP Server in Claude Desktop

### Reading Documentation

Claude can now access documentation without it being in your message:

```
User: What are the critical rules for database column names?
Claude: [Accesses amiexpress://docs/database-rules resource]
```

### Searching Documentation

```
User: Search the docs for "deployment checklist"
Claude: [Uses search_docs tool]
```

### Available Resources

When you need specific documentation, Claude can access:

- **claude-md** - Main guidelines and critical rules
- **database-rules** - Database management
- **deployment-guide** - Deployment procedures
- **code-architecture** - Code structure and utilities
- **amiga-reference** - AmigaOS docs and testing
- **amiga-implementation-guide** - Door implementation
- **testing-guide** - Puppeteer testing

## Benefits

### Before MCP:
- CLAUDE.md was 40KB+
- All content loaded into every conversation
- Context limit reached quickly
- Had to manually tell Claude which doc to read

### After MCP:
- CLAUDE.md is 5.4KB (87% smaller)
- Documentation loaded only when needed
- More context available for actual work
- Claude can search across all docs
- Always reads latest version from disk

## Troubleshooting

### MCP Server Not Appearing

**Check config file location:**
```bash
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

**Verify the path is correct:**
```bash
ls -la ~/Code/amiexpress-web/mcp-server/index.js
```

**Check it's executable:**
```bash
chmod +x ~/Code/amiexpress-web/mcp-server/index.js
```

**Restart Claude Desktop:**
- Fully quit (Cmd+Q)
- Reopen from Applications

**Check Claude Desktop Developer Tools:**
- Help → Show Developer Tools
- Look for MCP-related logs

### Server Shows But Doesn't Work

**Test the server manually:**
```bash
cd ~/Code/amiexpress-web/mcp-server
node index.js
# Should output: "AmiExpress Docs MCP Server running on stdio"
# Press Ctrl+C to exit
```

**Verify files exist:**
```bash
ls -la ~/Code/amiexpress-web/CLAUDE.md
ls -la ~/Code/amiexpress-web/Docs/*.md
```

### Search Returns No Results

- Check that query string is not empty
- Try case-insensitive search first
- Verify documentation files contain the search term
- Check server logs in Claude Desktop Developer Tools

## Example Usage in Claude Desktop

### Workflow 1: Quick Reference
```
User: I need to deploy to production. What's the checklist?
Claude: [Reads deployment-guide resource]
       Here's the pre-deployment checklist...
```

### Workflow 2: Deep Dive
```
User: I'm implementing a new Amiga door function. What do I need to know?
Claude: [Reads amiga-implementation-guide resource]
       Before implementing any Amiga function...
```

### Workflow 3: Search
```
User: Where in the docs does it mention UNIQUE constraints?
Claude: [Uses search_docs tool with query "UNIQUE constraints"]
       Found in database-rules.md, lines 15-30...
```

## Updating Documentation

When you update any documentation file:

1. Edit the file normally (e.g., `Docs/DATABASE_RULES.md`)
2. Save the file
3. **That's it!** MCP server reads from disk, so changes are immediate

No need to restart Claude Desktop or the MCP server.

## Advanced: Adding More Documentation

To add a new documentation file to the MCP server:

1. **Create the document:**
   ```bash
   # Example: Add a new SECURITY_RULES.md
   touch ~/Code/amiexpress-web/Docs/SECURITY_RULES.md
   ```

2. **Edit `mcp-server/index.js`** and add to the `DOCS` object:
   ```javascript
   'security-rules': {
     path: path.join(PROJECT_ROOT, 'Docs', 'SECURITY_RULES.md'),
     description: 'Security best practices and rules',
     mimeType: 'text/markdown'
   }
   ```

3. **Restart Claude Desktop** to pick up the new resource

## Support

For MCP-related issues:
- MCP Documentation: https://modelcontextprotocol.io
- SDK Repository: https://github.com/modelcontextprotocol/sdk

For AmiExpress project issues:
- See project README.md
- Check CLAUDE.md for guidelines
