/**
 * Test MCI segment processing for LOGON screen
 */
import * as fs from 'fs';
import * as path from 'path';

const BBS_ROOT = '~/Code/AmiExpress/amiexpress-web';

function testSegmentSplit() {
console.log('=== MCI Segment Split Test ===\n');

  // Read LOGON20.TXT
  const logonPath = path.join(BBS_ROOT, 'Node1', 'LOGON20.TXT');
  const content = fs.readFileSync(logonPath, 'utf8');

console.log('Raw content:');
console.log('─'.repeat(60));
  content.split('\n').forEach((line, i) => {
console.log(`  ${i + 1}: ${line.replace(/~SP/g, '{{~SP}}')}`);
  });
console.log('─'.repeat(60));

  // Check for soft pauses
  const hasSoftPauses = /~SP(?:\s|\||\.|$)/.test(content);
console.log(`\nHas ~SP soft pauses: ${hasSoftPauses}`);

  // Split at ~SP boundaries
  const segments = content.split(/~SP(?:\s|\||\.)/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

console.log(`\nSegment count: ${segments.length}\n`);

  segments.forEach((seg, i) => {
console.log(`SEGMENT ${i}:`);
console.log('─'.repeat(40));
    seg.split('\n').forEach(line => {
      // Check for inline MCI codes
      const inlineMciRegex = /~([fF]|CC_[^\s|~\r\n]+|(?:SS_|2S)[^\s|~\r\n]+|\d*SR_[^\s|~\r\n]+)(?:\|{1,2})?/g;
      let match;
      let lineAnnotated = line;
      while ((match = inlineMciRegex.exec(line)) !== null) {
        const code = match[1];
        if (code.startsWith('CC_')) {
          lineAnnotated = lineAnnotated.replace(match[0], `{{COMMAND: ${code.substring(3)}}}`);
        }
      }
console.log(`  ${lineAnnotated}`);
    });
console.log();
  });

  // Check which segments contain ~CC_wall and ~CC_gwall
console.log('\n=== Wall Commands Location ===');
  segments.forEach((seg, i) => {
    if (seg.includes('~CC_wall')) {
console.log(`~CC_wall found in segment ${i}`);
    }
    if (seg.includes('~CC_gwall')) {
console.log(`~CC_gwall found in segment ${i}`);
    }
  });
}

testSegmentSplit();
