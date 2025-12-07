# AmiExpress BBS - Command Line Interface & Test Suite

This directory contains bash scripts for interacting with and testing the AmiExpress BBS from the command line.

## 📁 Files

- **`bbs-cli.js`** - Node.js-based Socket.io CLI client for the BBS
- **`bbs-login.sh`** - Bash wrapper script for easy login
- **`test-bbs-commands.js`** - Comprehensive test suite for all 45+ BBS commands
- **`BBS-CLI-README.md`** - This documentation file

## 🚀 Quick Start

### Prerequisites

```bash
# Install socket.io-client dependency
npm install socket.io-client
```

### Using the CLI Client

#### Interactive Mode (Manual Login)
```bash
./bbs-login.sh
```

#### With Server URL
```bash
./bbs-login.sh http://localhost:3001
```

#### Auto-Login Mode
```bash
./bbs-login.sh http://localhost:3001 username password
```

#### Direct Node.js Usage
```bash
node bbs-cli.js http://localhost:3001 username password
```

### Running Tests

#### Run All Command Tests
```bash
node test-bbs-commands.js
```

#### Test with Specific Server
```bash
node test-bbs-commands.js http://localhost:3001
```

#### Test with Auto-Login
```bash
node test-bbs-commands.js http://localhost:3001 testuser testpass
```

#### Verbose Mode (Show All Output)
```bash
VERBOSE=1 node test-bbs-commands.js
```

## 📋 Available BBS Commands

The test suite covers all commands from the original AmiExpress express.e implementation:

### Navigation Commands
- `M` - Main Menu (toggle ANSI)
- `<` - Previous Conference
- `>` - Next Conference
- `<<` - Previous Message Base
- `>>` - Next Message Base

### Conference & Message Base Commands
- `J [#]` - Join Conference
- `JM [#]` - Join Message Base
- `CF` - Conference Flags
- `CM` - Conference Maintenance (sysop)
- `NM` - Node Management (sysop)

### Message Commands
- `R [params]` - Read Messages
- `E [params]` - Enter Message
- `MS` - Mail Scan

#### Message Reader Subcommands
- `A` - Again (redisplay message)
- `D` - Delete Message
- `F` - Forward Message
- `R` - Reply to Message
- `L` - List Messages
- `Q` - Quit Reader
- `?` - Help
- `Enter` - Next Message

### File Commands
- `F [params]` - File List
- `FR [params]` - File List Raw
- `FS` - File Status
- `FM` - File Maintenance (sysop)
- `N [date]` - New Files
- `U [params]` - Upload
- `D [params]` - Download
- `Z [keyword]` - Zippy Search
- `ZOOM [keyword]` - Zoom Search
- `V [filename]` - View File
- `^` - Upload Hat

### Communication Commands
- `C [params]` - Comment to Sysop
- `O` - Page Sysop
- `W` - Who's Online
- `WHO` - Who's Online (list)
- `WHD` - Who's Online (detailed)
- `OLM [params]` - Online Message

### User Commands
- `S` - System Statistics
- `US` - User Statistics
- `UP` - User Parameters
- `WUP` - Write User Parameters
- `RL [password]` - Relogon

### Mode Toggle Commands
- `A` - Toggle ANSI Mode
- `X` - Toggle Expert Mode
- `Q` - Toggle Quiet Mode

### Utility Commands
- `H [keyword]` - Help
- `?` - Help Menu
- `T` - Time/Time Left
- `VER` - Version Info
- `B [number]` - Read Bulletins
- `GR` - Greetings
- `G [params]` - Goodbye/Logoff

### Transfer & Special Commands
- `RZ [filename]` - Zmodem Download
- `VO` - Voting Booth
- `1-5` - Door Program Slots

## 🎯 Usage Examples

### Example 1: Interactive Session
```bash
# Start the BBS CLI
./bbs-login.sh

# Wait for connection screens
# Type username when prompted
# Type password when prompted

# Once logged in, use any BBS command:
M           # Display menu
J 1         # Join conference 1
R           # Read messages
E           # Enter a message
F           # List files
WHO         # See who's online
G           # Goodbye (logout)
```

### Example 2: Automated Testing
```bash
# Run comprehensive test suite
node test-bbs-commands.js

# Results will show:
# - Total tests run
# - Pass/Fail counts
# - Pass rate percentage
# - List of any failed tests
```

### Example 3: Quick Command Test
```bash
# Login and run a single command
echo "M" | node bbs-cli.js http://localhost:3001 testuser testpass
```

## 🔧 Troubleshooting

### Connection Issues
```bash
# Check if server is running
curl http://localhost:3001

# Check server logs
tail -f web/backend/logs/server.log
```

### Socket.io Not Found
```bash
# Install dependency
npm install socket.io-client

# Or install globally
npm install -g socket.io-client
```

### Permission Denied
```bash
# Make scripts executable
chmod +x bbs-cli.js bbs-login.sh test-bbs-commands.js
```

## 📊 Test Suite Details

### Test Coverage
The test suite (`test-bbs-commands.js`) covers:
- ✅ 45+ commands from express.e
- ✅ Navigation between conferences
- ✅ Message reader operations
- ✅ File operations
- ✅ User preferences
- ✅ System commands
- ✅ Invalid command handling

### Test Categories
1. **Navigation Commands** (5 tests)
2. **Conference & Message Base** (5 tests)
3. **Message Commands** (10+ tests)
4. **File Commands** (8 tests)
5. **Communication Commands** (3 tests)
6. **User Commands** (3 tests)
7. **Mode Toggles** (3 tests)
8. **Utility Commands** (6 tests)
9. **Advanced Commands** (5 tests)
10. **Error Handling** (2 tests)

### Test Configuration
- Default delay between commands: 1000ms
- Response wait time: 2000ms
- Auto-creates test user if not found
- Captures all ANSI output
- Exits with code 0 (success) or 1 (failures)

## 🎨 CLI Features

### ANSI Output Support
The CLI client displays:
- ✅ Full ANSI color codes
- ✅ Cursor positioning
- ✅ Screen clearing
- ✅ Text formatting (bold, dim, etc.)
- ✅ BBS artwork and screens

### Interactive Features
- ✅ Real-time ANSI output
- ✅ Command history (readline)
- ✅ Auto-login support
- ✅ Graceful disconnect (Ctrl+C)
- ✅ Connection status display

### Chat Support
- ✅ Internode chat events
- ✅ Group chat room events
- ✅ Chat message display
- ✅ Chat notifications

## 📝 Notes

### File Uploads
File upload operations are not supported in CLI mode as they require browser-based file selection. Use the web interface for file uploads.

### Long-Running Commands
Some commands (like file listings or message scans) may take several seconds. The test suite accounts for this with appropriate delays.

### Sysop Commands
Sysop-level commands (CM, FM, NM) require appropriate security level. Test results may vary based on user permissions.

### Server Requirements
- Server must be running on specified URL
- Socket.io connection must be available
- Database must be initialized
- User accounts must exist (or auto-registration enabled)

## 🔍 Advanced Usage

### Custom Test Scenarios
```javascript
// Create custom test script
const BBSCommandTester = require('./test-bbs-commands.js');

async function customTest() {
  const tester = new BBSCommandTester('http://localhost:3001', 'user', 'pass');
  await tester.connect();
  await tester.login();
  
  // Run your custom commands
  await tester.sendCommand('J 1', null, 'Join conference 1');
  await tester.sendCommand('R', null, 'Read messages');
  
  tester.printResults();
}
```

### Environment Variables
```bash
# Enable verbose output
export VERBOSE=1

# Run tests
node test-bbs-commands.js
```

### CI/CD Integration
```bash
# Add to your CI pipeline
npm install socket.io-client
node test-bbs-commands.js http://your-server:3001 testuser testpass

# Check exit code
if [ $? -eq 0 ]; then
  echo "All tests passed!"
else
  echo "Tests failed!"
  exit 1
fi
```

## 📚 References

- [Complete Command List](dev/docs-backup/COMPLETE_COMMAND_LIST.md)
- [AmiExpress Documentation](dev/docs-backup/AmiExpressDocs/)
- [Socket.io Client Docs](https://socket.io/docs/v4/client-api/)

## 🤝 Contributing

To add new tests or commands:

1. Edit `test-bbs-commands.js`
2. Add test cases to appropriate category
3. Update command list in this README
4. Run full test suite to verify
5. Submit pull request

## 📄 License

Part of the AmiExpress Web project. See main project LICENSE file.

---

**Last Updated:** 2025-10-28  
**Version:** 1.0.0  
**Compatibility:** AmiExpress Web BBS (Socket.io backend)