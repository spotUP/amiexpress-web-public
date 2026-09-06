# File Size Guidelines

**Last Updated**: 2025-12-09

This document outlines the file size limits and enforcement mechanisms to prevent monolithic files in the codebase.

## The Problem

Large files (>2000 lines) create several issues:
- **Difficult to navigate** - Hard to find specific functionality
- **Harder to test** - Too many responsibilities in one place
- **Merge conflicts** - Multiple developers editing the same large file
- **Poor maintainability** - Violates Single Responsibility Principle
- **Cognitive overload** - Too much context to hold in memory

## File Size Limits

### Hard Limits (Enforced by Pre-commit Hook)

| Category | Limit | Action |
|----------|-------|--------|
| **Standard Files** | 2000 lines | Commit blocked |
| **Warning Threshold** | 1500 lines | Warning displayed |
| **Target** | <1000 lines | Ideal size |

### Automated Enforcement

A pre-commit hook automatically checks all TypeScript files:

```bash
# Runs automatically on git commit
[Pre-commit] Checking file sizes...
[WARNING] Files approaching size limit (>1500 lines):
  → web/backend/src/handlers/example.handler.ts (1750 lines)

[OK] All files within size limits
```

**To bypass** (emergency only):
```bash
SKIP_SIZE_CHECK=1 git commit -m "Emergency fix"
```

## Exempt Files

Some files are exempt from the 2000-line limit with documented justification:

### AmigaOS Emulation Layer

| File | Lines | Justification |
|------|-------|---------------|
| `DosLibrary.ts` | 4,952 | 100+ AmigaDOS system calls (Open, Read, Write, Lock, etc.) |
| `ExecLibrary.ts` | 3,263 | 80+ Exec.library calls (memory, tasks, interrupts) |
| `LibraryTraps.ts` | 3,910 | LVO offset table for all Amiga libraries |
| `DoorMessageHandler.ts` | 2,174 | 100+ XIM protocol message types |

**Why exempt**: These implement complete Amiga OS APIs. Splitting would break the API surface contract and make the emulation harder to maintain.

### Language Implementations

| File | Lines | Justification |
|------|-------|---------------|
| `arexx.service.ts` | 2,053 | Complete AREXX language interpreter with 40+ BBS functions |

**Why exempt**: Language interpreters benefit from having all grammar/parsing logic together. Splitting reduces clarity.

### Third-Party/Generated Code

| File | Lines | Justification |
|------|-------|---------------|
| `dasm.ts` | 2,862 | MOIRA 68000 disassembler (third-party) |

**Why exempt**: External code we don't control.

### Legacy (Temporary Exemption)

| File | Lines | Justification | Plan |
|------|-------|---------------|------|
| `database.ts` | 2,444 | Legacy monolithic database | Being replaced by repositories |
| `command.handler.ts` | 3,781 | Core BBS routing | Requires express.e verification to split |
| `door.handler.ts` | 2,168 | Door execution engine | Requires express.e verification to split |

**Why exempt**: These require express.e source verification before refactoring to ensure BBS behavior correctness.

## How to Request an Exemption

If you believe a file legitimately needs to exceed 2000 lines:

1. **Document the reason** - Why can't it be split?
2. **Update the pre-commit hook** - Add to `EXEMPT_FILES` array
3. **Add to this document** - Include in the exemption table above
4. **Get review approval** - Have another developer verify the justification

**Bad reasons for exemption**:
- "It's easier to have everything in one file"
- "I don't have time to refactor"
- "It's already big, so adding more won't hurt"

**Good reasons for exemption**:
- "Implements a complete external API contract (e.g., AmigaOS API)"
- "Third-party/generated code we don't control"
- "Temporarily exempt while waiting for express.e verification"

## Refactoring Strategies

When a file approaches or exceeds the limit, use these strategies:

### 1. Feature-Based Splitting

Split by BBS feature or domain:

**Before:**
```
handlers/
  ├── command.handler.ts (3,781 lines)
```

**After:**
```
handlers/
  ├── commands/
  │   ├── info-commands.handler.ts (1,060 lines)
  │   ├── user-commands.handler.ts (562 lines)
  │   ├── transfer-commands.handler.ts (706 lines)
  │   └── ... (8 more handlers)
```

### 2. Extract to Services

Move business logic to service layer:

**Before:**
```typescript
// In handler (2,500 lines)
export async function handleQWKCommand(socket, session) {
  // 400 lines of QWK packet generation logic
}
```

**After:**
```typescript
// In handler (100 lines)
import { QWKManager } from '../services/qwk.service';

export async function handleQWKCommand(socket, session) {
  const qwkManager = new QWKManager();
  const packet = await qwkManager.generatePacket(session);
  socket.emit('qwk-ready', packet);
}

// In services/qwk.service.ts (400 lines)
export class QWKManager {
  async generatePacket(session) {
    // QWK generation logic
  }
}
```

### 3. Extract to Utilities

Move reusable functions to utils:

**Before:**
```typescript
// In handler (2,200 lines)
function validateUserInput(input: string): boolean {
  // 50 lines of validation logic
}

function sanitizeFilename(name: string): string {
  // 30 lines of sanitization
}
```

**After:**
```typescript
// In handler (2,120 lines)
import { validateUserInput, sanitizeFilename } from '../utils/validation.util';

// In utils/validation.util.ts (80 lines)
export function validateUserInput(input: string): boolean { ... }
export function sanitizeFilename(name: string): string { ... }
```

### 4. Use Subdirectories

Group related files in feature subdirectories:

**Before:**
```
handlers/
  ├── message-commands.handler.ts
  ├── message-entry.handler.ts
  ├── message-scan.handler.ts
  └── messaging.handler.ts
```

**After:**
```
handlers/
  └── message/
      ├── message-commands.handler.ts
      ├── message-entry.handler.ts
      ├── message-scan.handler.ts
      └── messaging.handler.ts
```

### 5. Dependency Injection

Use DI to break circular dependencies:

**Before:**
```typescript
// handlers/command.handler.ts (3,000 lines)
import { executeCommand } from './command-execution.handler';
```

**After:**
```typescript
// handlers/command.handler.ts (1,500 lines)
let commandExecutor: (cmd: string) => Promise<void>;

export function setCommandExecutor(executor) {
  commandExecutor = executor;
}

// server/initialization.ts
import { setCommandExecutor } from './handlers/command.handler';
setCommandExecutor(executeCommand);
```

## Development Workflow

### Before Starting Work

1. **Check file size**: `wc -l path/to/file.ts`
2. **If >1500 lines**: Consider refactoring first
3. **If >2000 lines and not exempt**: Must refactor before adding code

### During Development

1. **Keep changes focused** - Single responsibility
2. **Extract early** - Don't wait for 2000 lines
3. **Use feature branches** - Makes refactoring easier

### Before Committing

1. **Pre-commit hook runs automatically**
2. **Address violations** - Refactor or document exemption
3. **Warnings are informational** - But plan to refactor soon

### Code Review Checklist

Reviewers should ask:
- [ ] Are new files under 1000 lines?
- [ ] Are modified files approaching 2000 lines?
- [ ] If exempt file modified, was it necessary?
- [ ] Could code be extracted to utils/services?
- [ ] Is the file size growth justified?

## Monitoring

### Check Current File Sizes

```bash
# All files over 2000 lines
find web/backend/src -name "*.ts" -not -path "*/node_modules/*" \
  -exec wc -l {} + | awk '$1 > 2000 {print $1, $2}' | sort -rn

# All files over 1500 lines (warning threshold)
find web/backend/src -name "*.ts" -not -path "*/node_modules/*" \
  -exec wc -l {} + | awk '$1 > 1500 {print $1, $2}' | sort -rn

# Top 20 largest files
find web/backend/src -name "*.ts" -not -path "*/node_modules/*" \
  -exec wc -l {} + | sort -rn | head -20
```

### Periodic Review

**Monthly**: Review all files >1500 lines
- Are they still exempt for valid reasons?
- Can any be refactored now?
- Are new large files appearing?

**Quarterly**: Review exemption list
- Remove files that have been refactored
- Update justifications if needed
- Add new legitimate exemptions

## Success Metrics

Track these metrics to measure improvement:

| Metric | Target | Current (Dec 2025) |
|--------|--------|--------------------|
| Files >2000 lines | <10 | 9 (7 exempt, 2 legacy) |
| Files >1500 lines | <20 | ~15 |
| Average file size | <800 lines | ~450 lines |
| Exempt files | <10 | 9 |

## FAQ

**Q: What if I need to add 100 lines to a 1950-line file?**
A: Refactor first. Extract 200 lines to utilities/services, then add your 100 lines.

**Q: Can I disable the hook?**
A: Emergency bypass: `SKIP_SIZE_CHECK=1 git commit`. But you must refactor in a follow-up commit.

**Q: What about test files?**
A: Same limits apply. Large test files indicate the code being tested is too complex.

**Q: What about type definition files (.d.ts)?**
A: Same limits. Large type files should be split by feature/domain.

**Q: The pre-commit hook is slow. Can I skip it?**
A: It should complete in <1 second. If not, file a bug. Don't bypass the check.

**Q: I'm refactoring a 3000-line file. Do I need to do it all at once?**
A: No. Use `SKIP_SIZE_CHECK=1` for intermediate commits on a feature branch. Final PR must pass the check.

## Tools and Scripts

### Update Pre-commit Hook

```bash
# Edit the hook
vim .git/hooks/pre-commit

# Test the hook without committing
.git/hooks/pre-commit

# Bypass for emergency
SKIP_SIZE_CHECK=1 git commit -m "Emergency fix"
```

### Find Refactoring Candidates

```bash
# Files between 1500-2000 lines (warning zone)
find web/backend/src -name "*.ts" -not -path "*/node_modules/*" \
  -exec wc -l {} + | awk '$1 > 1500 && $1 <= 2000 {print $1, $2}' | sort -rn
```

### Calculate Average File Size

```bash
find web/backend/src -name "*.ts" -not -path "*/node_modules/*" \
  -exec wc -l {} + | awk '{sum+=$1; count++} END {print "Average:", sum/count, "lines"}'
```

## Related Documentation

- [BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md) - Overall architecture
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Contribution guidelines
- [ARCHITECTURE.md](./ARCHITECTURE.md) - High-level architecture overview

---

**Remember**: Small, focused files are easier to understand, test, and maintain. The 2000-line limit is not arbitrary—it's based on decades of software engineering experience about cognitive load and maintainability.
