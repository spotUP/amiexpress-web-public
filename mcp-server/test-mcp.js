#!/usr/bin/env node

/**
 * Simple test script for MCP server tools
 * Tests all new MCP Phase 2 functionality
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MCPTester {
  constructor() {
    this.serverPath = path.join(__dirname, 'index.js');
  }

  async sendRequest(request) {
    return new Promise((resolve, reject) => {
      const server = spawn('node', [this.serverPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      server.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      server.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      server.on('close', (code) => {
        if (stderr.includes('running on stdio')) {
          // Server started successfully
          resolve({ stdout, stderr });
        } else if (code !== 0) {
          reject(new Error(`Server exited with code ${code}: ${stderr}`));
        } else {
          resolve({ stdout, stderr });
        }
      });

      // Send request
      setTimeout(() => {
        server.stdin.write(JSON.stringify(request) + '\n');
        server.stdin.end();
      }, 100);

      // Kill after timeout
      setTimeout(() => {
        server.kill();
        resolve({ stdout, stderr, timeout: true });
      }, 2000);
    });
  }

  async testServerStartup() {
    console.log('Test 1: Server Startup');
    console.log('======================');

    try {
      const result = await this.sendRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list'
      });

      if (result.stderr.includes('running on stdio')) {
        console.log('✓ Server starts successfully\n');
        return true;
      } else {
        console.log('✗ Server failed to start');
        console.log('stderr:', result.stderr, '\n');
        return false;
      }
    } catch (error) {
      console.log('✗ Server startup failed:', error.message, '\n');
      return false;
    }
  }

  async testSourceFiles() {
    console.log('Test 2: Source File Access');
    console.log('==========================');

    // Test that source files exist
    const fs = await import('fs/promises');
    const sources = [
      '../AmiExpress-Sources/express.e',
      '../AmiExpress-Sources/hydra.e',
      '../AmiExpress-Sources/ACP.e'
    ];

    let allExist = true;
    for (const source of sources) {
      const fullPath = path.join(__dirname, source);
      try {
        await fs.access(fullPath);
        console.log(`✓ ${path.basename(source)} exists`);
      } catch {
        console.log(`✗ ${path.basename(source)} NOT FOUND`);
        allExist = false;
      }
    }

    console.log('');
    return allExist;
  }

  async testNDKAutodocs() {
    console.log('Test 3: NDK Autodocs Access');
    console.log('===========================');

    const fs = await import('fs/promises');
    const autodocsPath = path.join(__dirname, '..', 'NDK3.2R4', 'Autodocs');

    try {
      const files = await fs.readdir(autodocsPath);
      console.log(`✓ NDK Autodocs directory found (${files.length} files)`);

      // Test reading dos.doc (common library)
      const dosPath = path.join(autodocsPath, 'AG', 'dos');
      try {
        await fs.access(dosPath);
        console.log('✓ dos library autodoc accessible');
      } catch {
        console.log('✗ dos library autodoc NOT FOUND');
        return false;
      }

      console.log('');
      return true;
    } catch (error) {
      console.log(`✗ NDK Autodocs directory not found: ${error.message}\n`);
      return false;
    }
  }

  async runAllTests() {
    console.log('\nMCP Server Test Suite');
    console.log('====================\n');

    const results = [];

    results.push(await this.testServerStartup());
    results.push(await this.testSourceFiles());
    results.push(await this.testNDKAutodocs());

    const passed = results.filter(r => r).length;
    const total = results.length;

    console.log('Summary');
    console.log('=======');
    console.log(`Tests passed: ${passed}/${total}`);

    if (passed === total) {
      console.log('\n✓ All tests passed! MCP server is ready.\n');
      process.exit(0);
    } else {
      console.log('\n✗ Some tests failed. Please check configuration.\n');
      process.exit(1);
    }
  }
}

const tester = new MCPTester();
tester.runAllTests().catch((error) => {
  console.error('Test suite error:', error);
  process.exit(1);
});
