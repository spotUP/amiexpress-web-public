/**
 * Telnet Connect Door
 *
 * Allows users to telnet to other BBSes from within this BBS.
 * Ported from Amiga E version.
 *
 * Features:
 * - Configure multiple destination BBSes
 * - Auto-login with saved credentials
 * - Manual connection mode
 *
 * Original: dev/docs/AmiExpressEDoorSources/telnetConnect/telnetdoor.e
 */

import { Socket as SocketIOSocket } from 'socket.io';
import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';

interface TelnetConfig {
  serverHost: string;
  telnetPort: number;
  usernamePrompt?: string;
  passwordPrompt?: string;
  username?: string;
  password?: string;
  autoLogin?: boolean;
}

interface TelnetConnection {
  socket: net.Socket;
  buffer: string;
  connected: boolean;
  loginSent: boolean;
}

/**
 * Load telnet configuration
 */
function loadConfig(): TelnetConfig[] {
  const configPath = path.join(process.cwd(), 'doors', 'telnet-connect', 'telnetdoor.cfg');
  const configs: TelnetConfig[] = [];

  try {
    if (fs.existsSync(configPath)) {
      const fileContent = fs.readFileSync(configPath, 'utf-8');
      const lines = fileContent.split('\n');
      let currentConfig: Partial<TelnetConfig> = {};

      for (const line of lines) {
        const trimmed = line.trim();

        // Skip comments and empty lines
        if (trimmed.startsWith('#') || trimmed.startsWith(';') || !trimmed) {
          continue;
        }

        // Check for section headers [BBSNAME]
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          // Save previous config if it has required fields
          if (currentConfig.serverHost) {
            configs.push({
              serverHost: currentConfig.serverHost,
              telnetPort: currentConfig.telnetPort || 23,
              usernamePrompt: currentConfig.usernamePrompt,
              passwordPrompt: currentConfig.passwordPrompt,
              username: currentConfig.username,
              password: currentConfig.password,
              autoLogin: currentConfig.autoLogin !== false
            });
          }
          currentConfig = {};
          continue;
        }

        if (!trimmed.includes('=')) continue;

        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=').trim();
        const upperKey = key.trim().toUpperCase();

        switch (upperKey) {
          case 'SERVERHOST':
            currentConfig.serverHost = value;
            break;
          case 'TELNETPORT':
            currentConfig.telnetPort = parseInt(value) || 23;
            break;
          case 'USERNAMEPROMPT':
            currentConfig.usernamePrompt = value;
            break;
          case 'PASSWORDPROMPT':
            currentConfig.passwordPrompt = value;
            break;
          case 'USERNAME':
            currentConfig.username = value;
            break;
          case 'PASSWORD':
            currentConfig.password = value;
            break;
          case 'AUTOLOGIN':
            currentConfig.autoLogin = value.toUpperCase() === 'YES' || value === '1';
            break;
        }
      }

      // Add last config
      if (currentConfig.serverHost) {
        configs.push({
          serverHost: currentConfig.serverHost,
          telnetPort: currentConfig.telnetPort || 23,
          usernamePrompt: currentConfig.usernamePrompt,
          passwordPrompt: currentConfig.passwordPrompt,
          username: currentConfig.username,
          password: currentConfig.password,
          autoLogin: currentConfig.autoLogin !== false
        });
      }
    }
  } catch (err) {
    console.error('[TelnetConnect] Error loading config:', err);
  }

  return configs;
}

/**
 * Display BBS selection menu
 */
function displayMenu(socket: SocketIOSocket, configs: TelnetConfig[]): void {
  socket.emit('ansi-output', '\x1b[2J\x1b[H'); // Clear screen
  socket.emit('ansi-output', '\x1b[36m+================================================+\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[36m|\x1b[0m           \x1b[32mTELNET CONNECT\x1b[0m                     \x1b[36m|\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[36m+================================================+\x1b[0m\r\n\r\n');

  if (configs.length === 0) {
    socket.emit('ansi-output', '\x1b[33mNo BBSes configured!\x1b[0m\r\n\r\n');
    socket.emit('ansi-output', 'Create doors/telnet-connect/telnetdoor.cfg\r\n');
    socket.emit('ansi-output', 'See telnetdoor.cfg.example for format.\r\n\r\n');
  } else {
    socket.emit('ansi-output', '\x1b[33mSelect a BBS to connect to:\x1b[0m\r\n\r\n');

    configs.forEach((config, index) => {
      socket.emit('ansi-output', `  \x1b[36m${index + 1}.\x1b[0m ${config.serverHost}:${config.telnetPort}\r\n`);
    });

    socket.emit('ansi-output', `  \x1b[36mM.\x1b[0m Manual connection\r\n`);
    socket.emit('ansi-output', `  \x1b[36mQ.\x1b[0m Quit\r\n\r\n`);
  }

  socket.emit('ansi-output', '\x1b[33mYour choice:\x1b[0m ');
}

/**
 * Connect to telnet server
 */
async function connectTelnet(
  ioSocket: SocketIOSocket,
  config: TelnetConfig,
  currentUsername: string
): Promise<void> {
  return new Promise((resolve) => {
    ioSocket.emit('ansi-output', `\r\n\x1b[36mConnecting to ${config.serverHost}:${config.telnetPort}...\x1b[0m\r\n`);

    const telnetSocket = net.createConnection({
      host: config.serverHost,
      port: config.telnetPort,
      timeout: 30000
    });

    const conn: TelnetConnection = {
      socket: telnetSocket,
      buffer: '',
      connected: false,
      loginSent: false
    };

    // Handle connection established
    telnetSocket.on('connect', () => {
      conn.connected = true;
      ioSocket.emit('ansi-output', `\x1b[32mConnected to ${config.serverHost}!\x1b[0m\r\n\r\n`);
    });

    // Handle incoming data from telnet server
    telnetSocket.on('data', (data: Buffer) => {
      const text = data.toString('binary');
      conn.buffer += text;

      // Send to user's terminal
      ioSocket.emit('ansi-output', text);

      // Auto-login if configured
      if (config.autoLogin && !conn.loginSent) {
        // Check for username prompt
        if (config.usernamePrompt && conn.buffer.includes(config.usernamePrompt)) {
          const username = config.username === '#' ? currentUsername : config.username;
          if (username) {
            telnetSocket.write(username + '\r\n');
          }
        }

        // Check for password prompt
        if (config.passwordPrompt && conn.buffer.includes(config.passwordPrompt)) {
          if (config.password) {
            telnetSocket.write(config.password + '\r\n');
            conn.loginSent = true;
          }
        }
      }
    });

    // Handle user input - forward to telnet server
    const handleInput = (data: string) => {
      if (conn.connected && !telnetSocket.destroyed) {
        telnetSocket.write(data);
      }
    };

    ioSocket.on('user-input', handleInput);

    // Handle disconnection
    telnetSocket.on('close', () => {
      ioSocket.off('user-input', handleInput);
      ioSocket.emit('ansi-output', '\r\n\x1b[33mConnection closed.\x1b[0m\r\n');
      resolve();
    });

    telnetSocket.on('error', (err: Error) => {
      ioSocket.off('user-input', handleInput);
      ioSocket.emit('ansi-output', `\r\n\x1b[31mConnection error: ${err.message}\x1b[0m\r\n`);
      resolve();
    });

    telnetSocket.on('timeout', () => {
      ioSocket.off('user-input', handleInput);
      telnetSocket.destroy();
      ioSocket.emit('ansi-output', '\r\n\x1b[31mConnection timed out.\x1b[0m\r\n');
      resolve();
    });
  });
}

/**
 * Get manual connection details from user
 */
async function getManualConnection(socket: SocketIOSocket): Promise<TelnetConfig | null> {
  return new Promise((resolve) => {
    const config: Partial<TelnetConfig> = {};
    let step = 0;

    socket.emit('ansi-output', '\r\n\x1b[33mManual Telnet Connection\x1b[0m\r\n\r\n');
    socket.emit('ansi-output', 'Enter hostname or IP: ');

    const handleInput = (data: string) => {
      const input = data.trim();

      switch (step) {
        case 0: // Get hostname
          if (!input) {
            delete bbsSession.doorInputHandler;
            resolve(null);
            return;
          }
          config.serverHost = input;
          socket.emit('ansi-output', `\r\nEnter port (default 23): `);
          step++;
          break;

        case 1: // Get port
          config.telnetPort = parseInt(input) || 23;
          socket.off('user-input', handleInput);
          resolve({
            serverHost: config.serverHost!,
            telnetPort: config.telnetPort,
            autoLogin: false
          });
          break;
      }
    };

    bbsSession.doorInputHandler = handleInput;
  });
}

/**
 * Run Telnet Connect door (TypeScript door interface)
 */
export async function runDoor(doorSession: any): Promise<void> {
  const { socket, user, bbsSession } = doorSession;

  const configs = loadConfig();
  let running = true;

  while (running) {
    displayMenu(socket, configs);

    // Wait for user selection
    const choice = await new Promise<string>((resolve) => {
      const handleInput = (data: string) => {
        delete bbsSession.doorInputHandler;
        resolve(data.trim().toUpperCase());
      };
      bbsSession.doorInputHandler = handleInput;
    });

    if (choice === 'Q' || !choice) {
      running = false;
      break;
    }

    if (choice === 'M') {
      // Manual connection
      const manualConfig = await getManualConnection(socket);
      if (manualConfig) {
        await connectTelnet(socket, manualConfig, user?.username || 'Guest');
      }
    } else {
      // Numeric selection
      const index = parseInt(choice) - 1;
      if (index >= 0 && index < configs.length) {
        await connectTelnet(socket, configs[index], user?.username || 'Guest');
      } else {
        socket.emit('ansi-output', '\r\n\x1b[31mInvalid selection.\x1b[0m\r\n');
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
  }

  socket.emit('ansi-output', '\r\n\x1b[32mReturning to menu...\x1b[0m\r\n');
}
