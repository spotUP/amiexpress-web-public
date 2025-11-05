# Scripts Directory

This directory contains all test scripts, utilities, and development tools for the AmiExpress-Web project.

## Organization

All `.js` test scripts and utilities should be placed in this directory, NOT in the project root.

## Categories

### Test Scripts

Door testing:
- `test-door-*.js` - Various door execution tests
- `test-ga-*.js` - GetAnswer door specific tests
- `test-getanswer*.js` - GetAnswer door tests
- `test-what-door.js` - What door tests

BBS testing:
- `test-bbs-*.js` - BBS system tests
- `test-dos-file-io.js` - DOS file I/O tests
- `test-check-memory.js` - Memory checking utilities

### Utilities

- `bbs-cli.js` - BBS command-line interface
- `disassemble-door.js` - Door disassembly utility

## Usage

Run any script with tsx:
```bash
npx tsx Scripts/test-door-simple.js
npx tsx Scripts/bbs-cli.js
```

Or make executable and run directly:
```bash
chmod +x Scripts/test-door-simple.js
./Scripts/test-door-simple.js
```

## Guidelines

1. **ALWAYS** create test scripts in this directory
2. **NEVER** create test scripts in project root
3. Name scripts descriptively: `test-<feature>-<variant>.js`
4. Include a comment at the top explaining what the script does
5. Clean up after yourself - remove obsolete test scripts

## See Also

- [Testing Guide](../Documentation/3-Developers/TESTING.md) - Comprehensive testing documentation
- [CLAUDE.md](../CLAUDE.md) - Project guidelines and rules
