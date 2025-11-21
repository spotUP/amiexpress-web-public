// @ts-nocheck
/// <reference path="./types.d.ts" />
const drawille = require('drawille');
const DrawilleCanvas = typeof drawille === 'function' ? drawille : drawille.Canvas;
const { runDoorWithSession } = require('@amiexpress/bbs-door-sdk/tools/runDoorSession');

interface Point3D { x: number; y: number; z: number; }
interface Point2D { x: number; y: number; }

const CUBE_VERTICES: Point3D[] = [
  { x: -1, y: -1, z: -1 },
  { x: 1, y: -1, z: -1 },
  { x: 1, y: 1, z: -1 },
  { x: -1, y: 1, z: -1 },
  { x: -1, y: -1, z: 1 },
  { x: 1, y: -1, z: 1 },
  { x: 1, y: 1, z: 1 },
  { x: -1, y: 1, z: 1 },
];

const CUBE_EDGES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

function rotateX(p: Point3D, angle: number): Point3D {
  const cos = Math.cos(angle); const sin = Math.sin(angle);
  return { x: p.x, y: p.y * cos - p.z * sin, z: p.y * sin + p.z * cos };
}
function rotateY(p: Point3D, angle: number): Point3D {
  const cos = Math.cos(angle); const sin = Math.sin(angle);
  return { x: p.x * cos + p.z * sin, y: p.y, z: -p.x * sin + p.z * cos };
}
function rotateZ(p: Point3D, angle: number): Point3D {
  const cos = Math.cos(angle); const sin = Math.sin(angle);
  return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos, z: p.z };
}
function project(p: Point3D, distance: number, centerX: number, centerY: number, scale: number): Point2D {
  const factor = distance / (distance + p.z);
  return { x: Math.floor(centerX + p.x * scale * factor), y: Math.floor(centerY - p.y * scale * factor) };
}
function drawLine(canvas: any, width: number, height: number, x0: number, y0: number, x1: number, y1: number): void {
  const dx = Math.abs(x1 - x0); const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1; const sy = y0 < y1 ? 1 : -1; let err = dx - dy;
  while (true) {
    if (x0 >= 0 && x0 < width && y0 >= 0 && y0 < height) {
      canvas.set(x0, y0);
    }
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}

export async function runDoor(doorSession: any): Promise<void> {
  const { socket } = doorSession;

  let angleX = 0, angleY = 0, angleZ = 0;
  let speed = 0.03;
  let paused = false;
  let frameCount = 0;
  let interval: NodeJS.Timeout | null = null;
  let closed = false;

  const renderFrame = () => {
    if (paused || closed) return;
    angleX += speed; angleY += speed * 0.7; angleZ += speed * 0.5;

    const width = 40, height = 16;
    const canvas = new DrawilleCanvas(width, height);
    const centerX = width / 2, centerY = height / 2, scale = 7, distance = 4;

    const projected: Point2D[] = CUBE_VERTICES.map((v) => {
      let r = rotateX(v, angleX); r = rotateY(r, angleY); r = rotateZ(r, angleZ);
      return project(r, distance, centerX, centerY, scale);
    });
    for (const [s, e] of CUBE_EDGES) drawLine(canvas, width, height, projected[s].x, projected[s].y, projected[e].x, projected[e].y);

    frameCount += 1;
    const frameRaw = canvas.frame();
    const frame = frameRaw
      .split('\n')
      .slice(0, 24)
      .map((line: string) => line.slice(0, 80))
      .join('\n');
    const header = '\x1b[2J\x1b[H\x1b[36mDrawille Cube Demo\x1b[0m\n';
    const controls = 'Controls: [+]/[-] speed | Space pause | R reset | Q quit\n';
    const stats = `Frame: ${frameCount} | Speed: ${speed.toFixed(3)} | Angles: ${angleX.toFixed(2)}, ${angleY.toFixed(2)}, ${angleZ.toFixed(2)}\n`;
    socket.emit('ansi-output', header + controls + stats + frame);
  };

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (interval) clearInterval(interval);
    socket.off('user-input', inputHandler);
    socket.emit('ansi-output', '\x1b[0m\x1b[2J\x1b[H');
  };

  const inputHandler = (data: any) => {
    const key = (data?.key || '').toLowerCase();
    if (key === '+' || key === '=') speed = Math.min(speed + 0.01, 0.2);
    else if (key === '-' || key === '_') speed = Math.max(speed - 0.01, 0.01);
    else if (key === 'r') { angleX = 0; angleY = 0; angleZ = 0; frameCount = 0; }
    else if (key === ' ') paused = !paused;
    else if (key === 'q' || key === 'escape') { cleanup(); socket.emit('ansi-output', '\x1b[32mGoodbye!\x1b[0m'); socket.emit('door:close'); }
  };

  socket.on('user-input', inputHandler);
  interval = setInterval(renderFrame, 60);
  renderFrame();

  await new Promise<void>((resolve) => {
    const closeHandler = () => { cleanup(); resolve(); };
    socket.once('door:close', closeHandler);
    socket.once('disconnect', closeHandler);
  });
}
