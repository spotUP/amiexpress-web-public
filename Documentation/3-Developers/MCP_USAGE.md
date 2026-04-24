# MCP (Model Context Protocol) Usage Guide

This project uses an MCP server to provide efficient access to documentation and source code. Prefer MCP tools over reading files directly — 94–98% token savings.

## Server

- File: `mcp-server/index.js`
- Name: `amiexpress-docs-mcp-server`
- Version: 2.0
- Resources: 50+ docs + 5 source files (~35,000 lines total)

## Why MCP, Not Direct Reads

| Approach | Tokens |
|----------|--------|
| Read entire `express.e` | ~35,000 |
| `read_express_module` (single module) | 500–2000 |

Savings: 94–98%. Also gets: organized docs, built-in search, module-based access, line-range reads, no need to know file paths.

## Tools

### 1. `search_docs`
Search across all documentation.

```javascript
mcp__amiexpress-docs__search_docs({
  query: "AREXX",
  caseSensitive: false  // optional
})
```

### 2. `get_all_docs`
Returns 50+ docs combined. **Use rarely — very token-heavy.** Prefer `search_docs`.

```javascript
mcp__amiexpress-docs__get_all_docs({})
```

### 3. `search_ndk_autodocs`
Search AmigaOS NDK 3.2R4 Autodocs for function specs.

```javascript
mcp__amiexpress-docs__search_ndk_autodocs({
  query: "AllocDosObject",
  library: "dos"  // optional: dos, exec, graphics, intuition, etc.
})
```

### 4. `read_source_range`
Read specific lines from a source file.

```javascript
mcp__amiexpress-docs__read_source_range({
  source: "express-e",  // or "hydra-e", "acp-e"
  startLine: 15234,
  endLine: 15456
})
```

Sources:
- `express-e` — main BBS source (35,000+ lines)
- `hydra-e` — Hydra protocol
- `acp-e` — AmiExpress Control Panel

### 5. `search_express_source`
Find keyword in express.e with surrounding context.

```javascript
mcp__amiexpress-docs__search_express_source({
  query: "StrCmp(cmdcode,'DOWNLOAD')",
  context: 3  // optional, default 3
})
```

Follow with `read_source_range` for deeper context around the hit.

### 6. `read_express_module`
Read an entire logical module. **Most efficient way** to understand a subsystem.

```javascript
mcp__amiexpress-docs__read_express_module({
  module: "mci"
})
```

Available modules (19):

| Module | Purpose |
|--------|---------|
| `init` | Initialization & startup |
| `core` | Core BBS functionality |
| `security` | Security, access control |
| `io` | Input/output |
| `messaging` | Message system |
| `doors` | Door execution & management |
| `commands` | Command processing |
| `mci` | MCI code implementation |
| `display` | Display / rendering |
| `rexx` | AREXX integration |
| `windows` | Window management |
| `logging` | Logging |
| `mail` | Mail system |
| `files` | File management |
| `conference` | Conferences |
| `internal-commands` | Internal command handlers |
| `command-priority` | Command priority logic |
| `mainloop` | Main event loop |
| `startup` | Startup sequence |

### 7. `list_express_modules`
Lists all 19 modules with descriptions and line ranges.

```javascript
mcp__amiexpress-docs__list_express_modules({})
```

## Workflows

### Implementing a BBS Command
```javascript
// 1. Find it
mcp__amiexpress-docs__search_express_source({
  query: "StrCmp(cmdcode,'DOWNLOAD')",
  context: 3
})

// 2. Read the whole module
mcp__amiexpress-docs__read_express_module({
  module: "internal-commands"
})

// 3. Zoom in on exact lines if needed
mcp__amiexpress-docs__read_source_range({
  source: "express-e",
  startLine: 15234,
  endLine: 15456
})

// 4. Implement EXACTLY as shown
```

### Understanding a Subsystem (e.g., MCI)
```javascript
mcp__amiexpress-docs__list_express_modules({})
mcp__amiexpress-docs__read_express_module({ module: "mci" })
mcp__amiexpress-docs__search_express_source({ query: "~UN", context: 5 })
```

### Looking Up AmigaOS Functions
```javascript
mcp__amiexpress-docs__search_ndk_autodocs({
  query: "AllocDosObject",
  library: "dos"
})
mcp__amiexpress-docs__search_express_source({
  query: "AllocDosObject",
  context: 5
})
```

## Common Mistakes

**X WRONG — reading files directly:**
```
Read({file_path: "/path/to/express.e"})   // 35,000+ tokens
```

**[OK] CORRECT — use MCP:**
```
mcp__amiexpress-docs__read_express_module({ module: "doors" })   // ~1000 tokens
```

**X WRONG — guessing:**
> "I think the DOWNLOAD command probably does X."

**[OK] CORRECT — check first:**
```
mcp__amiexpress-docs__search_express_source({
  query: "StrCmp(cmdcode,'DOWNLOAD')", context: 5
})
```
Then implement exactly as shown.

## Quick Reference

| Task | Tool | Example |
|------|------|---------|
| Find command | `search_express_source` | `{query: "StrCmp(cmdcode,'MAIL')"}` |
| Read MCI impl | `read_express_module` | `{module: "mci"}` |
| Read door logic | `read_express_module` | `{module: "doors"}` |
| AmigaOS function | `search_ndk_autodocs` | `{query: "AllocDosObject", library: "dos"}` |
| Specific lines | `read_source_range` | `{source: "express-e", startLine: 100, endLine: 200}` |
| Search all docs | `search_docs` | `{query: "AREXX"}` |
| List modules | `list_express_modules` | `{}` |

## Token Savings Examples

| Scenario | Direct | MCP | Savings |
|----------|--------|-----|---------|
| Finding DOWNLOAD command | 35,000 | ~500 | 98.6% |
| Understanding door system | 53,000 | ~1,200 | 97.7% |
| Looking up `AllocDosObject` | ~2,000 | ~300 | 85% |

**MCP is your first resource, not your last resort.**
