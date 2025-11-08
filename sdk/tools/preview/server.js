/**
 * Browser-Based Preview Server
 *
 * Provides a live testing environment for BBS doors with:
 * - Real-time ANSI rendering
 * - Keyboard input simulation
 * - WebSocket communication
 * - Hot reload on file changes
 * - Debug console
 *
 * @example
 * ```bash
 * # Start preview server
 * npm run preview
 *
 * # Opens browser to http://localhost:8080
 * # Select door to preview
 * # Test in real-time with full ANSI support
 * ```
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 8080;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Root route - explicitly serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API: List available doors
app.get('/api/doors', (req, res) => {
  const examplesDir = path.join(__dirname, '../../examples');
  const doors = fs
    .readdirSync(examplesDir)
    .filter((name) => {
      const stat = fs.statSync(path.join(examplesDir, name));
      return stat.isDirectory();
    })
    .map((name) => {
      const pkgPath = path.join(examplesDir, name, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        return {
          id: name,
          name: pkg.name || name,
          description: pkg.description || '',
          version: pkg.version || '1.0.0',
        };
      }
      return { id: name, name, description: '', version: '1.0.0' };
    });

  res.json(doors);
});

// WebSocket connections
const clients = new Map();

wss.on('connection', (ws) => {
  console.log('✅ Client connected');

  const clientId = Date.now();
  clients.set(clientId, {
    ws,
    doorProcess: null,
    currentDoor: null,
  });

  ws.on('message', (message) => {
    const data = JSON.parse(message);
    handleClientMessage(clientId, data);
  });

  ws.on('close', () => {
    console.log('❌ Client disconnected');
    const client = clients.get(clientId);
    if (client && client.doorProcess) {
      client.doorProcess.kill();
    }
    clients.delete(clientId);
  });

  // Send welcome message
  ws.send(
    JSON.stringify({
      type: 'connected',
      message: 'Preview server ready',
    })
  );
});

/**
 * Handle client messages
 */
function handleClientMessage(clientId, data) {
  const client = clients.get(clientId);
  if (!client) return;

  if (data.type === 'start-door') {
    startDoor(clientId, data.doorId);
  } else if (data.type === 'input') {
    sendInputToDoor(clientId, data.key);
  } else if (data.type === 'stop-door') {
    stopDoor(clientId);
  }
}

/**
 * Start door process
 */
function startDoor(clientId, doorId) {
  const client = clients.get(clientId);
  if (!client) return;

  // Stop existing door
  if (client.doorProcess) {
    client.doorProcess.kill();
  }

  const doorPath = path.join(__dirname, '../../examples', doorId);
  const mainFile = path.join(doorPath, 'index.js');

  if (!fs.existsSync(mainFile)) {
    client.ws.send(
      JSON.stringify({
        type: 'error',
        message: `Door main file not found: ${mainFile}`,
      })
    );
    return;
  }

  console.log(`🚀 Starting door: ${doorId}`);

  const { spawn } = require('child_process');
  const doorProcess = spawn('node', [mainFile], {
    cwd: doorPath,
    env: { ...process.env, PREVIEW_MODE: '1' },
  });

  client.doorProcess = doorProcess;
  client.currentDoor = doorId;

  // Capture stdout (ANSI output)
  doorProcess.stdout.on('data', (data) => {
    client.ws.send(
      JSON.stringify({
        type: 'output',
        data: data.toString(),
      })
    );
  });

  // Capture stderr (errors)
  doorProcess.stderr.on('data', (data) => {
    client.ws.send(
      JSON.stringify({
        type: 'error',
        message: data.toString(),
      })
    );
  });

  // Handle process exit
  doorProcess.on('exit', (code) => {
    console.log(`🛑 Door exited with code ${code}`);
    client.ws.send(
      JSON.stringify({
        type: 'door-stopped',
        code,
      })
    );
    client.doorProcess = null;
  });

  // Watch for file changes (hot reload)
  const watcher = chokidar.watch(path.join(doorPath, '**/*.{ts,js}'), {
    ignored: /node_modules/,
    persistent: true,
  });

  watcher.on('change', (filePath) => {
    console.log(`📝 File changed: ${filePath}`);
    client.ws.send(
      JSON.stringify({
        type: 'reload',
        message: 'Files changed, reloading...',
      })
    );

    // Restart door
    stopDoor(clientId);
    setTimeout(() => startDoor(clientId, doorId), 1000);
  });

  client.watcher = watcher;

  // Send started message
  client.ws.send(
    JSON.stringify({
      type: 'door-started',
      doorId,
    })
  );
}

/**
 * Send input to door
 */
function sendInputToDoor(clientId, key) {
  const client = clients.get(clientId);
  if (!client || !client.doorProcess) return;

  // Send key to door's stdin
  client.doorProcess.stdin.write(key);
}

/**
 * Stop door process
 */
function stopDoor(clientId) {
  const client = clients.get(clientId);
  if (!client) return;

  if (client.doorProcess) {
    client.doorProcess.kill();
    client.doorProcess = null;
  }

  if (client.watcher) {
    client.watcher.close();
    client.watcher = null;
  }

  client.currentDoor = null;
}

// Start server
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║   🎮  AmiExpress BBS Door Preview Server                       ║
║                                                                ║
║   Server running at: http://localhost:${PORT}                     ║
║                                                                ║
║   Features:                                                    ║
║   ✓ Live ANSI rendering                                       ║
║   ✓ Real-time keyboard input                                  ║
║   ✓ Hot reload on file changes                                ║
║   ✓ Debug console                                             ║
║                                                                ║
║   Open your browser and start testing!                        ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
  `);
});
