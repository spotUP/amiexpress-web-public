# AmiExpress Documentation MCP Server

An MCP (Model Context Protocol) server that provides AmiExpress-Web project documentation as resources.

## Features

- **Resources**: Exposes all project documentation files as MCP resources
- **Search**: Search across all documentation for keywords
- **Combined Docs**: Get all documentation as a single resource (use sparingly)

## Installation

```bash
cd mcp-server
npm install
```

## Usage

### Running the Server

```bash
npm start
```

### Configuring in Claude Desktop

Add to your `~/Library/Application Support/Claude/claude_desktop_config.json`:

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

Or use npx:

```json
{
  "mcpServers": {
    "amiexpress-docs": {
      "command": "npx",
      "args": ["-y", "~/Code/AmiExpress/amiexpress-web/mcp-server"]
    }
  }
}
```

After adding, restart Claude Desktop.

## Available Resources

The server exposes these documentation resources:

- `amiexpress://docs/claude-md` - Main project guidelines and critical rules
- `amiexpress://docs/database-rules` - Database management rules
- `amiexpress://docs/deployment-guide` - Production deployment procedures
- `amiexpress://docs/code-architecture` - Code architecture and utilities
- `amiexpress://docs/amiga-reference` - AmigaOS docs and testing
- `amiexpress://docs/amiga-implementation-guide` - Complete door implementation guide
- `amiexpress://docs/testing-guide` - Puppeteer testing guide

## Available Tools

### search_docs

Search across all documentation for a keyword or phrase.

**Parameters:**
- `query` (string, required): Search query
- `caseSensitive` (boolean, optional): Case-sensitive search (default: false)

**Example:**
```json
{
  "query": "database",
  "caseSensitive": false
}
```

### get_all_docs

Get all documentation as a single combined resource. Use this sparingly as it loads all docs at once.

## Benefits

- **Context Efficiency**: Documentation only loaded when needed
- **Searchable**: Find information across all docs quickly
- **Always Current**: Reads files directly from disk
- **Modular**: Easy to add new documentation files

## Adding New Documentation

To add a new documentation file:

1. Add entry to `DOCS` object in `index.js`:
   ```javascript
   'new-doc': {
     path: path.join(PROJECT_ROOT, 'Docs', 'NEW_DOC.md'),
     description: 'Description of the document',
     mimeType: 'text/markdown'
   }
   ```

2. Restart the MCP server

## Testing

Test the server directly:

```bash
# Install MCP Inspector
npm install -g @modelcontextprotocol/inspector

# Run inspector
npx @modelcontextprotocol/inspector node index.js
```

This opens a web UI to test resources and tools.

## Troubleshooting

**Server not appearing in Claude Desktop:**
- Check config file location: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Restart Claude Desktop after config changes
- Check server logs in Claude Desktop Developer Tools

**Resources not loading:**
- Verify file paths in `DOCS` object
- Check file permissions
- Look for errors in Claude Desktop logs

**Search not working:**
- Ensure query is a non-empty string
- Check caseSensitive parameter
- Verify files are readable
