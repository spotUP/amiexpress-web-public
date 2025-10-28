# AmiExpress BBS - Manual Testing Guide

## 🎯 Best Approach: Use the Interactive CLI Client

The automated test scripts can't properly show output with prompts due to readline/stdout conflicts. 

**Instead, use the fully functional interactive CLI client:**

## 🚀 Manual Testing (Recommended)

### Step 1: Start Server
```bash
cd ~/Code/amiexpress-web/web/backend
npm install  # First time only
npm start
```

### Step 2: Start CLI Client (New Terminal)
```bash
cd ~/Code/amiexpress-web
./bbs-login.sh localhost:3001 sysop sysop
```

### Step 3: Test Commands Manually

You'll see ALL BBS output in real-time. Just type commands and verify they work:

```
# After login, you'll see the menu

# Test navigation
M        # Should display menu
>        # Should switch to next conference
<        # Should switch to previous conference

# Test conference join
J 1      # Should join conference 1
J 2      # Should join conference 2

# Test message base
>>       # Next message base
<<       # Previous message base
JM 1     # Join message base 1

# Test messages
E        # Enter message
ALL      # Recipient
Test     # Subject
Line 1   # Body
Line 2   # Body
         # (empty line to end)
S        # Save

R        # Read messages
?        # Help
A        # Again (redisplay)
L        # List
Q        # Quit

MS       # Mail scan

# Test files
F        # File list
FS       # File status
N        # New files
Z TEST   # Search

# Test user commands
W        # Who's online
S        # System stats
US       # User stats
UP       # User parameters

# Test utilities
?        # Help
T        # Time
VER      # Version

# Test modes
A        # Toggle ANSI
X        # Toggle expert
Q        # Toggle quiet

# When done
G        # Goodbye
```

## 📋 Manual Test Checklist

Copy this checklist and mark tests as you verify them:

### Navigation Commands
- [ ] M - Main menu displays
- [ ] `>` - Next conference works
- [ ] `<` - Previous conference works
- [ ] `>>` - Next message base works
- [ ] `<<` - Previous message base works

### Conference Operations
- [ ] J 1 - Join conference 1
- [ ] J 2 - Join conference 2  
- [ ] J (prompt) - Shows conference list
- [ ] JM 1 - Join message base
- [ ] CF - Conference flags display

### Message Entry
- [ ] E - Enter message mode
- [ ] ALL - Recipient works
- [ ] Subject entry works
- [ ] Body lines accept input
- [ ] Empty line ends entry
- [ ] S - Saves message
- [ ] Message appears in database

### Message Reader
- [ ] R - Enters reader
- [ ] ? - Help displays
- [ ] A - Redisplays message
- [ ] L - Lists messages
- [ ] Enter - Next message
- [ ] Q - Quits reader

### File Operations
- [ ] F - File list displays
- [ ] FR - Raw file list
- [ ] FS - File status shows
- [ ] N - New files display
- [ ] Z keyword - Search works

### Communication
- [ ] W - Who's online
- [ ] WHO - List format
- [ ] WHD - Detailed format
- [ ] C - Comment prompt

### User Commands
- [ ] S - System stats display
- [ ] US - User stats display
- [ ] UP - User parameters show

### Utilities
- [ ] ? - Help menu
- [ ] T - Time displays
- [ ] VER - Version shows
- [ ] GR - Greetings display

### Mode Toggles
- [ ] A - ANSI toggles
- [ ] X - Expert toggles
- [ ] Q - Quiet toggles

## 🎯 Recommended Testing Order

1. **Start with Navigation** (M, >, <, J)
2. **Test Conference Switching** (J 1, J 2, J 3, back to 1)
3. **Test Message Entry** (Complete workflow E → ALL → subject → body → save)
4. **Test Message Reader** (R, ?, A, L, Q)
5. **Test Files** (F, FS, N, Z)
6. **Test Users** (W, S, US, UP)
7. **Test Utilities** (?, T, VER)
8. **Test Modes** (A, X, Q)

## 📝 Recording Results

As you test, note any issues:

```
Test: J 2 (Join Conference 2)
Result: ✓ Works - switched to conference 2
Output: "Joined conference: Technical Support"

Test: E (Enter Message)  
Result: ✗ Failed - no recipient prompt
Output: Returned to menu immediately

Test: R (Read Messages)
Result: ✓ Works - entered reader, shows message
Output: "Message 1 of 5..."
```

## 💡 Why This Approach?

The interactive CLI client ([`bbs-cli.js`](bbs-cli.js)) is **better** for manual testing because:

- ✅ Shows ALL output immediately
- ✅ No readline/stdout conflicts
- ✅ Real-time interaction
- ✅ Natural BBS experience
- ✅ You can test anything, anytime
- ✅ No script delays or timing issues

## 🔄 Automated Testing

For automated testing without manual verification:

```bash
# Run automated deep tests (60+ tests)
node test-bbs-deep.js

# Run automated basic tests (50+ tests)
node test-bbs-commands.js

# Run all automated tests
./test-all.sh
```

These run without prompts and verify programmatically.

## ✅ Recommendation

**For verifying BBS functionality:** Use [`./bbs-login.sh`](bbs-login.sh)

**For automated regression testing:** Use [`./test-all.sh`](test-all.sh)

**For CI/CD pipelines:** Use automated tests

---

The interactive CLI client is the best tool for manual verification and testing!