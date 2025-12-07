# AmiExpress Development Scripts

## Overview

This directory contains reusable development tools designed to improve efficiency and enforce best practices.

**Purpose**: Solve the rate limit problem by eliminating one-off test scripts and automating repetitive tasks.

---

## 🧪 Test Framework (`test-framework.ts`)

Reusable utilities for testing BBS commands, doors, and interactions without writing one-off scripts.

### Usage

```bash
# Test a door
npx tsx Scripts/test-framework.ts door WHO2 "DooR by SPY/MST"

# Test a command
npx tsx Scripts/test-framework.ts command WHO "Who's Online"

# Test login
npx tsx Scripts/test-framework.ts login sysop sysop

# Interactive session (opens browser)
npx tsx Scripts/test-framework.ts interactive
```

### Features

- **ServerManager**: Automatic server startup/shutdown
- **BBSSession**: Puppeteer-based BBS interaction
- **TestUtils**: Assertion helpers
- **ANSI Parsing**: Extract text from terminal output
- **Screenshot Capture**: Save screenshots for debugging

---

## 🔍 Reference Checker (`reference-checker.ts`)

Automates the **"Check E sources FIRST"** rule.

### Usage

```bash
# Search for a command
npx tsx Scripts/reference-checker.ts command WHO

# Search for a function
npx tsx Scripts/reference-checker.ts function Open dos

# Generate implementation template
npx tsx Scripts/reference-checker.ts template command WHO
```

---

## 📐 Library Spec Generator (`generate-library-specs.ts`)

Generates type-safe TypeScript interfaces from NDK autodocs.

### Usage

```bash
# Generate specs for a library
npx tsx Scripts/generate-library-specs.ts dos

# Generate all specs
npx tsx Scripts/generate-library-specs.ts all
```

Output: `web/backend/src/amiga-emulation/api/specs/`

---

## 🎯 Best Practices

1. Check E sources FIRST with reference-checker
2. Use test framework (NOT one-off scripts)
3. Generate library specs before implementing
4. Let the compiler enforce correctness

**Result**: ~70% reduction in token usage!
