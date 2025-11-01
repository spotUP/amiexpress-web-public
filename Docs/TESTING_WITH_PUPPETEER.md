# Testing with Puppeteer - Standard Testing Protocol
## 2025-10-31

## CRITICAL: Always Use the Test Script

**When debugging doors, commands, or any BBS functionality, ALWAYS use the Puppeteer test script instead of manual browser testing.**

### Why This Is Important

1. **Consistency** - The script executes the exact same key sequence every time
2. **Speed** - No need to manually type login credentials repeatedly
3. **Logging** - Script output shows exactly what's being tested
4. **Reproducibility** - Other developers can run the same test
5. **Documentation** - The script serves as executable documentation of the test procedure

### The Standard Test Script

**Location**: `/test-ga-command.js` (root of project)

This is the **master template** for all BBS testing. When testing different features, copy and modify this script.

## Standard Test Procedure

### 1. Copy the Test Script
```bash
cp test-ga-command.js test-[feature-name].js
```

Examples:
- `test-bulletin-command.js` - For testing bulletin system
- `test-file-upload.js` - For testing file uploads
- `test-message-entry.js` - For testing message entry
- `test-door-bulls.js` - For testing Bulls door

### 2. Modify for Your Feature

**Change the command being tested:**
```javascript
// Original:
console.log('\n🚪 Executing GA command...');
await page.keyboard.type('GA');
await page.keyboard.press('Enter');

// Modified for testing Bulls door:
console.log('\n🚪 Executing B command...');
await page.keyboard.type('B');
await page.keyboard.press('Enter');
```

**Adjust wait times if needed:**
```javascript
// For doors that take longer to execute:
await sleep(30000); // Wait 30 seconds instead of 15

// For quick commands:
await sleep(3000); // Wait 3 seconds
```

**Change monitoring instructions:**
```javascript
console.log('💡 Monitor backend logs in another terminal:');
console.log('   tail -f /tmp/backend.log | grep -E "Bulls|BULL|🔊"\n');
```

### 3. Run Your Test
```bash
node test-[feature-name].js
```

The script will:
1. Launch browser (visible, not headless)
2. Login automatically
3. Execute your command
4. Show terminal output
5. Keep browser open for inspection

### 4. Monitor Backend Logs Simultaneously

**Always run this in a separate terminal while testing:**
```bash
tail -f /tmp/backend.log | grep -E "YourFeature|ERROR|🔊"
```

## The Correct Login Sequence

**CRITICAL: This is the ONLY correct sequence for automated testing:**

```javascript
// 1. ANSI Graphics Selection
await page.keyboard.type('A');
await page.keyboard.press('Enter');
await sleep(1000);

// 2. Username
await page.keyboard.type('sysop');
await page.keyboard.press('Enter');
await sleep(1000);

// 3. Password
await page.keyboard.type('sysop');
await page.keyboard.press('Enter');
await sleep(3000);

// 4. First Prompt (bulletin/news)
await page.keyboard.press('Enter');
await sleep(2000);

// 5. Second Prompt (pause after screens)
await page.keyboard.press('Enter');
await sleep(2000);

// 6. Wait for command prompt
await sleep(2000);

// NOW you can type commands
await page.keyboard.type('YOUR_COMMAND');
await page.keyboard.press('Enter');
```

**Do NOT:**
- ❌ Use `page.keyboard.type('A\r')` - This doesn't work reliably
- ❌ Skip the two Enter presses after login
- ❌ Use different timing - the script timing is tested and works
- ❌ Try to detect prompts dynamically - timing is more reliable

## When Testing Changes

### Before Making Code Changes
```bash
# 1. Run baseline test
node test-[feature].js

# 2. Note the output/behavior
# 3. Make your code changes
# 4. Restart backend
./dev/scripts/start-backend.sh

# 5. Run test again
node test-[feature].js

# 6. Compare behavior
```

### Testing Loop
```bash
# Quick iteration cycle:
while true; do
  echo "=== Testing iteration ==="
  ./dev/scripts/start-backend.sh
  sleep 5
  node test-ga-command.js
  echo "Press Ctrl+C to stop, or any key to continue..."
  read
done
```

## Common Test Scenarios

### Testing a Door
```javascript
// test-door-[doorname].js
console.log('\n🚪 Executing [DOOR] command...');
await page.keyboard.type('[COMMAND]');
await page.keyboard.press('Enter');
await sleep(15000); // Doors usually take longer

// Check for door-specific output
if (terminalText.includes('[EXPECTED_TEXT]')) {
  console.log('\n✅ SUCCESS: Door produced output!');
} else {
  console.log('\n❌ NO OUTPUT: Door did not respond');
}
```

### Testing a Command
```javascript
// test-command-[name].js
console.log('\n⚙️  Executing [COMMAND]...');
await page.keyboard.type('[COMMAND]');
await page.keyboard.press('Enter');
await sleep(3000);

// Verify expected behavior
const hasExpectedOutput = terminalText.includes('[EXPECTED]');
console.log(hasExpectedOutput ? '✅ PASS' : '❌ FAIL');
```

### Testing User Input Flow
```javascript
// For commands that prompt for input
await page.keyboard.type('COMMAND');
await page.keyboard.press('Enter');
await sleep(1000);

// Respond to first prompt
await page.keyboard.type('response1');
await page.keyboard.press('Enter');
await sleep(1000);

// Respond to second prompt
await page.keyboard.type('response2');
await page.keyboard.press('Enter');
```

## Advanced: Monitoring Multiple Things

```javascript
// Monitor both terminal and console
page.on('console', msg => {
  const text = msg.text();
  if (text.includes('ERROR') || text.includes('XIM') || text.includes('Door')) {
    console.log('🖥️  [BROWSER]', text);
  }
});

// Take screenshots at key moments
await page.screenshot({ path: 'before-command.png' });
await page.keyboard.type('GA');
await page.keyboard.press('Enter');
await sleep(5000);
await page.screenshot({ path: 'after-command.png' });
```

## Debugging Failed Tests

### Test Passes Manually but Fails in Script
**Problem**: Timing issues
**Solution**: Increase sleep times
```javascript
// From:
await sleep(2000);
// To:
await sleep(5000);
```

### Script Can't Login
**Problem**: Wrong sequence or timing
**Solution**: Verify you're using the exact sequence above

### Door Doesn't Execute
**Problem**: Not at command prompt yet
**Solution**: Add more sleep time after the two Enter presses
```javascript
await page.keyboard.press('Enter');
await sleep(2000);
await page.keyboard.press('Enter');
await sleep(5000); // Increased from 2000
```

### Terminal Shows Nothing
**Problem**: Output not being captured
**Solution**: Check `.xterm-rows` selector is correct
```javascript
const terminalText = await page.evaluate(() => {
  const term = document.querySelector('.xterm-rows');
  if (!term) {
    console.log('ERROR: Terminal element not found!');
    return '';
  }
  return term.textContent;
});
```

## Best Practices

### DO:
- ✅ Copy `test-ga-command.js` as your starting point
- ✅ Use the exact login sequence from the master template
- ✅ Keep browser visible (`headless: false`) during development
- ✅ Monitor backend logs in a separate terminal
- ✅ Save your test script in the project root with a descriptive name
- ✅ Add console.log statements to show what's being tested
- ✅ Keep the browser open for 2+ minutes for manual inspection
- ✅ Document what output you expect in the script

### DON'T:
- ❌ Type login credentials manually when testing
- ❌ Close the browser immediately - keep it open for inspection
- ❌ Change the timing without testing thoroughly
- ❌ Use `\r` or `\n` in keyboard.type() - use keyboard.press('Enter')
- ❌ Try to parse terminal output to detect prompts - use fixed timing
- ❌ Run tests without monitoring backend logs
- ❌ Forget to restart backend after code changes

## Template Scripts

### Basic Command Test Template
```javascript
#!/usr/bin/env node
const puppeteer = require('puppeteer');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testCommand() {
  console.log('🧪 Testing [COMMAND_NAME]\n');

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1280, height: 900 }
  });

  try {
    const page = await browser.newPage();

    await page.goto('http://localhost:5173');
    await sleep(2000);

    // Login sequence (DO NOT MODIFY)
    await page.keyboard.type('A');
    await page.keyboard.press('Enter');
    await sleep(1000);

    await page.keyboard.type('sysop');
    await page.keyboard.press('Enter');
    await sleep(1000);

    await page.keyboard.type('sysop');
    await page.keyboard.press('Enter');
    await sleep(3000);

    await page.keyboard.press('Enter');
    await sleep(2000);

    await page.keyboard.press('Enter');
    await sleep(2000);

    // Execute your command
    console.log('⚙️  Executing command...');
    await page.keyboard.type('YOUR_COMMAND');
    await page.keyboard.press('Enter');
    await sleep(5000);

    // Check result
    const text = await page.evaluate(() => {
      return document.querySelector('.xterm-rows')?.textContent || '';
    });

    console.log('\n📋 Output:', text.substring(text.length - 200));

    await sleep(120000); // Keep open 2 minutes

  } finally {
    await browser.close();
  }
}

testCommand().catch(console.error);
```

## Integration with CLAUDE.md

This testing protocol should be followed for:
- All door testing
- All command implementation verification
- Any BBS functionality changes
- Before committing changes
- When reproducing bugs

**Remember**: The test script is as important as the code itself. It's executable documentation of how the feature should work.
