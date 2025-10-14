#!/usr/bin/env node

const { spawn, exec } = require('child_process');
const http = require('http');

let frontendProcess = null;
let backendProcess = null;
let watcherProcess = null;

const FRONTEND_PORT = 5173;
const BACKEND_PORT = 3001;

function log(message, type = 'INFO') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${type}] ${message}`);
}

function checkPort(port) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: 'localhost',
      port: port,
      path: '/',
      method: 'GET',
      timeout: 2000
    }, (res) => {
      resolve(true);
    });

    req.on('error', () => {
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

async function checkServers() {
  const frontendUp = await checkPort(FRONTEND_PORT);
  const backendUp = await checkPort(BACKEND_PORT);

  log(`Frontend (port ${FRONTEND_PORT}): ${frontendUp ? 'UP' : 'DOWN'}`);
  log(`Backend (port ${BACKEND_PORT}): ${backendUp ? 'UP' : 'DOWN'}`);

  return { frontendUp, backendUp };
}

function killProcesses() {
  return new Promise((resolve) => {
    log('Killing existing processes...');

    // Kill all related processes
    const killCmd = spawn('pkill', ['-f', 'vite|node.*backend|ts-node'], {
      stdio: 'inherit'
    });

    killCmd.on('close', () => {
      setTimeout(() => {
        resolve();
      }, 3000); // Wait 3 seconds for processes to die
    });

    killCmd.on('error', () => {
      // pkill might fail if no processes found, that's ok
      setTimeout(() => {
        resolve();
      }, 1000);
    });
  });
}

function startFrontend() {
  if (frontendProcess) {
    log('Frontend process already exists, skipping...');
    return;
  }

  log('Starting frontend server...');
  frontendProcess = spawn('npm', ['run', 'dev:frontend'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false
  });

  frontendProcess.stdout.on('data', (data) => {
    const output = data.toString().trim();
    if (output.includes('ready') || output.includes('Local:')) {
      log(`Frontend: ${output}`, 'FRONTEND');
    }
  });

  frontendProcess.stderr.on('data', (data) => {
    log(`Frontend error: ${data.toString().trim()}`, 'ERROR');
  });

  frontendProcess.on('close', (code) => {
    log(`Frontend process exited with code ${code}`, 'WARN');
    frontendProcess = null;
  });

  frontendProcess.on('error', (err) => {
    log(`Frontend process error: ${err.message}`, 'ERROR');
    frontendProcess = null;
  });
}

function startBackend() {
  if (backendProcess) {
    log('Backend process already exists, skipping...');
    return;
  }

  log('Starting backend server...');
  backendProcess = spawn('npm', ['run', 'dev:backend'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false
  });

  backendProcess.stdout.on('data', (data) => {
    const output = data.toString().trim();
    if (output.includes('Server running') || output.includes('listening')) {
      log(`Backend: ${output}`, 'BACKEND');
    }
  });

  backendProcess.stderr.on('data', (data) => {
    log(`Backend error: ${data.toString().trim()}`, 'ERROR');
  });

  backendProcess.on('close', (code) => {
    log(`Backend process exited with code ${code}`, 'WARN');
    backendProcess = null;
  });

  backendProcess.on('error', (err) => {
    log(`Backend process error: ${err.message}`, 'ERROR');
    backendProcess = null;
  });
}

async function ensureServersRunning() {
  const { frontendUp, backendUp } = await checkServers();

  if (!frontendUp) {
    log('Frontend server is down, restarting...');
    if (frontendProcess) {
      frontendProcess.kill();
      frontendProcess = null;
    }
    startFrontend();
  }

  if (!backendUp) {
    log('Backend server is down, restarting...');
    if (backendProcess) {
      backendProcess.kill();
      backendProcess = null;
    }
    startBackend();
  }
}

async function main() {
  log('🚀 Starting AmiExpress Web Development Server Manager');
  log('Press Ctrl+C to stop all servers and exit');

  // Initial cleanup
  await killProcesses();

  // Start servers
  startFrontend();
  startBackend();

  // Wait for servers to start
  log('Waiting for servers to initialize...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Check servers every 10 seconds
  setInterval(ensureServersRunning, 10000);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    log('Received SIGINT, shutting down gracefully...');

    if (frontendProcess) {
      log('Stopping frontend server...');
      frontendProcess.kill();
    }

    if (backendProcess) {
      log('Stopping backend server...');
      backendProcess.kill();
    }

    if (watcherProcess) {
      log('Stopping file watcher...');
      watcherProcess.kill();
    }

    await killProcesses();
    log('All servers stopped. Goodbye! 👋');
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    log('Received SIGTERM, shutting down...');
    await killProcesses();
    process.exit(0);
  });

  log('✅ Server manager is running!');
  log(`📊 Monitoring servers every 10 seconds`);
  log(`🌐 Frontend: http://localhost:${FRONTEND_PORT}`);
  log(`🔧 Backend: http://localhost:${BACKEND_PORT}`);
}

// Run the server manager
main().catch((err) => {
  log(`Fatal error: ${err.message}`, 'ERROR');
  process.exit(1);
});