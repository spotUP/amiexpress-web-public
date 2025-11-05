# MCP Migration Plan - Move Large Sources to MCP Server

**Goal**: Move large reference sources (233MB total) from disk to MCP server for on-demand access.

**Token Savings**: Eliminate need to read large files during sessions, load only what's needed.

---

## Current Situation

### Large Files on Disk
- **AmiExpress-Sources/**: 2.3MB (express.e: 32,248 lines + others)
- **NDK3.2R4/**: 30MB (Amiga developer documentation)
- **Documentation/4-Door-Developers/vAmiga/**: 201MB (C++ emulator sources)

### Current MCP Server
- Exposes 9 documentation files
- Has 2 tools: `search_docs`, `get_all_docs`
- URI scheme: `amiexpress://docs/{key}`

---

## Migration Strategy

### Phase 1: Add Source File Access ✅ (IN PROGRESS)

**Add to MCP server** (`mcp-server/index.js`):

```javascript
const SOURCES = {
  'express-e': {
    path: path.join(PROJECT_ROOT, 'AmiExpress-Sources', 'express.e'),
    description: 'Original AmiExpress BBS source (32,248 lines) - PRIMARY REFERENCE',
    mimeType: 'text/plain'
  },
  'hydra-e': {
    path: path.join(PROJECT_ROOT, 'AmiExpress-Sources', 'hydra.e'),
    description: 'Hydra protocol implementation',
    mimeType: 'text/plain'
  },
  'acp-e': {
    path: path.join(PROJECT_ROOT, 'AmiExpress-Sources', 'ACP.e'),
    description: 'AmiExpress Control Panel source',
    mimeType: 'text/plain'
  }
};
```

**URI scheme**: `amiexpress://sources/{key}`

**Usage**:
```
User: "Check express.e for MCI code implementation"
Claude: [Requests amiexpress://sources/express-e with range 5290-5850]
Claude: [Reads only requested lines from MCP]
```

### Phase 2: Add NDK Autodocs Search Tool

**Add tool** (`search_ndk_autodocs`):

```javascript
{
  name: 'search_ndk_autodocs',
  description: 'Search Amiga NDK autodocs for function specifications',
  inputSchema: {
    type: 'object',
    properties: {
      functionName: {
        type: 'string',
        description: 'Function name to search for (e.g., "Open", "Close")'
      },
      library: {
        type: 'string',
        description: 'Library name (e.g., "dos", "exec", "graphics")',
        default: 'dos'
      }
    },
    required: ['functionName']
  }
}
```

**Implementation**:
- Searches `NDK3.2R4/Autodocs/AG/{library}`
- Extracts `@Node "{functionName}"` section
- Returns NAME, SYNOPSIS, FUNCTION, INPUTS, RESULT, NOTES
- Same functionality as `reference-checker.ts` but via MCP

**Benefits**:
- No need to read 30MB of autodocs into context
- On-demand function specification lookup
- Integrates with reference-checker tool

### Phase 3: Add Line Range Reading Tool

**Add tool** (`read_source_range`):

```javascript
{
  name: 'read_source_range',
  description: 'Read specific line range from large source files',
  inputSchema: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        description: 'Source file key (express-e, hydra-e, acp-e)',
        enum: ['express-e', 'hydra-e', 'acp-e']
      },
      startLine: {
        type: 'number',
        description: 'Start line number'
      },
      endLine: {
        type: 'number',
        description: 'End line number'
      }
    },
    required: ['source', 'startLine', 'endLine']
  }
}
```

**Usage**:
```javascript
// Read MCI code implementation from express.e
read_source_range('express-e', 5290, 5850)
// Returns only lines 5290-5850 (560 lines instead of 32,248!)
```

**Token Savings**:
- Full express.e: ~400k tokens
- 560 lines: ~7k tokens
- **Savings: 98.25%!**

### Phase 4: vAmiga Sources (Optional - Low Priority)

**vAmiga is 201MB C++** - This is massive but rarely accessed.

**Options**:
1. **Leave on disk** (current) - Only needed for deep emulation work
2. **Add to MCP with search tool** - For finding specific implementations
3. **Create index file** - Map function names to file locations

**Recommendation**: Leave on disk for now. Only add if frequently accessed.

---

## Updated MCP Server Structure

### Resources (11 docs + 3 sources)

**Documentation** (`amiexpress://docs/{key}`):
- claude-md
- documentation-index
- current-status ← **NEW**
- user-guide
- deployment
- architecture
- database
- testing
- door-development
- amiga-emulation
- mci-codes ← **NEW**

**Sources** (`amiexpress://sources/{key}`):
- express-e ← **NEW** (32,248 lines)
- hydra-e ← **NEW**
- acp-e ← **NEW**

### Tools (5 total)

**Existing**:
1. `search_docs` - Search documentation
2. `get_all_docs` - Load all docs (use sparingly)

**New**:
3. `search_ndk_autodocs` - Search Amiga function specs
4. `read_source_range` - Read specific lines from express.e
5. `search_express_source` - Search express.e for keywords/functions

---

## Implementation Steps

### Step 1: Update MCP Server ✅

Add SOURCES constant and update handlers:

```javascript
// Update ListResourcesRequestSchema handler
for (const [key, src] of Object.entries(SOURCES)) {
  resources.push({
    uri: `amiexpress://sources/${key}`,
    mimeType: src.mimeType,
    name: key,
    description: src.description
  });
}

// Update ReadResourceRequestSchema handler
const sourceMatch = uri.match(/^amiexpress:\/\/sources\/(.+)$/);
if (sourceMatch) {
  const sourceKey = sourceMatch[1];
  const source = SOURCES[sourceKey];
  // ... read and return source file
}
```

### Step 2: Add NDK Search Tool

```javascript
async searchNDKAutodocs(functionName, library = 'dos') {
  const autodocPath = path.join(
    PROJECT_ROOT,
    'NDK3.2R4',
    'Autodocs',
    'AG',
    library
  );
  
  const content = await fs.readFile(autodocPath, 'utf-8');
  const nodePattern = `@Node "${functionName}"`;
  
  // Extract function documentation (100 lines after @Node)
  // Parse sections: NAME, SYNOPSIS, FUNCTION, INPUTS, RESULT, NOTES
  // Return structured data
}
```

### Step 3: Add Line Range Tool

```javascript
async readSourceRange(source, startLine, endLine) {
  const sourceFile = SOURCES[source];
  if (!sourceFile) throw new Error(`Unknown source: ${source}`);
  
  const content = await fs.readFile(sourceFile.path, 'utf-8');
  const lines = content.split('\n');
  const extracted = lines.slice(startLine - 1, endLine);
  
  return {
    source,
    startLine,
    endLine,
    totalLines: lines.length,
    content: extracted.join('\n')
  };
}
```

### Step 4: Update Reference Checker

Update `Scripts/reference-checker.ts` to optionally use MCP:

```typescript
// Add flag: --use-mcp
if (useMCP) {
  // Use MCP tools via API
  const result = await mcpClient.call('search_express_source', { query });
} else {
  // Use direct file access (current behavior)
  const content = fs.readFileSync(EXPRESS_E_PATH, 'utf-8');
}
```

### Step 5: Test MCP Server

```bash
cd mcp-server
npx @modelcontextprotocol/inspector node index.js
```

Test new resources and tools:
- ✓ List resources shows sources
- ✓ Read express-e source
- ✓ search_ndk_autodocs('Open', 'dos')
- ✓ read_source_range('express-e', 5290, 5850)

---

## Token Savings Estimate

### Current Workflow (Direct File Access)

**Implementing MCI code**:
1. Read express.e (32,248 lines): ~400k tokens
2. Find MCI code section manually
3. Extract relevant lines

**OR**

1. Use reference-checker.ts
2. Reads express.e: ~400k tokens
3. Searches and extracts

### New Workflow (MCP)

**Implementing MCI code**:
1. Ask: "Show MCI code implementation from express.e"
2. Claude uses `read_source_range('express-e', 5290, 5850)`
3. MCP returns only 560 lines: ~7k tokens

**Savings: 393k tokens (98.25%)!**

### Additional Savings

**NDK function lookup**:
- Before: Read 30MB autodocs or use reference-checker
- After: `search_ndk_autodocs('Open', 'dos')` → ~2k tokens
- Savings: Massive (don't load entire 30MB)

**Multiple lookups in one session**:
- Before: Re-read express.e each time
- After: MCP caches, returns only requested sections
- Savings: Exponential with multiple lookups

---

## Migration Benefits

### 1. Massive Token Savings
- Don't load 32k line files into context
- Read only what's needed (560 lines vs 32k)
- 98%+ reduction in source file token usage

### 2. Faster Development
- Instant line range extraction
- No manual searching through express.e
- Integrated NDK autodocs search

### 3. Reference Checker Enhancement
- Can use MCP or direct file access
- More flexible tooling
- Better integration with Claude

### 4. Scalability
- Easy to add more source files
- Can add vAmiga sources later if needed
- Extensible tool framework

### 5. Consistency
- Single source of truth (MCP server)
- Always current (reads from disk)
- No stale copies in context

---

## Files to Update

### MCP Server
- [x] `mcp-server/index.js` - Add SOURCES, new tools

### Reference Checker (Optional Enhancement)
- [ ] `Scripts/reference-checker.ts` - Add --use-mcp flag

### Documentation
- [ ] `mcp-server/README.md` - Document new features
- [ ] `Docs/MCP_SERVER_SETUP.md` - Update with new tools

### CLAUDE.md (Update References)
- [ ] Change "grep express.e" to "use MCP read_source_range"
- [ ] Update "Check E sources FIRST" section

---

## Testing Checklist

- [ ] MCP server starts without errors
- [ ] Can list all resources (11 docs + 3 sources)
- [ ] Can read express-e via MCP
- [ ] Can read hydra-e via MCP
- [ ] Can read acp-e via MCP
- [ ] search_ndk_autodocs finds functions
- [ ] read_source_range returns correct lines
- [ ] search_express_source finds keywords
- [ ] Reference checker works with --use-mcp
- [ ] Token usage reduced in test session

---

## Rollout Plan

### Phase 1: Core MCP Updates (This Session)
1. ✅ Add SOURCES to MCP server
2. ⏳ Add source reading handlers
3. ⏳ Test basic source access

### Phase 2: Tools (Next Session)
1. Add search_ndk_autodocs tool
2. Add read_source_range tool
3. Add search_express_source tool
4. Test all tools

### Phase 3: Integration (Following Session)
1. Update reference-checker.ts
2. Update CLAUDE.md
3. Update documentation
4. Full end-to-end testing

### Phase 4: Optimization (Optional)
1. Add vAmiga source search (if needed)
2. Add caching for frequently accessed ranges
3. Add source file indexing

---

## Success Metrics

**Before MCP Migration**:
- express.e reads: 400k tokens each time
- NDK lookups: Manual or expensive
- Context usage: High

**After MCP Migration**:
- express.e reads: 7k tokens (specific ranges)
- NDK lookups: 2k tokens via tool
- Context usage: 98% lower
- Sessions per day: 2-3x more

---

## Next Steps

1. Complete MCP server updates (add handlers for SOURCES)
2. Implement new tools (search_ndk_autodocs, read_source_range)
3. Test with inspector
4. Update reference-checker.ts to use MCP
5. Document new workflow
6. Use in next feature implementation to validate savings

**Status**: Phase 1 in progress - SOURCES added, handlers need updating
