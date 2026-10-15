#!/usr/bin/env npx tsx
/**
 * Reusable Test Framework for AmiExpress BBS
 *
 * Purpose: Eliminate one-off test scripts by providing reusable utilities
 * for testing BBS commands, doors, and interactions.
 *
 * Usage:
 *   npx tsx Scripts/test-framework.ts door WHO2
 *   npx tsx Scripts/test-framework.ts command "WHO"
 *   npx tsx Scripts/test-framework.ts login sysop sysop
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const BBS_URL = 'http://localhost:5173';
const BACKEND_PORT = 3001;
const FRONTEND_PORT = 5173;

// ============================================================================
// ANSI Code Utilities
// ============================================================================

export function stripAnsi(text: string): string {
  // Remove ANSI escape codes
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

export function extractAnsiText(html: string): string {
  // Extract text from ANSI terminal output
  const match = html.match(/<body[^>]*>(.*?)<\/body>/is);
  if (!match) return '';

  const body = match[1];
  const text = body
    .replace(/<[^>]+>/g, '') // Remove HTML tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

  return stripAnsi(text);
}

// ============================================================================
// Server Management
// ============================================================================

export class ServerManager {
  private backendProcess: ChildProcess | null = null;
  private frontendProcess: ChildProcess | null = null;

  async start(): Promise<void> {
    console.log('[ServerManager] Starting servers...');

    // Kill any existing processes on these ports
    await this.killPort(BACKEND_PORT);
    await this.killPort(FRONTEND_PORT);

    // Wait for ports to be free
    await this.delay(2000);

    // Start backend
    this.backendProcess = spawn('./dev/scripts/start-backend.sh', [], {
      cwd: process.cwd(),
      detached: false,
      stdio: 'ignore'
    });

    await this.delay(3000);

    // Start frontend
    this.frontendProcess = spawn('./dev/scripts/start-frontend.sh', [], {
      cwd: process.cwd(),
      detached: false,
      stdio: 'ignore'
    });

    await this.delay(3000);

    console.log('[ServerManager] Servers started');
  }

  async stop(): Promise<void> {
    console.log('[ServerManager] Stopping servers...');

    if (this.frontendProcess) {
      this.frontendProcess.kill();
      this.frontendProcess = null;
    }

    if (this.backendProcess) {
      this.backendProcess.kill();
      this.backendProcess = null;
    }

    // Kill any remaining processes
    await this.killPort(BACKEND_PORT);
    await this.killPort(FRONTEND_PORT);

    console.log('[ServerManager] Servers stopped');
  }

  private async killPort(port: number): Promise<void> {
    try {
      const { execSync } = require('child_process');
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore' });
    } catch (error) {
      // Ignore errors (port may not be in use)
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// BBS Session Manager
// ============================================================================

export class BBSSession {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private loggedIn: boolean = false;

  async connect(): Promise<void> {
    console.log('[BBSSession] Launching browser...');

    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1280, height: 800 });

    console.log(`[BBSSession] Connecting to ${BBS_URL}...`);
    await this.page.goto(BBS_URL, { waitUntil: 'networkidle0' });

    // Wait for terminal to load
    await this.page.waitForSelector('body', { timeout: 10000 });
    await this.delay(2000);

    console.log('[BBSSession] Connected');
  }

  async login(username: string, password: string): Promise<void> {
    if (!this.page) throw new Error('Not connected');

    console.log(`[BBSSession] Logging in as ${username}...`);

    // Wait for login prompt
    await this.delay(2000);

    // Type username
    await this.page.keyboard.type(username);
    await this.page.keyboard.press('Enter');
    await this.delay(1000);

    // Type password
    await this.page.keyboard.type(password);
    await this.page.keyboard.press('Enter');
    await this.delay(3000);

    this.loggedIn = true;
    console.log('[BBSSession] Logged in');
  }

  async sendCommand(command: string, waitMs: number = 2000): Promise<string> {
    if (!this.page) throw new Error('Not connected');
    if (!this.loggedIn) throw new Error('Not logged in');

    console.log(`[BBSSession] Sending command: ${command}`);

    await this.page.keyboard.type(command);
    await this.page.keyboard.press('Enter');
    await this.delay(waitMs);

    return await this.getOutput();
  }

  async sendKeys(keys: string, waitMs: number = 1000): Promise<string> {
    if (!this.page) throw new Error('Not connected');

    for (const key of keys) {
      await this.page.keyboard.type(key);
      await this.delay(100);
    }
    await this.delay(waitMs);

    return await this.getOutput();
  }

  async pressEnter(waitMs: number = 1000): Promise<string> {
    if (!this.page) throw new Error('Not connected');

    await this.page.keyboard.press('Enter');
    await this.delay(waitMs);

    return await this.getOutput();
  }

  async getOutput(): Promise<string> {
    if (!this.page) throw new Error('Not connected');

    const html = await this.page.content();
    return extractAnsiText(html);
  }

  async takeScreenshot(filename: string): Promise<void> {
    if (!this.page) throw new Error('Not connected');

    const screenshotPath = path.join(process.cwd(), 'Screenshots', filename);
    await this.page.screenshot({
      path: screenshotPath,
      type: 'jpeg',
      quality: 80
    });

    console.log(`[BBSSession] Screenshot saved: ${screenshotPath}`);
  }

  async checkConsoleErrors(): Promise<string[]> {
    if (!this.page) throw new Error('Not connected');

    const errors: string[] = [];

    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    return errors;
  }

  async disconnect(): Promise<void> {
    if (this.browser) {
      console.log('[BBSSession] Disconnecting...');
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.loggedIn = false;
      console.log('[BBSSession] Disconnected');
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Test Utilities
// ============================================================================

export class TestUtils {
  static assertContains(output: string, expected: string, message?: string): void {
    if (!output.includes(expected)) {
      throw new Error(message || `Expected output to contain: "${expected}"\nGot: "${output}"`);
    }
    console.log(`✓ ${message || `Contains: "${expected}"`}`);
  }

  static assertNotContains(output: string, unexpected: string, message?: string): void {
    if (output.includes(unexpected)) {
      throw new Error(message || `Expected output NOT to contain: "${unexpected}"\nGot: "${output}"`);
    }
    console.log(`✓ ${message || `Does not contain: "${unexpected}"`}`);
  }

  static assertMatches(output: string, pattern: RegExp, message?: string): void {
    if (!pattern.test(output)) {
      throw new Error(message || `Expected output to match: ${pattern}\nGot: "${output}"`);
    }
    console.log(`✓ ${message || `Matches: ${pattern}`}`);
  }

  static async testDoor(doorName: string, expectedOutput: string[]): Promise<void> {
    const servers = new ServerManager();
    const session = new BBSSession();

    try {
      await servers.start();
      await session.connect();
      await session.login('sysop', 'sysop');

      // Send door command
      const output = await session.sendCommand(doorName, 5000);

      // Check expected output
      for (const expected of expectedOutput) {
        this.assertContains(output, expected, `Door output contains: ${expected}`);
      }

      // Press ENTER to return to menu
      await session.pressEnter(2000);

      console.log(`✅ Door test passed: ${doorName}`);
    } catch (error) {
      console.error(`❌ Door test failed: ${doorName}`);
      throw error;
    } finally {
      await session.disconnect();
      await servers.stop();
    }
  }

  static async testCommand(command: string, expectedOutput: string[]): Promise<void> {
    const servers = new ServerManager();
    const session = new BBSSession();

    try {
      await servers.start();
      await session.connect();
      await session.login('sysop', 'sysop');

      // Send command
      const output = await session.sendCommand(command, 2000);

      // Check expected output
      for (const expected of expectedOutput) {
        this.assertContains(output, expected, `Command output contains: ${expected}`);
      }

      console.log(`✅ Command test passed: ${command}`);
    } catch (error) {
      console.error(`❌ Command test failed: ${command}`);
      throw error;
    } finally {
      await session.disconnect();
      await servers.stop();
    }
  }
}

// ============================================================================
// CLI Interface
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
AmiExpress Test Framework

Usage:
  npx tsx Scripts/test-framework.ts door <doorName> [expectedOutput...]
  npx tsx Scripts/test-framework.ts command <command> [expectedOutput...]
  npx tsx Scripts/test-framework.ts login <username> <password>
  npx tsx Scripts/test-framework.ts interactive

Examples:
  npx tsx Scripts/test-framework.ts door WHO2 "DooR by SPY/MST"
  npx tsx Scripts/test-framework.ts command WHO "Who's Online"
  npx tsx Scripts/test-framework.ts login sysop sysop
  npx tsx Scripts/test-framework.ts interactive
`);
    process.exit(0);
  }

  const testType = args[0];

  switch (testType) {
    case 'door': {
      const doorName = args[1];
      const expectedOutput = args.slice(2);
      await TestUtils.testDoor(doorName, expectedOutput);
      break;
    }

    case 'command': {
      const command = args[1];
      const expectedOutput = args.slice(2);
      await TestUtils.testCommand(command, expectedOutput);
      break;
    }

    case 'login': {
      const username = args[1] || 'sysop';
      const password = args[2] || 'sysop';

      const servers = new ServerManager();
      const session = new BBSSession();

      try {
        await servers.start();
        await session.connect();
        await session.login(username, password);

        const output = await session.getOutput();
        console.log('=== BBS Output ===');
        console.log(output);
        console.log('==================');

        console.log('✅ Login test passed');
      } finally {
        await session.disconnect();
        await servers.stop();
      }
      break;
    }

    case 'interactive': {
      // Interactive session for manual testing
      const servers = new ServerManager();
      const session = new BBSSession();

      try {
        await servers.start();
        await session.connect();

        console.log('\n=== Interactive BBS Session ===');
        console.log('Use the browser window to interact with the BBS');
        console.log('Press Ctrl+C to exit\n');

        // Keep session alive
        await new Promise(() => {}); // Wait forever
      } finally {
        await session.disconnect();
        await servers.stop();
      }
      break;
    }

    default:
      console.error(`Unknown test type: ${testType}`);
      process.exit(1);
  }
}

// Run CLI if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}
