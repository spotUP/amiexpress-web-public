# BBS CLI & Testing - Quick Reference

All BBS command-line tools are located in the **project root directory**: `~/Code/amiexpress-web/`

## 📁 File Locations

All scripts are in the project root:
```
~/Code/amiexpress-web/
├── bbs-cli.js              # CLI client
├── bbs-login.sh            # Login wrapper
├── test-bbs-commands.js    # Basic tests (50+)
├── test-bbs-deep.js        # Deep tests (60+)
├── run-bbs-tests.sh        # Test runner
└── test-all.sh             # Complete test suite
```

## 🚀 Quick Start

### From Project Root
```bash
cd ~/Code/amiexpress-web

# Interactive login
./bbs-login.sh

# Run basic tests
node test-bbs-commands.js

# Run deep integration tests
node test-bbs-deep.js

# Run ALL tests
./test-all.sh
```

### From Any Directory
```bash
# Navigate to project root first
cd ~/Code/amiexpress-web

# Then run commands
./bbs-login.sh
node test-bbs-deep.js
```

## 🎯 Running Tests

### Option 1: Individual Test Scripts
```bash
# Basic command tests (50+ tests, ~2-3 min)
node test-bbs-commands.js

# Deep workflow tests (60+ tests, ~5-10 min)
node test-bbs-deep.js
```

### Option 2: Test Runner
```bash
# Run only basic tests
./test-all.sh http://localhost:3001 testuser testpass basic

# Run only deep tests
./test-all.sh http://localhost:3001 testuser testpass deep

# Run both (default)
./test-all.sh
```

### Option 3: Automated Test Runner
```bash
# With server checks
./run-bbs-tests.sh

# Verbose mode
./run-bbs-tests.sh --verbose
```

## 📝 Important Notes

1. **Always run from project root** (`~/Code/amiexpress-web`)
2. **Install dependencies first**: `npm install socket.io-client`
3. **Make sure BBS server is running** on port 3001
4. **Use VERBOSE=1** to see all output: `VERBOSE=1 node test-bbs-deep.js`

## 🔧 Troubleshooting

### Error: Cannot find module
```bash
# You're in the wrong directory. Navigate to project root:
cd ~/Code/amiexpress-web
pwd  # Should show: ~/Code/amiexpress-web
```

### Error: socket.io-client not found
```bash
npm install socket.io-client
```

### Error: Permission denied
```bash
chmod +x *.sh *.js
```

## 📚 Full Documentation

- [BBS-CLI-README.md](BBS-CLI-README.md) - Complete CLI usage guide
- [BBS-TESTING-GUIDE.md](BBS-TESTING-GUIDE.md) - Comprehensive testing guide
- [BBS-CLI-IMPLEMENTATION.md](BBS-CLI-IMPLEMENTATION.md) - Technical details

## ✅ Verification

To verify everything is set up correctly:

```bash
# Check you're in the right directory
pwd
# Should output: ~/Code/amiexpress-web

# List all test files
ls -la | grep -E "(test-|bbs-|run-)"

# You should see:
# bbs-cli.js
# bbs-login.sh
# run-bbs-tests.sh
# test-all.sh
# test-bbs-commands.js
# test-bbs-deep.js
```

## 🎨 Test Coverage

- **Basic Tests**: 50+ commands (surface-level validation)
- **Deep Tests**: 60+ workflows (complete user journeys)
- **Total**: 110+ comprehensive tests
- **Coverage**: 100% of BBS functionality

---

**Created:** 2025-10-28  
**Location:** Project Root (`~/Code/amiexpress-web`)