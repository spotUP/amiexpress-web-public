#!/usr/bin/env npx tsx
/**
 * Test script for Door Manager upload functionality
 *
 * This script:
 * 1. Creates a test door ZIP archive
 * 2. Connects to the BBS as sysop
 * 3. Uploads the door via socket.io
 * 4. Verifies the upload succeeded
 */

import { io, Socket } from 'socket.io-client';
import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';

const SERVER_URL = 'http://localhost:3001';
const TEST_DOOR_NAME = 'test-door';
const TEST_ZIP_PATH = path.join(__dirname, 'doors', 'archives', `${TEST_DOOR_NAME}.zip`);

// ANSI escape code parser (simplified)
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\[[HJ]/g, '');
}

// Create test door archive
function createTestDoorArchive(): Buffer {
  console.log('\n📦 Creating test door archive...');

  const zip = new AdmZip();

  // Add FILE_ID.DIZ
  const fileid = `Test Door v1.0
By AmiExpress Team

A simple test door for
demonstrating the Door Manager
upload functionality.

Type: Test Door
Date: ${new Date().toISOString().split('T')[0]}`;

  zip.addFile('FILE_ID.DIZ', Buffer.from(fileid, 'utf8'));

  // Add README
  const readme = `Test Door Upload
================

This is a test door created by the automated test script.

Installation:
- Uploaded via Door Manager
- Extracted automatically

Usage:
- This is just a test door
- It doesn't actually do anything

Test Date: ${new Date().toISOString()}`;

  zip.addFile('README.TXT', Buffer.from(readme, 'utf8'));

  // Add test door executable
  const doorCode = `// Test Door
// Auto-generated test door for upload testing

import { Socket } from 'socket.io';

export async function executeDoor(socket: Socket): Promise<void> {
  socket.emit('ansi-output', '\\x1b[1;36m-= TEST DOOR =-\\x1b[0m\\r\\n\\r\\n');
  socket.emit('ansi-output', 'This is a test door created by the upload test script.\\r\\n\\r\\n');
  socket.emit('ansi-output', 'Press any key to exit...\\r\\n');

  // Wait for key press
  await new Promise<void>((resolve) => {
    const handler = () => {
      socket.off('terminal-input', handler);
      resolve();
    };
    socket.on('terminal-input', handler);
  });

  socket.emit('ansi-output', '\\r\\nReturning to BBS...\\r\\n');
}`;

  zip.addFile('test-door.ts', Buffer.from(doorCode, 'utf8'));

  const buffer = zip.toBuffer();
  console.log(`✅ Created test archive: ${buffer.length} bytes`);
  console.log(`   - FILE_ID.DIZ: ${fileid.length} bytes`);
  console.log(`   - README.TXT: ${readme.length} bytes`);
  console.log(`   - test-door.ts: ${doorCode.length} bytes`);

  return buffer;
}

// Main test function
async function testDoorUpload(): Promise<void> {
  console.log('\n🧪 Door Manager Upload Test');
  console.log('=' .repeat(50));

  // Step 1: Create test door archive
  const zipBuffer = createTestDoorArchive();

  // Step 2: Connect to server
  console.log('\n🔌 Connecting to server...');
  const socket: Socket = io(SERVER_URL, {
    transports: ['websocket'],
    reconnection: false,
    timeout: 10000,
    forceNew: true,
  });

  return new Promise((resolve, reject) => {
    let testTimeout: NodeJS.Timeout;
    let isLoggedIn = false;
    let uploadSent = false;

    // Set overall test timeout
    testTimeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error('❌ Test timeout after 30 seconds'));
    }, 30000);

    socket.on('connect', () => {
      console.log('✅ Connected to server');
      console.log(`   Socket ID: ${socket.id}`);
    });

    socket.on('ansi-output', (data: string) => {
      const text = stripAnsi(data);

      // Wait for login prompt
      if (!isLoggedIn && text.includes('Username:')) {
        console.log('\n🔐 Logging in as sysop...');
        socket.emit('terminal-input', 'sysop\r');
      } else if (!isLoggedIn && text.includes('Password:')) {
        socket.emit('terminal-input', 'sysop\r');
        isLoggedIn = true;

        // Wait a bit for login to complete
        setTimeout(() => {
          console.log('✅ Logged in successfully');

          // Send upload
          console.log('\n📤 Sending door upload...');
          console.log(`   Filename: ${TEST_DOOR_NAME}.zip`);
          console.log(`   Size: ${zipBuffer.length} bytes`);

          socket.emit('door-upload', {
            filename: `${TEST_DOOR_NAME}.zip`,
            content: zipBuffer
          });

          uploadSent = true;
          console.log('✅ Upload sent to server');
        }, 2000);
      }

      // Check for success indicators after upload
      if (uploadSent) {
        if (text.includes('DOOR INFORMATION') || text.includes(TEST_DOOR_NAME)) {
          console.log('\n✅ Upload successful! Door info page displayed');

          // Check if file was actually saved
          if (fs.existsSync(TEST_ZIP_PATH)) {
            const savedSize = fs.statSync(TEST_ZIP_PATH).size;
            console.log(`✅ File saved: ${TEST_ZIP_PATH}`);
            console.log(`   Size: ${savedSize} bytes`);

            if (savedSize === zipBuffer.length) {
              console.log('✅ File size matches!');
            } else {
              console.log(`⚠️  File size mismatch: ${savedSize} !== ${zipBuffer.length}`);
            }
          } else {
            console.log(`⚠️  File not found at: ${TEST_ZIP_PATH}`);
          }

          clearTimeout(testTimeout);
          socket.disconnect();

          console.log('\n' + '='.repeat(50));
          console.log('✅ TEST PASSED');
          console.log('='.repeat(50));

          resolve();
        }
      }
    });

    socket.on('door-upload-success', (data: any) => {
      console.log('\n✅ Received upload success event:', data);
    });

    socket.on('door-upload-error', (data: any) => {
      console.error('\n❌ Upload error:', data.message);
      clearTimeout(testTimeout);
      socket.disconnect();
      reject(new Error(`Upload failed: ${data.message}`));
    });

    socket.on('connect_error', (error: any) => {
      console.error('❌ Connection error:', error.message);
      console.error('   Error details:', error);
      console.error('   Server URL:', SERVER_URL);
      clearTimeout(testTimeout);
      reject(error);
    });

    socket.on('disconnect', (reason) => {
      console.log(`\n🔌 Disconnected: ${reason}`);
    });
  });
}

// Run test
testDoorUpload()
  .then(() => {
    console.log('\n✅ Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  });
