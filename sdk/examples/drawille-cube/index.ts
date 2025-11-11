/**
 * Drawille Cube Demo - Rotating 3D cube using braille graphics
 *
 * This door demonstrates the node-drawille module for creating smooth
 * braille-based graphics in the terminal. A rotating 3D cube is rendered
 * using Unicode braille characters within a neo-blessed UI.
 *
 * Features:
 * - Real-time 3D cube rotation
 * - Braille character graphics (2x4 pixels per character)
 * - Neo-blessed UI integration
 * - Smooth animation
 * - Interactive controls
 */

const { Door, UIEngine } = require('@amiexpress/bbs-door-sdk');
// @ts-ignore - drawille doesn't have type definitions
const drawille = require('drawille');

const door = new Door({
  name: 'Drawille Cube Demo',
  version: '1.0.0',
  author: 'AmiExpress SDK',
  description: 'Rotating 3D cube using node-drawille braille graphics',
});

// 3D Point
interface Point3D {
  x: number;
  y: number;
  z: number;
}

// 2D Point (projected)
interface Point2D {
  x: number;
  y: number;
}

// Cube vertices (unit cube centered at origin)
const CUBE_VERTICES: Point3D[] = [
  { x: -1, y: -1, z: -1 }, // 0: front bottom left
  { x: 1, y: -1, z: -1 },  // 1: front bottom right
  { x: 1, y: 1, z: -1 },   // 2: front top right
  { x: -1, y: 1, z: -1 },  // 3: front top left
  { x: -1, y: -1, z: 1 },  // 4: back bottom left
  { x: 1, y: -1, z: 1 },   // 5: back bottom right
  { x: 1, y: 1, z: 1 },    // 6: back top right
  { x: -1, y: 1, z: 1 },   // 7: back top left
];

// Cube edges (pairs of vertex indices)
const CUBE_EDGES: [number, number][] = [
  // Front face
  [0, 1], [1, 2], [2, 3], [3, 0],
  // Back face
  [4, 5], [5, 6], [6, 7], [7, 4],
  // Connecting edges
  [0, 4], [1, 5], [2, 6], [3, 7],
];

/**
 * Rotate a point around X axis
 */
function rotateX(p: Point3D, angle: number): Point3D {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: p.x,
    y: p.y * cos - p.z * sin,
    z: p.y * sin + p.z * cos,
  };
}

/**
 * Rotate a point around Y axis
 */
function rotateY(p: Point3D, angle: number): Point3D {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: p.x * cos + p.z * sin,
    y: p.y,
    z: -p.x * sin + p.z * cos,
  };
}

/**
 * Rotate a point around Z axis
 */
function rotateZ(p: Point3D, angle: number): Point3D {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: p.x * cos - p.y * sin,
    y: p.x * sin + p.y * cos,
    z: p.z,
  };
}

/**
 * Project 3D point to 2D screen coordinates
 */
function project(p: Point3D, distance: number, centerX: number, centerY: number, scale: number): Point2D {
  const factor = distance / (distance + p.z);
  return {
    x: Math.floor(centerX + p.x * scale * factor),
    y: Math.floor(centerY - p.y * scale * factor),
  };
}

/**
 * Draw a line between two points using Bresenham's algorithm
 */
function drawLine(canvas: any, x0: number, y0: number, x1: number, y1: number): void {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    canvas.set(x0, y0);

    if (x0 === x1 && y0 === y1) break;

    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
}

door.onConnect(async (user: any) => {
  console.log(`User ${user.name} connected to Drawille Cube Demo`);

  // Create UI engine
  const ui = new UIEngine({
    width: 80,
    height: 24,
    smartCSR: true,
    enableMouse: false,
    enableKeys: true,
  });

  // Title bar
  const titleBar = ui.createBox({
    top: 0,
    left: 0,
    width: '100%',
    height: 3,
    content: '{center}{bold}Drawille Cube Demo{/bold}\n{center}Rotating 3D Cube using Braille Graphics{/center}',
    tags: true,
    style: {
      fg: 'white',
      bg: 'blue',
    },
  });

  // Main canvas box
  const canvasBox = ui.createBox({
    top: 3,
    left: 2,
    width: 60,
    height: 18,
    border: { type: 'line' },
    label: ' Animation ',
    style: {
      border: { fg: 'cyan' },
    },
  });

  // Info panel
  const infoBox = ui.createBox({
    top: 3,
    left: 64,
    width: 14,
    height: 10,
    border: { type: 'line' },
    label: ' Info ',
    content: '',
    tags: true,
    style: {
      border: { fg: 'yellow' },
    },
  });

  // Controls panel
  const controlsBox = ui.createBox({
    top: 14,
    left: 64,
    width: 14,
    height: 7,
    border: { type: 'line' },
    label: ' Controls ',
    content: '{cyan-fg}[+] Speed up\n[-] Slow down\n[R] Reset\n[Space] Pause\n[Q] Quit{/cyan-fg}',
    tags: true,
    style: {
      border: { fg: 'yellow' },
    },
  });

  // Status bar
  const statusBar = ui.createBox({
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: ' Press Q or ESC to quit',
    style: {
      fg: 'white',
      bg: 'blue',
    },
  });

  ui.render();

  // Animation state
  let angleX = 0;
  let angleY = 0;
  let angleZ = 0;
  let speed = 0.03;
  let paused = false;
  let frameCount = 0;

  // Animation loop
  const animate = () => {
    if (!paused) {
      // Update rotation angles
      angleX += speed;
      angleY += speed * 0.7;
      angleZ += speed * 0.5;

      // Create drawille canvas
      const canvas = new drawille.Canvas();

      // Canvas dimensions (in braille pixels, which are 2x4 per character)
      const width = 56 * 2;  // Account for braille pixel density
      const height = 16 * 4;
      const centerX = width / 2;
      const centerY = height / 2;
      const scale = 20;
      const distance = 4;

      // Rotate and project vertices
      const projectedVertices: Point2D[] = CUBE_VERTICES.map(v => {
        let rotated = v;
        rotated = rotateX(rotated, angleX);
        rotated = rotateY(rotated, angleY);
        rotated = rotateZ(rotated, angleZ);
        return project(rotated, distance, centerX, centerY, scale);
      });

      // Draw edges
      for (const [start, end] of CUBE_EDGES) {
        const p1 = projectedVertices[start];
        const p2 = projectedVertices[end];
        drawLine(canvas, p1.x, p1.y, p2.x, p2.y);
      }

      // Render canvas to string
      const frame = canvas.frame();

      // Update canvas box
      canvasBox.setContent(frame);

      // Update info
      frameCount++;
      infoBox.setContent(
        `{yellow-fg}Frame: {/yellow-fg}{white-fg}${frameCount}{/white-fg}\n` +
        `{yellow-fg}Speed: {/yellow-fg}{white-fg}${speed.toFixed(3)}{/white-fg}\n` +
        `{yellow-fg}Angle X: {/yellow-fg}{white-fg}${(angleX % (2 * Math.PI)).toFixed(2)}{/white-fg}\n` +
        `{yellow-fg}Angle Y: {/yellow-fg}{white-fg}${(angleY % (2 * Math.PI)).toFixed(2)}{/white-fg}\n` +
        `{yellow-fg}Angle Z: {/yellow-fg}{white-fg}${(angleZ % (2 * Math.PI)).toFixed(2)}{/white-fg}\n` +
        `{yellow-fg}Status: {/yellow-fg}{${paused ? 'red-fg}Paused' : 'green-fg}Running'}{/}`
      );

      ui.render();
    }
  };

  // Start animation loop
  const interval = setInterval(animate, 50); // ~20 FPS

  // Keyboard controls
  ui.onKey(['+', '='], () => {
    speed = Math.min(speed + 0.01, 0.2);
  });

  ui.onKey(['-', '_'], () => {
    speed = Math.max(speed - 0.01, 0.01);
  });

  ui.onKey(['r', 'R'], () => {
    angleX = 0;
    angleY = 0;
    angleZ = 0;
    frameCount = 0;
  });

  ui.onKey(['space'], () => {
    paused = !paused;
  });

  ui.onKey(['q', 'Q', 'escape'], () => {
    clearInterval(interval);
    ui.destroy();
    door.disconnect(user.id);
  });
});

door.onDisconnect((user: any) => {
  console.log(`User ${user.name} disconnected from Drawille Cube Demo`);
});

door.start();
console.log('Drawille Cube Demo door started!');
