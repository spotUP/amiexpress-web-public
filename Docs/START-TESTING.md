# How to Test the BBS - Complete Guide

## ⚡ FULLY AUTOMATED - Just Run the Script!

The test scripts now handle **EVERYTHING** automatically:
- ✅ Install dependencies
- ✅ Start server (if not running)
- ✅ Run tests
- ✅ Clean up

## 🚀 Quick Start (One Command)

```bash
cd ~/Code/amiexpress-web
./test-all.sh
```

**That's it!** The script does everything for you.

## 📋 Available Test Scripts

### Option 1: Full Test Suite (Recommended)
```bash
./test-all.sh
```
- Installs dependencies automatically
- Starts server automatically
- Runs both basic (50+) and deep (60+) tests
- Stops server when done

### Option 2: Basic Tests Only
```bash
./run-bbs-tests.sh
```
- Runs 50+ basic command tests
- Auto-handles server + deps

### Option 3: Deep Tests Only
```bash
./test-all.sh localhost:3001 testuser testpass deep
```
- Runs 60+ deep workflow tests
- Auto-handles server + deps

## 🎛️ Advanced Options

### Keep Server Running
```bash
KEEP_SERVER_RUNNING=true ./test-all.sh
```
Server stays running after tests complete.

### Verbose Mode
```bash
VERBOSE=1 ./test-all.sh
```
Shows all ANSI output during tests.

### Custom Credentials
```bash
./test-all.sh http://localhost:3001 sysop mysecret
```

### Only Basic or Deep Tests
```bash
./test-all.sh localhost:3001 user pass basic  # Basic only
./test-all.sh localhost:3001 user pass deep   # Deep only
./test-all.sh localhost:3001 user pass both   # Both (default)
```

## 📊 What Gets Tested

### Basic Tests (50+ tests, ~2-3 minutes)
- All BBS commands
- Navigation
- Messages
- Files
- User operations

### Deep Tests (60+ tests, ~5-10 minutes)
- **Complete message entry workflows**
  - Public messages: E → ALL → subject → body → save
  - Private messages: E → recipient → subject → body → save
  - Message cancellation
  
- **Complete message reading workflows**
  - Full reader navigation: R → ? → A → L → Enter → Q
  - Reply workflow
  - Delete workflow
  
- **Complete conference operations**
  - Multi-conference switching
  - Navigation keys
  - Conference isolation
  
- **Complete file operations**
  - File listing with pagination
  - File search (Z, ZOOM)
  - New files filtering
  
- **Complete user workflows**
  - Statistics displays
  - Mode toggles (multiple cycles)
  - Parameter verification

## 🔧 Manual Server Control (Optional)

If you want to manually control the server:

### Start Server Manually
```bash
# Terminal 1
npm run start:backend
```

### Run Tests with Existing Server
```bash
# Terminal 2
./test-all.sh
# Script will detect running server and use it
```

## 📝 Output Examples

### Successful Run
```
╔════════════════════════════════════════════════════════════╗
║    AmiExpress BBS - Fully Automated Test Suite            ║
║    Handles dependencies + server + testing                 ║
╚════════════════════════════════════════════════════════════╝

[1/5] Checking project structure...
      ✓ Project structure OK

[2/5] Installing dependencies...
      ✓ socket.io-client already installed

[3/5] Checking/starting BBS server...
      Server not running, starting it...
      Server PID: 12345
      Waiting for server to be ready...
      ✓ Server is ready at http://localhost:3001

[4/5] Verifying server connectivity...
      ✓ Server responding correctly

[5/5] Running test suite...

╔═══════════════════════════════════════════════════════════╗
║     Running Basic Command Tests (50+ tests)              ║
╚═══════════════════════════════════════════════════════════╝

... tests run ...

✓ Basic tests PASSED

╔═══════════════════════════════════════════════════════════╗
║     Running Deep Integration Tests (60+ tests)           ║
╚═══════════════════════════════════════════════════════════╝

... tests run ...

✓ Deep tests PASSED

╔════════════════════════════════════════════════════════════╗
║                    Final Summary                           ║
╚════════════════════════════════════════════════════════════╝

╔════════════════════════════════════════════════════════════╗
║        ✓✓✓ ALL TESTS PASSED (110+ tests) ✓✓✓             ║
╚════════════════════════════════════════════════════════════╝

Basic Tests:  ✓ PASSED
Deep Tests:   ✓ PASSED
Total:        110+ tests successful

[CLEANUP] Stopping server (PID: 12345)...
[CLEANUP] Server stopped
```

## 🐛 Troubleshooting

### Error: "Cannot find module"
**Problem:** Wrong directory

**Solution:**
```bash
cd ~/Code/amiexpress-web
pwd  # Verify: ~/Code/amiexpress-web
./test-all.sh
```

### Server Won't Start
**Problem:** Port 3001 in use

**Solution 1 - Find and kill:**
```bash
lsof -i :3001
kill -9 <PID>
./test-all.sh
```

**Solution 2 - Use different port:**
```bash
./test-all.sh http://localhost:3002
```

### Tests Fail
**Problem:** Various test failures

**Solution - Run with verbose:**
```bash
VERBOSE=1 ./test-all.sh
```

Check server logs:
```bash
tail -f /tmp/bbs-server.log
```

## 💡 Pro Tips

### 1. Run Specific Test Type
```bash
./test-all.sh localhost:3001 user pass deep  # Only deep tests
```

### 2. Keep Server for Multiple Test Runs
```bash
KEEP_SERVER_RUNNING=true ./test-all.sh
# Run more tests without restarting server
./test-all.sh
```

### 3. Debug Mode
```bash
VERBOSE=1 ./test-all.sh
# See all ANSI output and detailed logs
```

### 4. Interactive Testing
After automated tests, use CLI client:
```bash
./bbs-login.sh
# Then type commands: M, J 1, R, E, etc.
```

## 📚 Additional Documentation

- [README-BBS-CLI.md](README-BBS-CLI.md) - Quick reference
- [BBS-CLI-README.md](BBS-CLI-README.md) - Complete CLI guide
- [BBS-TESTING-GUIDE.md](BBS-TESTING-GUIDE.md) - Detailed testing guide
- [BBS-CLI-IMPLEMENTATION.md](BBS-CLI-IMPLEMENTATION.md) - Technical details

## ✅ Summary

**Just run:** `./test-all.sh`

The script handles everything:
1. ✅ Checks project structure
2. ✅ Installs socket.io-client if needed
3. ✅ Starts server if not running
4. ✅ Waits for server to be ready
5. ✅ Runs all tests
6. ✅ Stops server when done

**No manual steps required!**

---

**Remember:** The test scripts are now fully automated. Just run `./test-all.sh` and let it handle everything!