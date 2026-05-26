/**
 * Screen Wipe Animation Utility
 *
 * Provides 10 different screen wipe animations for BBS screen transitions.
 * Each animation returns an array of frames with timing information.
 *
 * MCI Commands:
 * ~WM - Matrix Rain (scramble characters, cascade down)
 * ~WH - Horizontal Blinds (reveal in horizontal strips)
 * ~WV - Vertical Blinds (reveal in vertical strips)
 * ~WS - Spiral Wipe (spiral from outside to center)
 * ~WC - Checkerboard (alternating squares)
 * ~WR - Radial/Radar Wipe (sweeps like radar)
 * ~WB - Block Wipe (random blocks appear)
 * ~WN - Noise Fade (static resolves to content)
 * ~WT - Typewriter (types out line by line)
 * ~WE - Explode (from center outward)
 * ~WX - Random (picks one of the above)
 */

export type WipeType =
  | 'matrix'     // ~WM
  | 'hblinds'    // ~WH
  | 'vblinds'    // ~WV
  | 'spiral'     // ~WS
  | 'checker'    // ~WC
  | 'radial'     // ~WR
  | 'blocks'     // ~WB
  | 'noise'      // ~WN
  | 'typewriter' // ~WT
  | 'explode'    // ~WE
  | 'random';    // ~WX

export interface WipeFrame {
  content: string;
  delay: number; // milliseconds
}

const MATRIX_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
const NOISE_CHARS = '░▒▓█▄▌▐▀■□▪▫';

/**
 * Parse ANSI content into a 2D grid of characters with their colors
 */
function parseAnsiToGrid(content: string): Array<Array<{ char: string; ansi: string }>> {
  const lines = content.split(/\r\n|\n/);
  const grid: Array<Array<{ char: string; ansi: string }>> = [];
  let currentAnsi = '\x1b[0m'; // Default: reset

  for (const line of lines) {
    const row: Array<{ char: string; ansi: string }> = [];
    let i = 0;

    while (i < line.length) {
      // Check for ANSI escape sequence
      if (line[i] === '\x1b' && line[i + 1] === '[') {
        let j = i + 2;
        while (j < line.length && !/[A-Za-z]/.test(line[j])) {
          j++;
        }
        if (j < line.length) {
          const finalChar = line[j];
          // Only track color/attribute sequences (ending in 'm').
          // Cursor-movement (H, A, B, C, D, f, J, K) and other control
          // sequences are positional — meaningless in the grid model and
          // harmful if re-emitted by gridToAnsi (e.g. \x1b[H from ~f
          // would move the cursor to home mid-render, offsetting the row).
          if (finalChar === 'm') {
            currentAnsi = line.substring(i, j + 1);
          }
          i = j + 1;
          continue;
        }
      }

      // Regular character
      row.push({ char: line[i], ansi: currentAnsi });
      i++;
    }

    grid.push(row);
  }

  return grid;
}

/**
 * Render grid back to ANSI string
 */
function gridToAnsi(grid: Array<Array<{ char: string; ansi: string }>>): string {
  const lines: string[] = [];

  for (const row of grid) {
    let line = '';
    let lastAnsi = '';

    for (const cell of row) {
      if (cell.ansi !== lastAnsi) {
        line += cell.ansi;
        lastAnsi = cell.ansi;
      }
      line += cell.char;
    }

    lines.push(line + '\x1b[0m');
  }

  return lines.join('\r\n');
}

/**
 * ~WM - Matrix Rain Wipe
 * Characters scramble and cascade down like Matrix code
 */
function matrixRainWipe(content: string): WipeFrame[] {
  const grid = parseAnsiToGrid(content);
  const frames: WipeFrame[] = [];
  const height = grid.length;
  const maxWidth = Math.max(...grid.map(row => row.length));

  // Green Matrix style colors
  const matrixColors = ['\x1b[32m', '\x1b[92m', '\x1b[32m']; // Green shades

  // Create scrambled version
  const scrambled = grid.map(row =>
    row.map(cell => ({
      char: MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)],
      ansi: matrixColors[Math.floor(Math.random() * matrixColors.length)]
    }))
  );

  // Animate cascade down (10 waves)
  for (let wave = 0; wave <= 10; wave++) {
    const frame = scrambled.map((row, y) =>
      row.map((cell, x) => {
        const progress = wave / 10;
        const rowProgress = y / height;

        if (progress >= rowProgress) {
          // Reveal actual content
          return grid[y][x] || { char: ' ', ansi: '\x1b[0m' };
        } else {
          // Still scrambled
          return {
            char: MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)],
            ansi: matrixColors[Math.floor(Math.random() * matrixColors.length)]
          };
        }
      })
    );

    frames.push({
      content: '\x1b[2J\x1b[H' + gridToAnsi(frame),
      delay: 50
    });
  }

  return frames;
}

/**
 * ~WH - Horizontal Blinds Wipe
 * Reveals screen in horizontal strips
 */
function horizontalBlindsWipe(content: string): WipeFrame[] {
  const grid = parseAnsiToGrid(content);
  const frames: WipeFrame[] = [];
  const height = grid.length;
  const stripHeight = 3; // Reveal 3 lines at a time

  // Create blank grid
  const blank = grid.map(row =>
    row.map(() => ({ char: ' ', ansi: '\x1b[0m' }))
  );

  // Reveal strips alternately
  for (let phase = 0; phase <= stripHeight * 2; phase++) {
    const frame = blank.map((row, y) => {
      const stripIndex = Math.floor(y / stripHeight);
      const shouldReveal = (stripIndex % 2 === 0) ?
        (phase >= stripIndex) :
        (phase >= (height / stripHeight) + stripIndex);

      return shouldReveal ? (grid[y] || row) : row;
    });

    frames.push({
      content: '\x1b[2J\x1b[H' + gridToAnsi(frame),
      delay: 40
    });
  }

  return frames;
}

/**
 * ~WV - Vertical Blinds Wipe
 * Reveals screen in vertical strips
 */
function verticalBlindsWipe(content: string): WipeFrame[] {
  const grid = parseAnsiToGrid(content);
  const frames: WipeFrame[] = [];
  const maxWidth = Math.max(...grid.map(row => row.length));
  const stripWidth = 5; // Reveal 5 columns at a time

  // Create blank grid
  const blank = grid.map(row =>
    row.map(() => ({ char: ' ', ansi: '\x1b[0m' }))
  );

  // Reveal strips alternately
  for (let phase = 0; phase <= stripWidth * 2; phase++) {
    const frame = grid.map((row, y) =>
      row.map((cell, x) => {
        const stripIndex = Math.floor(x / stripWidth);
        const shouldReveal = (stripIndex % 2 === 0) ?
          (phase >= stripIndex) :
          (phase >= (maxWidth / stripWidth) + stripIndex);

        return shouldReveal ? cell : { char: ' ', ansi: '\x1b[0m' };
      })
    );

    frames.push({
      content: '\x1b[2J\x1b[H' + gridToAnsi(frame),
      delay: 40
    });
  }

  return frames;
}

/**
 * ~WS - Spiral Wipe
 * Spirals from outside edges to center
 */
function spiralWipe(content: string): WipeFrame[] {
  const grid = parseAnsiToGrid(content);
  const frames: WipeFrame[] = [];
  const height = grid.length;
  const maxWidth = Math.max(...grid.map(row => row.length));

  // Build spiral coordinate list
  const spiral: Array<[number, number]> = [];
  let top = 0, bottom = height - 1, left = 0, right = maxWidth - 1;

  while (top <= bottom && left <= right) {
    // Top row
    for (let x = left; x <= right; x++) {
      for (let y = top; y <= bottom; y++) {
        if (grid[y] && grid[y][x]) {
          spiral.push([y, x]);
        }
      }
    }
    top++;

    // Right column
    for (let y = top; y <= bottom; y++) {
      for (let x = right; x >= left; x--) {
        if (grid[y] && grid[y][x] && !spiral.some(([sy, sx]) => sy === y && sx === x)) {
          spiral.push([y, x]);
        }
      }
    }
    right--;

    // Bottom row
    if (top <= bottom) {
      for (let x = right; x >= left; x--) {
        for (let y = bottom; y >= top; y--) {
          if (grid[y] && grid[y][x] && !spiral.some(([sy, sx]) => sy === y && sx === x)) {
            spiral.push([y, x]);
          }
        }
      }
      bottom--;
    }

    // Left column
    if (left <= right) {
      for (let y = bottom; y >= top; y--) {
        for (let x = left; x <= right; x++) {
          if (grid[y] && grid[y][x] && !spiral.some(([sy, sx]) => sy === y && sx === x)) {
            spiral.push([y, x]);
          }
        }
      }
      left++;
    }
  }

  // Animate spiral reveal (20 frames)
  const chunkSize = Math.ceil(spiral.length / 20);
  for (let i = 0; i <= 20; i++) {
    const revealed = new Set(spiral.slice(0, i * chunkSize).map(([y, x]) => `${y},${x}`));

    const frame = grid.map((row, y) =>
      row.map((cell, x) =>
        revealed.has(`${y},${x}`) ? cell : { char: ' ', ansi: '\x1b[0m' }
      )
    );

    frames.push({
      content: '\x1b[2J\x1b[H' + gridToAnsi(frame),
      delay: 30
    });
  }

  return frames;
}

/**
 * ~WC - Checkerboard Wipe
 * Reveals in alternating squares like a checkerboard
 */
function checkerboardWipe(content: string): WipeFrame[] {
  const grid = parseAnsiToGrid(content);
  const frames: WipeFrame[] = [];
  const squareSize = 4;

  // Phase 1: Reveal "white" squares (even rows + even cols, odd rows + odd cols)
  // Phase 2: Reveal "black" squares (even rows + odd cols, odd rows + even cols)
  for (let phase = 0; phase <= 1; phase++) {
    const frame = grid.map((row, y) =>
      row.map((cell, x) => {
        const rowSquare = Math.floor(y / squareSize);
        const colSquare = Math.floor(x / squareSize);
        const isWhiteSquare = (rowSquare % 2 === colSquare % 2);

        const shouldReveal = (phase === 0 && isWhiteSquare) || (phase === 1);
        return shouldReveal ? cell : { char: '░', ansi: '\x1b[90m' }; // Gray block
      })
    );

    frames.push({
      content: '\x1b[2J\x1b[H' + gridToAnsi(frame),
      delay: 100
    });
  }

  return frames;
}

/**
 * ~WR - Radial/Radar Wipe
 * Sweeps around like a radar from top center
 */
function radialWipe(content: string): WipeFrame[] {
  const grid = parseAnsiToGrid(content);
  const frames: WipeFrame[] = [];
  const height = grid.length;
  const maxWidth = Math.max(...grid.map(row => row.length));
  const centerX = maxWidth / 2;
  const centerY = 0; // Top center

  // Sweep 360 degrees in 24 frames
  for (let angle = 0; angle <= 360; angle += 15) {
    const radians = (angle * Math.PI) / 180;

    const frame = grid.map((row, y) =>
      row.map((cell, x) => {
        // Calculate angle from center to this point
        const dx = x - centerX;
        const dy = y - centerY;
        const pointAngle = Math.atan2(dy, dx) * (180 / Math.PI);
        const normalizedAngle = (pointAngle + 90 + 360) % 360; // 0 = top, clockwise

        const shouldReveal = normalizedAngle <= angle;
        return shouldReveal ? cell : { char: ' ', ansi: '\x1b[0m' };
      })
    );

    frames.push({
      content: '\x1b[2J\x1b[H' + gridToAnsi(frame),
      delay: 25
    });
  }

  return frames;
}

/**
 * ~WB - Block Wipe
 * Random blocks appear until screen is complete
 */
function blockWipe(content: string): WipeFrame[] {
  const grid = parseAnsiToGrid(content);
  const frames: WipeFrame[] = [];
  const height = grid.length;
  const maxWidth = Math.max(...grid.map(row => row.length));
  const blockSize = 3;

  // Create list of all block positions
  const blocks: Array<[number, number]> = [];
  for (let y = 0; y < height; y += blockSize) {
    for (let x = 0; x < maxWidth; x += blockSize) {
      blocks.push([y, x]);
    }
  }

  // Shuffle blocks
  for (let i = blocks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
  }

  // Reveal blocks in 15 frames
  const blocksPerFrame = Math.ceil(blocks.length / 15);
  for (let frame = 0; frame <= 15; frame++) {
    const revealedBlocks = new Set(
      blocks.slice(0, frame * blocksPerFrame).map(([y, x]) => `${Math.floor(y / blockSize)},${Math.floor(x / blockSize)}`)
    );

    const frameGrid = grid.map((row, y) =>
      row.map((cell, x) => {
        const blockKey = `${Math.floor(y / blockSize)},${Math.floor(x / blockSize)}`;
        return revealedBlocks.has(blockKey) ? cell : { char: ' ', ansi: '\x1b[0m' };
      })
    );

    frames.push({
      content: '\x1b[2J\x1b[H' + gridToAnsi(frameGrid),
      delay: 40
    });
  }

  return frames;
}

/**
 * ~WN - Noise Fade
 * Static/noise that resolves to actual content
 */
function noiseFadeWipe(content: string): WipeFrame[] {
  const grid = parseAnsiToGrid(content);
  const frames: WipeFrame[] = [];
  const height = grid.length;

  // 12 frames of noise fading to content
  for (let phase = 0; phase <= 12; phase++) {
    const noiseLevel = 1 - (phase / 12); // 100% noise -> 0% noise

    const frame = grid.map((row, y) =>
      row.map((cell, x) => {
        if (Math.random() < noiseLevel) {
          // Show noise
          return {
            char: NOISE_CHARS[Math.floor(Math.random() * NOISE_CHARS.length)],
            ansi: Math.random() < 0.5 ? '\x1b[37m' : '\x1b[90m' // White or gray
          };
        } else {
          // Show actual content
          return cell;
        }
      })
    );

    frames.push({
      content: '\x1b[2J\x1b[H' + gridToAnsi(frame),
      delay: 50
    });
  }

  return frames;
}

/**
 * ~WT - Typewriter Wipe
 * Types out line by line with slight delay
 */
function typewriterWipe(content: string): WipeFrame[] {
  const grid = parseAnsiToGrid(content);
  const frames: WipeFrame[] = [];
  const height = grid.length;

  // Reveal 2 lines per frame
  for (let line = 0; line <= height; line += 2) {
    const frame = grid.slice(0, line);

    frames.push({
      content: '\x1b[2J\x1b[H' + gridToAnsi(frame),
      delay: 30
    });
  }

  return frames;
}

/**
 * ~WE - Explode Wipe
 * Characters explode from center outward
 */
function explodeWipe(content: string): WipeFrame[] {
  const grid = parseAnsiToGrid(content);
  const frames: WipeFrame[] = [];
  const height = grid.length;
  const maxWidth = Math.max(...grid.map(row => row.length));
  const centerX = maxWidth / 2;
  const centerY = height / 2;
  const maxDistance = Math.sqrt(centerX * centerX + centerY * centerY);

  // Reveal from center outward in 15 frames
  for (let radius = 0; radius <= 15; radius++) {
    const currentRadius = (radius / 15) * maxDistance;

    const frame = grid.map((row, y) =>
      row.map((cell, x) => {
        const dx = x - centerX;
        const dy = y - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        const shouldReveal = distance <= currentRadius;
        return shouldReveal ? cell : { char: ' ', ansi: '\x1b[0m' };
      })
    );

    frames.push({
      content: '\x1b[2J\x1b[H' + gridToAnsi(frame),
      delay: 40
    });
  }

  return frames;
}

/**
 * Get wipe animation frames
 */
export function getWipeFrames(wipeType: WipeType, content: string): WipeFrame[] {
  // Handle random selection
  if (wipeType === 'random') {
    const types: WipeType[] = [
      'matrix', 'hblinds', 'vblinds', 'spiral', 'checker',
      'radial', 'blocks', 'noise', 'typewriter', 'explode'
    ];
    wipeType = types[Math.floor(Math.random() * types.length)];
  }

  switch (wipeType) {
    case 'matrix':
      return matrixRainWipe(content);
    case 'hblinds':
      return horizontalBlindsWipe(content);
    case 'vblinds':
      return verticalBlindsWipe(content);
    case 'spiral':
      return spiralWipe(content);
    case 'checker':
      return checkerboardWipe(content);
    case 'radial':
      return radialWipe(content);
    case 'blocks':
      return blockWipe(content);
    case 'noise':
      return noiseFadeWipe(content);
    case 'typewriter':
      return typewriterWipe(content);
    case 'explode':
      return explodeWipe(content);
    default:
      return [];
  }
}

/**
 * Parse wipe MCI code from content
 * Returns wipe type and content with MCI code removed
 */
export function parseWipeMCI(content: string): { wipeType: WipeType | null; content: string } {
  const wipeRegex = /~W([MHVSCRBNTEX])/i;
  const match = content.match(wipeRegex);

  if (!match) {
    return { wipeType: null, content };
  }

  const code = match[1].toUpperCase();
  const wipeMap: Record<string, WipeType> = {
    'M': 'matrix',
    'H': 'hblinds',
    'V': 'vblinds',
    'S': 'spiral',
    'C': 'checker',
    'R': 'radial',
    'B': 'blocks',
    'N': 'noise',
    'T': 'typewriter',
    'E': 'explode',
    'X': 'random'
  };

  const wipeType = wipeMap[code] || null;
  // Strip the wipe code plus its trailing newline (the code occupies its own line).
  // Without stripping the \n, contentForMci would start with a blank line, causing
  // the allowMCI check to see an empty first line and disable all MCI substitution.
  const cleanedContent = content.replace(/~W[MHVSCRBNTEX]\r?\n?/i, '');

  return { wipeType, content: cleanedContent };
}
