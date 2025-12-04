/**
 * RIPRenderer - RIPscrip v1.54 Graphics Renderer
 *
 * Renders RIPscrip commands to an HTML5 canvas.
 * Resolution: 640x350 (EGA mode)
 */

import React, { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import {
  RIPCommand,
  RIPCommandType,
  RIPState,
  MouseRegion,
  RIPButton,
  RIP_WIDTH,
  RIP_HEIGHT,
  EGA_PALETTE,
  createInitialState,
  LineStyle,
  FillPattern,
  ClickType,
} from './RIPTypes';
import { parseRIPCommands } from './RIPParser';

export interface RIPRendererProps {
  /** Called when user clicks a mouse region or button */
  onCommand?: (command: string) => void;
  /** Called when RIP mode should exit (2! received) */
  onExitRipMode?: () => void;
  /** Scale factor for display */
  scale?: number;
  /** Width override */
  width?: number;
  /** Height override */
  height?: number;
}

export interface RIPRendererRef {
  /** Process RIP content and render */
  render: (content: string) => void;
  /** Clear the canvas */
  clear: () => void;
  /** Reset state */
  reset: () => void;
  /** Get current state */
  getState: () => RIPState;
}

const RIPRenderer = forwardRef<RIPRendererRef, RIPRendererProps>(
  ({ onCommand, onExitRipMode: _onExitRipMode, scale = 1, width, height }, ref) => {
    // onExitRipMode can be used when [2! escape is detected
    void _onExitRipMode;
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [state, setState] = useState<RIPState>(createInitialState());
    const stateRef = useRef<RIPState>(state);

    // Keep stateRef in sync
    useEffect(() => {
      stateRef.current = state;
    }, [state]);

    // Get canvas context
    const getContext = useCallback((): CanvasRenderingContext2D | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      return canvas.getContext('2d');
    }, []);

    // Get color from palette
    const getColor = useCallback((colorIndex: number): string => {
      const s = stateRef.current;
      if (colorIndex >= 0 && colorIndex < s.palette.length) {
        return s.palette[colorIndex];
      }
      return EGA_PALETTE[colorIndex % 16];
    }, []);

    // Clear the canvas
    const clear = useCallback(() => {
      const ctx = getContext();
      if (!ctx) return;
      ctx.fillStyle = getColor(0); // Background color
      ctx.fillRect(0, 0, RIP_WIDTH, RIP_HEIGHT);
    }, [getContext, getColor]);

    // Reset state
    const reset = useCallback(() => {
      setState(createInitialState());
      clear();
    }, [clear]);

    // Draw a pixel
    const drawPixel = useCallback((x: number, y: number, color?: number) => {
      const ctx = getContext();
      if (!ctx) return;
      const s = stateRef.current;
      ctx.fillStyle = getColor(color ?? s.drawColor);
      ctx.fillRect(x, y, 1, 1);
    }, [getContext, getColor]);

    // Draw a line
    const drawLine = useCallback((x0: number, y0: number, x1: number, y1: number) => {
      const ctx = getContext();
      if (!ctx) return;
      const s = stateRef.current;

      ctx.strokeStyle = getColor(s.drawColor);
      ctx.lineWidth = s.lineThickness;

      // Set line style
      if (s.lineStyle === LineStyle.DOTTED) {
        ctx.setLineDash([1, 1]);
      } else if (s.lineStyle === LineStyle.DASHED) {
        ctx.setLineDash([4, 2]);
      } else if (s.lineStyle === LineStyle.CENTER) {
        ctx.setLineDash([4, 2, 1, 2]);
      } else {
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.moveTo(x0 + 0.5, y0 + 0.5);
      ctx.lineTo(x1 + 0.5, y1 + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
    }, [getContext, getColor]);

    // Draw a rectangle outline
    const drawRectangle = useCallback((x0: number, y0: number, x1: number, y1: number) => {
      const ctx = getContext();
      if (!ctx) return;
      const s = stateRef.current;

      ctx.strokeStyle = getColor(s.drawColor);
      ctx.lineWidth = s.lineThickness;
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
    }, [getContext, getColor]);

    // Draw a filled rectangle (bar)
    const drawBar = useCallback((x0: number, y0: number, x1: number, y1: number) => {
      const ctx = getContext();
      if (!ctx) return;
      const s = stateRef.current;

      ctx.fillStyle = getColor(s.fillColor);
      ctx.fillRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    }, [getContext, getColor]);

    // Draw a circle
    const drawCircle = useCallback((cx: number, cy: number, radius: number) => {
      const ctx = getContext();
      if (!ctx) return;
      const s = stateRef.current;

      ctx.strokeStyle = getColor(s.drawColor);
      ctx.lineWidth = s.lineThickness;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
    }, [getContext, getColor]);

    // Draw a filled oval
    const drawFilledOval = useCallback((cx: number, cy: number, rx: number, ry: number) => {
      const ctx = getContext();
      if (!ctx) return;
      const s = stateRef.current;

      ctx.fillStyle = getColor(s.fillColor);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();

      // Draw outline
      ctx.strokeStyle = getColor(s.drawColor);
      ctx.lineWidth = s.lineThickness;
      ctx.stroke();
    }, [getContext, getColor]);

    // Draw an arc
    const drawArc = useCallback((cx: number, cy: number, startAngle: number, endAngle: number, radius: number) => {
      const ctx = getContext();
      if (!ctx) return;
      const s = stateRef.current;

      // Convert degrees to radians (RIP uses degrees, 0 = 3 o'clock)
      const startRad = (startAngle * Math.PI) / 180;
      const endRad = (endAngle * Math.PI) / 180;

      ctx.strokeStyle = getColor(s.drawColor);
      ctx.lineWidth = s.lineThickness;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startRad, endRad);
      ctx.stroke();
    }, [getContext, getColor]);

    // Draw a pie slice
    const drawPieSlice = useCallback((cx: number, cy: number, startAngle: number, endAngle: number, radius: number) => {
      const ctx = getContext();
      if (!ctx) return;
      const s = stateRef.current;

      const startRad = (startAngle * Math.PI) / 180;
      const endRad = (endAngle * Math.PI) / 180;

      ctx.fillStyle = getColor(s.fillColor);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, startRad, endRad);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = getColor(s.drawColor);
      ctx.lineWidth = s.lineThickness;
      ctx.stroke();
    }, [getContext, getColor]);

    // Draw a polygon
    const drawPolygon = useCallback((points: number[], filled: boolean) => {
      const ctx = getContext();
      if (!ctx || points.length < 4) return;
      const s = stateRef.current;

      ctx.beginPath();
      ctx.moveTo(points[0], points[1]);
      for (let i = 2; i < points.length; i += 2) {
        ctx.lineTo(points[i], points[i + 1]);
      }
      ctx.closePath();

      if (filled) {
        ctx.fillStyle = getColor(s.fillColor);
        ctx.fill();
      }

      ctx.strokeStyle = getColor(s.drawColor);
      ctx.lineWidth = s.lineThickness;
      ctx.stroke();
    }, [getContext, getColor]);

    // Draw a polyline
    const drawPolyline = useCallback((points: number[]) => {
      const ctx = getContext();
      if (!ctx || points.length < 4) return;
      const s = stateRef.current;

      ctx.strokeStyle = getColor(s.drawColor);
      ctx.lineWidth = s.lineThickness;
      ctx.beginPath();
      ctx.moveTo(points[0], points[1]);
      for (let i = 2; i < points.length; i += 2) {
        ctx.lineTo(points[i], points[i + 1]);
      }
      ctx.stroke();
    }, [getContext, getColor]);

    // Draw text
    const drawText = useCallback((text: string, x?: number, y?: number) => {
      const ctx = getContext();
      if (!ctx) return;
      const s = stateRef.current;

      const posX = x ?? s.cursorX;
      const posY = y ?? s.cursorY;

      // Use 8x8 pixel font approximation
      const fontSize = 8 * s.fontSize;
      ctx.font = `${fontSize}px monospace`;
      ctx.fillStyle = getColor(s.drawColor);
      ctx.textBaseline = 'top';

      if (s.fontDirection === 1) {
        // Vertical text
        ctx.save();
        ctx.translate(posX, posY);
        ctx.rotate(Math.PI / 2);
        ctx.fillText(text, 0, 0);
        ctx.restore();
      } else {
        ctx.fillText(text, posX, posY);
      }

      // Update cursor position
      const newX = posX + text.length * fontSize * 0.6;
      setState(prev => ({ ...prev, cursorX: newX, cursorY: posY }));
    }, [getContext, getColor]);

    // Flood fill
    const floodFill = useCallback((x: number, y: number, borderColor: number) => {
      const ctx = getContext();
      if (!ctx) return;
      const s = stateRef.current;

      // Get image data
      const imageData = ctx.getImageData(0, 0, RIP_WIDTH, RIP_HEIGHT);
      const data = imageData.data;

      // Get target color at click position
      const targetColor = getPixelColor(data, x, y);
      const fillColorRgb = hexToRgb(getColor(s.fillColor));
      const borderColorRgb = hexToRgb(getColor(borderColor));

      // Don't fill if clicking on border or already filled
      if (colorsMatch(targetColor, borderColorRgb) || colorsMatch(targetColor, fillColorRgb)) {
        return;
      }

      // Flood fill using stack
      const stack: [number, number][] = [[x, y]];
      const visited = new Set<string>();

      while (stack.length > 0) {
        const [px, py] = stack.pop()!;
        const key = `${px},${py}`;

        if (visited.has(key)) continue;
        if (px < 0 || px >= RIP_WIDTH || py < 0 || py >= RIP_HEIGHT) continue;

        const currentColor = getPixelColor(data, px, py);
        if (colorsMatch(currentColor, borderColorRgb)) continue;
        if (!colorsMatch(currentColor, targetColor)) continue;

        visited.add(key);
        setPixelColor(data, px, py, fillColorRgb);

        stack.push([px + 1, py]);
        stack.push([px - 1, py]);
        stack.push([px, py + 1]);
        stack.push([px, py - 1]);
      }

      ctx.putImageData(imageData, 0, 0);
    }, [getContext, getColor]);

    // Helper functions for flood fill
    function getPixelColor(data: Uint8ClampedArray, x: number, y: number): [number, number, number] {
      const idx = (y * RIP_WIDTH + x) * 4;
      return [data[idx], data[idx + 1], data[idx + 2]];
    }

    function setPixelColor(data: Uint8ClampedArray, x: number, y: number, rgb: [number, number, number]) {
      const idx = (y * RIP_WIDTH + x) * 4;
      data[idx] = rgb[0];
      data[idx + 1] = rgb[1];
      data[idx + 2] = rgb[2];
      data[idx + 3] = 255;
    }

    function hexToRgb(hex: string): [number, number, number] {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
      ] : [0, 0, 0];
    }

    function colorsMatch(c1: [number, number, number], c2: [number, number, number]): boolean {
      return Math.abs(c1[0] - c2[0]) < 5 &&
             Math.abs(c1[1] - c2[1]) < 5 &&
             Math.abs(c1[2] - c2[2]) < 5;
    }

    // Execute a single RIP command
    const executeCommand = useCallback((cmd: RIPCommand) => {
      const { type, params, text } = cmd;

      switch (type) {
        case RIPCommandType.RESET_WINDOWS:
          reset();
          break;

        case RIPCommandType.ERASE_WINDOW:
        case RIPCommandType.ERASE_VIEW:
          clear();
          break;

        case RIPCommandType.COLOR:
          setState(prev => ({ ...prev, drawColor: params[0] % 16 }));
          break;

        case RIPCommandType.FILL_STYLE:
          setState(prev => ({
            ...prev,
            fillPattern: params[0] as FillPattern,
            fillColor: params[1] % 16,
          }));
          break;

        case RIPCommandType.LINE_STYLE:
          setState(prev => ({
            ...prev,
            lineStyle: params[0] as LineStyle,
            linePattern: params[1],
            lineThickness: params[2] || 1,
          }));
          break;

        case RIPCommandType.MOVE:
          setState(prev => ({ ...prev, cursorX: params[0], cursorY: params[1] }));
          break;

        case RIPCommandType.PIXEL:
          drawPixel(params[0], params[1]);
          break;

        case RIPCommandType.LINE:
          drawLine(params[0], params[1], params[2], params[3]);
          break;

        case RIPCommandType.RECTANGLE:
          drawRectangle(params[0], params[1], params[2], params[3]);
          break;

        case RIPCommandType.BAR:
          drawBar(params[0], params[1], params[2], params[3]);
          break;

        case RIPCommandType.CIRCLE:
          drawCircle(params[0], params[1], params[2]);
          break;

        case RIPCommandType.FILLED_OVAL:
          drawFilledOval(params[0], params[1], params[2], params[3]);
          break;

        case RIPCommandType.ARC:
          drawArc(params[0], params[1], params[2], params[3], params[4]);
          break;

        case RIPCommandType.PIE_SLICE:
          drawPieSlice(params[0], params[1], params[2], params[3], params[4]);
          break;

        case RIPCommandType.POLYGON:
          drawPolygon(params.slice(1), false);
          break;

        case RIPCommandType.FILL_POLYGON:
          drawPolygon(params.slice(1), true);
          break;

        case RIPCommandType.POLYLINE:
          drawPolyline(params.slice(1));
          break;

        case RIPCommandType.FILL:
          floodFill(params[0], params[1], params[2]);
          break;

        case RIPCommandType.TEXT:
          if (text) drawText(text);
          break;

        case RIPCommandType.TEXT_XY:
          if (text) drawText(text, params[0], params[1]);
          break;

        case RIPCommandType.FONT_STYLE:
          setState(prev => ({
            ...prev,
            fontType: params[0],
            fontDirection: params[1],
            fontSize: params[2] || 1,
          }));
          break;

        case RIPCommandType.TEXT_WINDOW:
          setState(prev => ({
            ...prev,
            textWindow: {
              x0: params[0],
              y0: params[1],
              x1: params[2],
              y1: params[3],
              wrap: params[4],
              size: params[5],
            },
          }));
          break;

        case RIPCommandType.VIEWPORT:
          setState(prev => ({
            ...prev,
            viewport: {
              x0: params[0],
              y0: params[1],
              x1: params[2],
              y1: params[3],
            },
          }));
          break;

        case RIPCommandType.ONE_PALETTE:
          setState(prev => {
            const newPalette = [...prev.palette];
            const colorIdx = params[0];
            const r = Math.round(params[1] * 4.0625); // Scale 0-63 to 0-255
            const g = Math.round(params[2] * 4.0625);
            const b = Math.round(params[3] * 4.0625);
            newPalette[colorIdx] = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            return { ...prev, palette: newPalette };
          });
          break;

        case RIPCommandType.MOUSE:
          {
            const region: MouseRegion = {
              id: params[0],
              x0: params[1],
              y0: params[2],
              x1: params[3],
              y1: params[4],
              clickType: params[5] as ClickType,
              invert: params[6] !== 0,
              reset: params[7] !== 0,
              command: text || '',
            };
            setState(prev => ({
              ...prev,
              mouseRegions: [...prev.mouseRegions, region],
            }));
          }
          break;

        case RIPCommandType.KILL_MOUSE:
          setState(prev => ({ ...prev, mouseRegions: [], buttons: [] }));
          break;

        case RIPCommandType.BUTTON:
          {
            // Parse button text: <icon>^<label>^<command>
            const parts = (text || '').split('^');
            const button: RIPButton = {
              x0: params[0],
              y0: params[1],
              x1: params[2],
              y1: params[3],
              hotkey: String.fromCharCode(params[4]),
              flags: params[5],
              iconFile: parts[0] || undefined,
              label: parts[1] || undefined,
              command: parts[2] || parts[0] || '',
            };

            // Draw button rectangle
            const ctx = getContext();
            if (ctx) {
              ctx.fillStyle = getColor(7); // Light gray
              ctx.fillRect(params[0], params[1], params[2] - params[0], params[3] - params[1]);
              ctx.strokeStyle = getColor(15); // White highlight
              ctx.strokeRect(params[0], params[1], params[2] - params[0], params[3] - params[1]);

              // Draw label
              if (button.label) {
                ctx.fillStyle = getColor(0); // Black text
                ctx.font = '8px monospace';
                ctx.textBaseline = 'middle';
                const textX = params[0] + (params[2] - params[0]) / 2;
                const textY = params[1] + (params[3] - params[1]) / 2;
                ctx.textAlign = 'center';
                ctx.fillText(button.label, textX, textY);
              }
            }

            setState(prev => ({
              ...prev,
              buttons: [...prev.buttons, button],
            }));
          }
          break;

        case RIPCommandType.HOME:
          setState(prev => ({ ...prev, cursorX: 0, cursorY: 0 }));
          break;

        default:
          console.log(`[RIP] Unimplemented command: ${type}`, params, text);
      }
    }, [reset, clear, drawPixel, drawLine, drawRectangle, drawBar, drawCircle, drawFilledOval, drawArc, drawPieSlice, drawPolygon, drawPolyline, floodFill, drawText, getContext, getColor]);

    // Render RIP content
    const render = useCallback((content: string) => {
      const { commands } = parseRIPCommands(content);

      for (const cmd of commands) {
        executeCommand(cmd);
      }
    }, [executeCommand]);

    // Handle mouse clicks
    const handleClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = RIP_WIDTH / rect.width;
      const scaleY = RIP_HEIGHT / rect.height;
      const x = Math.floor((event.clientX - rect.left) * scaleX);
      const y = Math.floor((event.clientY - rect.top) * scaleY);

      const s = stateRef.current;

      // Check buttons first
      for (const button of s.buttons) {
        if (x >= button.x0 && x <= button.x1 && y >= button.y0 && y <= button.y1) {
          onCommand?.(button.command);
          return;
        }
      }

      // Check mouse regions
      for (const region of s.mouseRegions) {
        if (x >= region.x0 && x <= region.x1 && y >= region.y0 && y <= region.y1) {
          onCommand?.(region.command);
          return;
        }
      }
    }, [onCommand]);

    // Handle keyboard for button hotkeys
    const handleKeyDown = useCallback((event: KeyboardEvent) => {
      const s = stateRef.current;
      const key = event.key.toUpperCase();

      for (const button of s.buttons) {
        if (button.hotkey.toUpperCase() === key) {
          onCommand?.(button.command);
          event.preventDefault();
          return;
        }
      }
    }, [onCommand]);

    // Add keyboard listener
    useEffect(() => {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    // Initialize canvas
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Set up canvas
      ctx.imageSmoothingEnabled = false;
      clear();
    }, [clear]);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      render,
      clear,
      reset,
      getState: () => stateRef.current,
    }), [render, clear, reset]);

    const displayWidth = width ?? RIP_WIDTH * scale;
    const displayHeight = height ?? RIP_HEIGHT * scale;

    return (
      <canvas
        ref={canvasRef}
        width={RIP_WIDTH}
        height={RIP_HEIGHT}
        onClick={handleClick}
        style={{
          width: displayWidth,
          height: displayHeight,
          imageRendering: 'pixelated',
          backgroundColor: '#000',
          cursor: 'pointer',
        }}
      />
    );
  }
);

RIPRenderer.displayName = 'RIPRenderer';

export default RIPRenderer;
