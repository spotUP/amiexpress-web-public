/**
 * ARexx Bridge Server
 *
 * Handles communication between ARexx scripts and the SDK backend.
 * Listens for commands from ARexx bridge and forwards them to the appropriate engines.
 */

import * as net from 'net';
import { GraphicsEngine } from '../engines/graphics/graphics-engine';
import { PhysicsEngine } from '../engines/physics/physics-engine';
import { AudioEngine } from '../engines/audio/audio-engine';
import { AnsiColor } from './types';

interface DoorSession {
  id: string;
  name: string;
  version: string;
  author: string;
  graphics: GraphicsEngine;
  physics: PhysicsEngine;
  audio: AudioEngine;
  socket: net.Socket;
}

export class ARexxServer {
  private server: net.Server;
  private port: number;
  private sessions: Map<string, DoorSession> = new Map();

  constructor(port: number = 3002) {
    this.port = port;
    this.server = net.createServer(this.handleConnection.bind(this));
  }

  /**
   * Start ARexx bridge server
   */
  public start(): void {
    this.server.listen(this.port, () => {
      console.log(`ARexx Bridge Server listening on port ${this.port}`);
    });
  }

  /**
   * Stop ARexx bridge server
   */
  public stop(): void {
    this.server.close();
  }

  /**
   * Handle incoming connection
   */
  private handleConnection(socket: net.Socket): void {
    console.log('ARexx client connected:', socket.remoteAddress);

    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString();

      // Process complete commands (terminated by newline)
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          this.processCommand(socket, line.trim());
        }
      }
    });

    socket.on('end', () => {
      console.log('ARexx client disconnected');
      // Clean up sessions for this socket
      for (const [doorId, session] of this.sessions.entries()) {
        if (session.socket === socket) {
          this.sessions.delete(doorId);
        }
      }
    });

    socket.on('error', (err) => {
      console.error('Socket error:', err);
    });
  }

  /**
   * Process command from ARexx
   */
  private processCommand(socket: net.Socket, command: string): void {
    // Parse command (format: CMD:xxx||PARAM:value||...)
    const params = this.parseCommand(command);
    const cmd = params.CMD;

    if (!cmd) {
      this.sendResponse(socket, 'ERROR:Invalid command format');
      return;
    }

    try {
      switch (cmd) {
        case 'CREATE_DOOR':
          this.handleCreateDoor(socket, params);
          break;

        case 'CLEAR':
          this.handleClear(socket, params);
          break;

        case 'DRAW_TEXT':
          this.handleDrawText(socket, params);
          break;

        case 'DRAW_BOX':
          this.handleDrawBox(socket, params);
          break;

        case 'LOAD_ANSI':
          this.handleLoadAnsi(socket, params);
          break;

        case 'DRAW_ANSI':
          this.handleDrawAnsi(socket, params);
          break;

        case 'CREATE_SPRITE':
          this.handleCreateSprite(socket, params);
          break;

        case 'MOVE_SPRITE':
          this.handleMoveSprite(socket, params);
          break;

        case 'DRAW_SPRITE':
          this.handleDrawSprite(socket, params);
          break;

        case 'CREATE_BODY':
          this.handleCreateBody(socket, params);
          break;

        case 'APPLY_FORCE':
          this.handleApplyForce(socket, params);
          break;

        case 'SET_VELOCITY':
          this.handleSetVelocity(socket, params);
          break;

        case 'UPDATE_PHYSICS':
          this.handleUpdatePhysics(socket, params);
          break;

        case 'PLAY_SOUND':
          this.handlePlaySound(socket, params);
          break;

        case 'GEN_MUSIC':
          this.handleGenerateMusic(socket, params);
          break;

        case 'WAIT_INPUT':
          this.handleWaitInput(socket, params);
          break;

        case 'SEND_ANSI':
          this.handleSendAnsi(socket, params);
          break;

        case 'RENDER':
          this.handleRender(socket, params);
          break;

        case 'DISPOSE':
          this.handleDispose(socket, params);
          break;

        default:
          this.sendResponse(socket, `ERROR:Unknown command ${cmd}`);
      }
    } catch (error) {
      this.sendResponse(
        socket,
        `ERROR:${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Parse command string into parameters
   */
  private parseCommand(command: string): Record<string, string> {
    const params: Record<string, string> = {};
    const parts = command.split('||');

    for (const part of parts) {
      const colonIndex = part.indexOf(':');
      if (colonIndex > 0) {
        const key = part.substring(0, colonIndex);
        const value = part.substring(colonIndex + 1);
        params[key] = value;
      }
    }

    return params;
  }

  /**
   * Send response back to ARexx
   */
  private sendResponse(socket: net.Socket, response: string): void {
    socket.write(response + '\n');
  }

  /**
   * Get session by door ID
   */
  private getSession(doorId: string): DoorSession {
    const session = this.sessions.get(doorId);
    if (!session) {
      throw new Error(`Door session ${doorId} not found`);
    }
    return session;
  }

  // Command handlers

  private handleCreateDoor(socket: net.Socket, params: Record<string, string>): void {
    const doorId = `door_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const session: DoorSession = {
      id: doorId,
      name: params.NAME || 'Unnamed Door',
      version: params.VERSION || '1.0.0',
      author: params.AUTHOR || 'Unknown',
      graphics: new GraphicsEngine({ width: 80, height: 24 }),
      physics: new PhysicsEngine({ gravity: 9.8 }),
      audio: new AudioEngine(),
      socket
    };

    this.sessions.set(doorId, session);

    this.sendResponse(socket, `DOOR_ID:${doorId}`);
  }

  private handleClear(socket: net.Socket, params: Record<string, string>): void {
    const session = this.getSession(params.DOOR);
    const color = parseInt(params.COLOR || '0') as AnsiColor;

    session.graphics.clear(color);
    this.sendResponse(socket, 'OK');
  }

  private handleDrawText(socket: net.Socket, params: Record<string, string>): void {
    const session = this.getSession(params.DOOR);
    const x = parseInt(params.X);
    const y = parseInt(params.Y);
    const text = params.TEXT;
    const color = parseInt(params.COLOR || '7') as AnsiColor;

    session.graphics.drawText(x, y, text, color);
    this.sendResponse(socket, 'OK');
  }

  private handleDrawBox(socket: net.Socket, params: Record<string, string>): void {
    const session = this.getSession(params.DOOR);
    const x = parseInt(params.X);
    const y = parseInt(params.Y);
    const width = parseInt(params.WIDTH);
    const height = parseInt(params.HEIGHT);
    const fg = parseInt(params.FG || '7') as AnsiColor;

    session.graphics.drawBox({ x, y, width, height }, 'single', fg);
    this.sendResponse(socket, 'OK');
  }

  private handleLoadAnsi(socket: net.Socket, params: Record<string, string>): void {
    const session = this.getSession(params.DOOR);
    const id = params.ID;
    const data = params.DATA;

    session.graphics.loadAnsi(id, data);
    this.sendResponse(socket, 'OK');
  }

  private handleDrawAnsi(socket: net.Socket, params: Record<string, string>): void {
    const session = this.getSession(params.DOOR);
    const id = params.ID;
    const x = parseInt(params.X || '0');
    const y = parseInt(params.Y || '0');

    session.graphics.drawAnsi(id, { x, y });
    this.sendResponse(socket, 'OK');
  }

  private handleCreateSprite(socket: net.Socket, params: Record<string, string>): void {
    const session = this.getSession(params.DOOR);
    const id = params.ID;
    const x = parseInt(params.X);
    const y = parseInt(params.Y);
    const width = parseInt(params.WIDTH);
    const height = parseInt(params.HEIGHT);
    const frameData = params.FRAME;

    session.graphics.createSprite({
      id,
      frames: [{ data: frameData, duration: 100 }],
      position: { x, y },
      size: { width, height }
    });

    this.sendResponse(socket, `OK:${id}`);
  }

  private handleMoveSprite(socket: net.Socket, params: Record<string, string>): void {
    const session = this.getSession(params.DOOR);
    const id = params.ID;
    const x = parseInt(params.X);
    const y = parseInt(params.Y);

    session.graphics.moveSprite(id, { x, y });
    this.sendResponse(socket, 'OK');
  }

  private handleDrawSprite(socket: net.Socket, params: Record<string, string>): void {
    const session = this.getSession(params.DOOR);
    const id = params.ID;

    session.graphics.drawSprite(id);
    this.sendResponse(socket, 'OK');
  }

  private handleCreateBody(socket: net.Socket, params: Record<string, string>): void {
    const session = this.getSession(params.DOOR);
    const id = params.ID;
    const x = parseInt(params.X);
    const y = parseInt(params.Y);
    const width = parseInt(params.WIDTH);
    const height = parseInt(params.HEIGHT);
    const mass = parseFloat(params.MASS);
    const isStatic = params.STATIC === '1';

    session.physics.createBody({
      id,
      position: { x, y },
      size: { width, height },
      mass,
      static: isStatic
    });

    this.sendResponse(socket, `OK:${id}`);
  }

  private handleApplyForce(socket: net.Socket, params: Record<string, string>): void {
    const session = this.getSession(params.DOOR);
    const id = params.ID;
    const fx = parseFloat(params.FX);
    const fy = parseFloat(params.FY);

    session.physics.applyForce(id, { x: fx, y: fy });
    this.sendResponse(socket, 'OK');
  }

  private handleSetVelocity(socket: net.Socket, params: Record<string, string>): void {
    const session = this.getSession(params.DOOR);
    const id = params.ID;
    const vx = parseFloat(params.VX);
    const vy = parseFloat(params.VY);

    session.physics.setVelocity(id, { x: vx, y: vy });
    this.sendResponse(socket, 'OK');
  }

  private handleUpdatePhysics(socket: net.Socket, params: Record<string, string>): void {
    const session = this.getSession(params.DOOR);
    const delta = parseFloat(params.DELTA);

    session.physics.update(delta);
    this.sendResponse(socket, 'OK');
  }

  private handlePlaySound(socket: net.Socket, params: Record<string, string>): void {
    const session = this.getSession(params.DOOR);
    const type = params.TYPE;
    const freq = parseInt(params.FREQ);
    const duration = parseFloat(params.DURATION);

    session.audio.playSound(type, {
      frequency: freq,
      duration,
      envelope: 'pluck',
      volume: 0.5
    });

    this.sendResponse(socket, 'OK');
  }

  private handleGenerateMusic(socket: net.Socket, params: Record<string, string>): void {
    const session = this.getSession(params.DOOR);
    const prompt = params.PROMPT;
    const tempo = parseInt(params.TEMPO);
    const pattern = params.PATTERN;

    session.audio.generateMusic({
      prompt,
      tempo,
      pattern,
      instruments: ['square']
    });

    this.sendResponse(socket, 'OK');
  }

  private handleWaitInput(socket: net.Socket, params: Record<string, string>): void {
    // This would integrate with the BBS terminal input system
    // For now, return a placeholder
    this.sendResponse(socket, 'KEY:');
  }

  private handleSendAnsi(socket: net.Socket, params: Record<string, string>): void {
    // This would send ANSI to the BBS terminal
    // For now, just acknowledge
    this.sendResponse(socket, 'OK');
  }

  private handleRender(socket: net.Socket, params: Record<string, string>): void {
    const session = this.getSession(params.DOOR);
    const ansiOutput = session.graphics.render();

    this.sendResponse(socket, `ANSI:${ansiOutput}`);
  }

  private handleDispose(socket: net.Socket, params: Record<string, string>): void {
    const doorId = params.DOOR;
    const session = this.getSession(doorId);

    session.audio.dispose();
    this.sessions.delete(doorId);

    this.sendResponse(socket, 'OK');
  }
}

// Export singleton instance
export const arexxServer = new ARexxServer();
