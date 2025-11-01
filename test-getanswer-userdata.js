/**
 * Test GetAnswer Door with User Data Query Commands
 *
 * Tests that DT_NAME, DT_LOCATION, DT_PHONENUMBER, DT_REALNAME are implemented
 * and that GetAnswer door can retrieve user signup data
 */

const puppeteer = require('puppeteer');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testGetAnswerDoor() {
  console.log('=== GetAnswer Door User Data Test ===\n');

  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    dumpio: false
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    console.log('1. Connecting to BBS...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle2' });

    // Wait for connection
    await sleep(1500);

    // Answer ANSI prompt
    console.log('2. Selecting ANSI mode...');
    await page.keyboard.type('A');
    await page.keyboard.press('Enter');
    await sleep(750);

    // Login as sysop (who has user data filled in)
    console.log('3. Logging in as sysop...');
    await page.keyboard.type('sysop');
    await page.keyboard.press('Enter');
    await sleep(750);

    await page.keyboard.type('sysop');
    await page.keyboard.press('Enter');
    await sleep(2000);

    console.log('4. Running GetAnswer door...');
    await page.keyboard.type('DOORS');
    await page.keyboard.press('Enter');
    await sleep(750);

    // Select GetAnswer door (assuming it's option 3)
    await page.keyboard.type('3');
    await page.keyboard.press('Enter');

    console.log('5. Door executing - watching for user data queries...');
    console.log('   (Check backend logs for DT_NAME, DT_LOCATION, etc. queries)\n');

    // Wait for door to complete (30 seconds max)
    await sleep(30000);

    console.log('\n=== Test Complete ===');
    console.log('\nExpected in backend logs:');
    console.log('  [XIMProtocol] Door querying data: DT_NAME');
    console.log('  [READ] DT_NAME: "sysop"');
    console.log('  [XIMProtocol] Door querying data: DT_LOCATION');
    console.log('  [READ] DT_LOCATION: "..."');
    console.log('  [XIMProtocol] Door querying data: DT_REALNAME');
    console.log('  [READ] DT_REALNAME: "..."');
    console.log('\nIf door displays user data, implementation is WORKING! 🎉');

  } catch (error) {
    console.error('Error during test:', error);
  } finally {
    console.log('\nClosing browser in 5 seconds...');
    await sleep(5000);
    await browser.close();
  }
}

testGetAnswerDoor();
