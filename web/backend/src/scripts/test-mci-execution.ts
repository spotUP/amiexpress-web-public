/**
 * Test MCI execution with a mock session
 * This simulates what happens when a user logs in with security level 20+
 */
import * as fs from 'fs';
import * as path from 'path';
import { BBSState } from '../constants/bbs-states';
import { parseMciCodes } from '../handlers/screen.handler';
import { boardRoot } from '../utils/board-root.util';

const BBS_ROOT = boardRoot();

// Create a mock socket that logs emits
function createMockSocket() {
  const emitted: { event: string; data: any }[] = [];
  return {
    emit: (event: string, data: any) => {
      const preview = typeof data === 'string'
        ? data.substring(0, 50).replace(/[\x00-\x1f]/g, '.')
        : data;
console.log(`[SOCKET EMIT] ${event}:`, preview);
      emitted.push({ event, data });
    },
    on: () => {},
    id: 'test-socket-1',
    getEmitted: () => emitted,
  };
}

// Create a mock session
function createMockSession() {
  return {
    nodeId: 1,
    userId: 1,
    username: 'spot',
    currentConf: 1,
    state: BBSState.LOGGEDON,  // Key: must be LOGGEDON for commands to execute
    subState: 'DISPLAY_BULL',
    user: {
      username: 'spot',
      secLevel: 255,  // Sysop level
      callsToday: 1,
      calls: 100,
    },
    ansiMode: true,
    petsciiMode: false,
    ripMode: false,
    slowmo: 0,
    slowmoCount: 0,
    lastScreenHadPause: false,
    screenSegments: null,
    paginatedScreen: null,
    inDoorManager: false,
    doorInputHandler: null,
    inputBuffer: '',
  };
}

async function runTest() {
console.log('=== MCI Command Execution Test ===\n');

  const socket = createMockSocket();
  const session = createMockSession();

  // Read segment 2 content (contains ~CC_wall and ~CC_gwall)
  const segment2Content = `~CC_wall
~CC_gwall
~f
~5SR_WORK:bbs/Screens/flt/flt`;

console.log('Testing segment 2 content:');
console.log('─'.repeat(40));
console.log(segment2Content);
console.log('─'.repeat(40));
console.log();

console.log('Session state:', session.state);
console.log('User security level:', session.user.secLevel);
console.log();

  try {
console.log('[TEST] Calling parseMciCodes...\n');
    const result = await parseMciCodes(
      segment2Content,
      session as any,
      'AmiExpress-Web',
      'Sysop',
      'The Internet',
      socket as any
    );

console.log('\n[TEST] parseMciCodes returned:');
console.log('  inlineEmitted:', result.inlineEmitted);
console.log('  commands:', result.commands);
console.log('  parsed length:', result.parsed.length);
  } catch (err) {
console.error('[ERROR]', err);
  }

console.log('\n[TEST] Socket emissions:');
  socket.getEmitted().forEach((e, i) => console.log(`  ${i}: ${e.event}`));
}

runTest().catch(console.error);
