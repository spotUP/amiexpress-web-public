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
const archiver = require('archiver');
const AdmZip = require('adm-zip');
const multer = require('multer');
const { spawn, execSync, exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);

// Configure multer for file uploads (store in memory)
const upload = multer({ storage: multer.memoryStorage() });

const PORT = process.env.PORT || 8080;
const DEBUG_OUTPUT = process.env.DEBUG_OUTPUT === 'true' || false;

// Door directories - prefer BBS doors/ over SDK examples/
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const BBS_DOORS_DIR = path.join(PROJECT_ROOT, 'doors');
const SDK_EXAMPLES_DIR = path.join(__dirname, '../../examples');

// Use BBS doors directory as primary source for TypeScript doors
const DOORS_DIR = fs.existsSync(BBS_DOORS_DIR) ? BBS_DOORS_DIR : SDK_EXAMPLES_DIR;

/**
 * Resolve door path - checks BBS doors/ first, then SDK examples/
 * @param {string} doorId - Door directory name
 * @returns {string|null} Path to door directory or null if not found
 */
function resolveDoorPath(doorId) {
  const bbsPath = path.join(BBS_DOORS_DIR, doorId);
  if (fs.existsSync(bbsPath)) return bbsPath;

  const sdkPath = path.join(SDK_EXAMPLES_DIR, doorId);
  if (fs.existsSync(sdkPath)) return sdkPath;

  return null;
}

// Log DEBUG_OUTPUT at startup
console.log(`[DEBUG] DEBUG_OUTPUT: ${DEBUG_OUTPUT} (from env: ${process.env.DEBUG_OUTPUT})`);
console.log(`[DEBUG] DOORS_DIR: ${DOORS_DIR}`);

/**
 * Install door to BBS structure
 * Creates .info file in Commands/BBSCmd/ and symlinks door to doors/
 *
 * @param {string} doorId - Door directory name (e.g., "2048-game")
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function installDoorToBBS(doorId) {
  try {
    const projectRoot = path.resolve(__dirname, '../../..');
    // Prefer live BBS doors/<doorId>; fall back to legacy sdk/examples if missing
    const doorsBase = path.join(projectRoot, 'doors');
    const sdkExamplesBase = path.join(__dirname, '../../examples');
    const preferredDoorPath = path.join(doorsBase, doorId);
    const fallbackDoorPath = path.join(sdkExamplesBase, doorId);
    const doorPath = fs.existsSync(preferredDoorPath) ? preferredDoorPath : fallbackDoorPath;
    const pkgPath = path.join(doorPath, 'package.json');

    // Read package.json for door metadata
    if (!fs.existsSync(pkgPath)) {
      return { success: false, message: 'package.json not found (expected in doors/<id> or sdk/examples/<id>)' };
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const bbsCommand = pkg.bbsCommand || doorId.toUpperCase().replace(/-/g, '');
    const doorType = pkg.doorType || 'TS';
    const description = pkg.description || '';
    const access = pkg.accessLevel !== undefined ? pkg.accessLevel : 0;

    // Generate .info file content
    const infoContent = [
      `BBSCMD=${bbsCommand}`,
      `TYPE=${doorType}`,
      `LOCATION=Doors/${doorId}`,
      description ? `DESCRIPTION=${description}` : '',
      `ACCESS=${access}`,
      `MULTINODE=YES`,
      `PRIORITY=SAME`,
      ''
    ].filter(Boolean).join('\n');

    // Write .info file to Commands/BBSCmd/
    const commandsDir = path.join(projectRoot, 'Commands/BBSCmd');
    if (!fs.existsSync(commandsDir)) {
      fs.mkdirSync(commandsDir, { recursive: true });
    }

    const infoPath = path.join(commandsDir, `${bbsCommand}.info`);
    fs.writeFileSync(infoPath, infoContent);
    console.log(`✓ Created ${bbsCommand}.info`);

    // Ensure doors/ exists (door should already live there in dev)
    const doorsDir = path.join(projectRoot, 'doors');
    if (!fs.existsSync(doorsDir)) {
      fs.mkdirSync(doorsDir, { recursive: true });
    }

    // Reload BBS command cache via API
    try {
      const response = await fetch('http://localhost:3001/api/doors/reload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`✓ BBS commands reloaded: ${result.message}`);
      } else {
        console.warn(`[WARNING]  Failed to reload BBS commands: ${response.statusText}`);
      }
    } catch (err) {
      console.warn(`[WARNING]  Could not reload BBS commands (is BBS running?): ${err.message}`);
    }

    return {
      success: true,
      message: `Installed ${bbsCommand} to BBS (Command: ${bbsCommand})`
    };

  } catch (error) {
    console.error(`[ERROR] Error installing door to BBS:`, error);
    return {
      success: false,
      message: `Failed to install: ${error.message}`
    };
  }
}

/**
 * Kill any existing servers on the port before starting
 */
function killOldServers() {
  try {
    console.log(`[DEBUG] Checking for existing servers on port ${PORT}...`);

    // Try to find and kill any process on the port
    const findCmd = `lsof -ti:${PORT}`;
    try {
      const pids = execSync(findCmd, { encoding: 'utf8' }).trim();
      if (pids) {
        console.log(`💀 Killing old server processes: ${pids.split('\n').join(', ')}`);
        execSync(`lsof -ti:${PORT} | xargs kill -9`, { stdio: 'ignore' });

        // Wait a moment for the port to be freed
        const sleep = (ms) => execSync(`sleep ${ms / 1000}`, { stdio: 'ignore' });
        sleep(1000);

        console.log('[OK] Old servers killed');
      } else {
        console.log('[OK] No old servers found');
      }
    } catch (err) {
      // No process found on port (lsof returns non-zero when nothing found)
      console.log('[OK] No old servers found');
    }
  } catch (err) {
    console.warn('[WARNING]  Could not check for old servers:', err.message);
  }
}

// Kill old servers before starting
killOldServers();

/**
 * Compile all TypeScript doors and send progress to connected clients
 */
async function compileExamples() {
  // Use BBS doors directory for compiling TypeScript doors
  const examplesDir = DOORS_DIR;

  // Broadcast to all clients
  const broadcast = (message, level = 'log') => {
    // Determine ANSI color based on message content
    let color = '';
    const reset = '\x1b[0m';

    if (level === 'error' || message.includes('[WARNING]')) {
      color = '\x1b[33m'; // Yellow for warnings
    } else if (message.includes('[OK]')) {
      color = '\x1b[32m'; // Green for success
    } else if (message.includes('[PACKAGE]')) {
      color = '\x1b[36m'; // Cyan for progress
    } else if (message.includes('[START]')) {
      color = '\x1b[35m'; // Magenta for important
    } else {
      color = '\x1b[90m'; // Gray for info
    }

    const formattedMessage = `${color}${message}${reset}`;

    // Send to all connected WebSocket clients
    clients.forEach(client => {
      if (client.ws && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({
          type: 'debug',
          data: formattedMessage,
        }));
      }
    });

    // Also log to console if DEBUG_OUTPUT is enabled
    if (DEBUG_OUTPUT) {
      console.log(message);
    }
  };

  broadcast('\x1b[36m[BUILD] Compiling example games...\x1b[0m');
  broadcast('');

  let compileErrors = 0;

  // Get all example directories
  const examples = fs.readdirSync(examplesDir)
    .filter(name => {
      const stat = fs.statSync(path.join(examplesDir, name));
      return stat.isDirectory();
    });

  // Type-check all TypeScript examples (in parallel for speed)
  const compilePromises = examples.map(async (exampleName) => {
    const examplePath = path.join(examplesDir, exampleName);

    // Skip if no TypeScript files exist
    const tsFiles = fs.readdirSync(examplePath).filter(f => f.endsWith('.ts'));
    if (tsFiles.length === 0) {
      return { name: exampleName, success: true, skipped: true };
    }

    broadcast(`  [PACKAGE] Type-checking ${exampleName}...`);

    try {
      // Run TypeScript compiler in type-check mode (non-blocking)
      await execPromise('npx tsc --noEmit', {
        cwd: examplePath,
        timeout: 30000, // 30 second timeout
      });

      broadcast(`  [OK] ${exampleName} type-checked successfully`);
      broadcast('');
      return { name: exampleName, success: true };
    } catch (error) {
      // Type errors are non-fatal
      broadcast(`  [WARNING]  ${exampleName} has type errors (non-fatal):`);
      broadcast(error.stdout || error.message);
      broadcast('');
      return { name: exampleName, success: false };
    }
  });

  // Wait for all compilations to complete
  const results = await Promise.all(compilePromises);
  compileErrors = results.filter(r => !r.success && !r.skipped).length;

  if (compileErrors > 0) {
    broadcast(`[WARNING]  Warning: ${compileErrors} game(s) have TypeScript errors`);
    broadcast('   The preview server is running, but these games may not work correctly');
    broadcast('');
  }

  broadcast('[START] Starting preview server...');
  broadcast('[PACKAGE] Serving React frontend from public/');
  broadcast('');
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(express.json());

// CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Serve static files - prefer React build if available
const reactDistDir = path.join(__dirname, 'frontend/dist');
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(reactDistDir)) {
  console.log('[PACKAGE] Serving React frontend from frontend/dist/');
  app.use(express.static(reactDistDir));
} else {
  console.log('[PACKAGE] Serving classic frontend from public/');
  app.use(express.static(publicDir));
}

// Root route - explicitly serve index.html
app.get('/', (req, res) => {
  const reactIndex = path.join(reactDistDir, 'index.html');
  const classicIndex = path.join(publicDir, 'index.html');

  if (fs.existsSync(reactIndex)) {
    res.sendFile(reactIndex);
  } else {
    res.sendFile(classicIndex);
  }
});

// API: List available doors (from BBS doors/ directory)
app.get('/api/doors', (req, res) => {
  // Only list TypeScript doors with package.json from BBS doors/ directory
  const doors = fs
    .readdirSync(DOORS_DIR)
    .filter((name) => {
      const doorPath = path.join(DOORS_DIR, name);
      const stat = fs.statSync(doorPath);
      if (!stat.isDirectory()) return false;
      // Only include doors with package.json (TypeScript doors)
      return fs.existsSync(path.join(doorPath, 'package.json'));
    })
    .map((name) => {
      const doorPath = path.join(DOORS_DIR, name);
      const pkgPath = path.join(doorPath, 'package.json');
      const thumbnailPath = path.join(doorPath, 'thumbnail.png');
      const hasScreenshot = fs.existsSync(thumbnailPath);

      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      return {
        id: name,
        name: pkg.name || name,
        description: pkg.description || '',
        version: pkg.version || '1.0.0',
        author: pkg.author || 'Unknown',
        favorite: false,
        lastOpened: 0,
        thumbnail: hasScreenshot ? `/api/doors/${name}/thumbnail` : undefined,
      };
    });

  res.json(doors);
});

// API: Get door metadata
app.get('/api/doors/:doorId/metadata', (req, res) => {
  try {
    const { doorId } = req.params;
    const doorPath = resolveDoorPath(doorId);

    if (!fs.existsSync(doorPath)) {
      return res.status(404).json({ error: 'Door not found' });
    }

    const pkgPath = path.join(doorPath, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      return res.status(404).json({ error: 'package.json not found' });
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    // Get all files recursively
    const files = [];
    let totalSize = 0;

    function scanDir(dir, baseDir = '') {
      const items = fs.readdirSync(dir);
      items.forEach((item) => {
        const fullPath = path.join(dir, item);
        const relativePath = path.join(baseDir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          if (item !== 'node_modules' && item !== '.git' && item !== 'dist') {
            scanDir(fullPath, relativePath);
          }
        } else {
          files.push({
            path: relativePath.replace(/\\/g, '/'),
            size: stat.size,
          });
          totalSize += stat.size;
        }
      });
    }

    scanDir(doorPath);

    res.json({
      name: pkg.name,
      version: pkg.version,
      description: pkg.description || '',
      author: pkg.author || '',
      files,
      totalSize,
      dependencies: pkg.dependencies || {},
      bbsCommand: pkg.bbsCommand || '',
    });
  } catch (error) {
    console.error('Error getting door metadata:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Get door files tree
app.get('/api/doors/:doorId/files', (req, res) => {
  try {
    const { doorId } = req.params;
    const doorPath = resolveDoorPath(doorId);

    if (!fs.existsSync(doorPath)) {
      return res.status(404).json({ error: 'Door not found' });
    }

    function buildTree(dir, baseDir = '') {
      const items = fs.readdirSync(dir);
      const tree = [];

      items.forEach((item) => {
        const fullPath = path.join(dir, item);
        const relativePath = path.join(baseDir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          if (item !== 'node_modules' && item !== '.git' && item !== 'dist') {
            tree.push({
              name: item,
              path: relativePath.replace(/\\/g, '/'),
              type: 'directory',
              children: buildTree(fullPath, relativePath),
            });
          }
        } else {
          // Only include editable files
          const ext = path.extname(item);
          if (['.ts', '.js', '.json', '.md', '.txt'].includes(ext)) {
            tree.push({
              name: item,
              path: relativePath.replace(/\\/g, '/'),
              type: 'file',
              size: stat.size,
            });
          }
        }
      });

      return tree;
    }

    const tree = buildTree(doorPath);
    res.json(tree);
  } catch (error) {
    console.error('Error getting door files:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Get specific file content
app.get('/api/doors/:doorId/files/*', (req, res) => {
  try {
    const { doorId } = req.params;
    const filePath = req.params[0]; // Everything after /files/
    const doorPath = resolveDoorPath(doorId);
    if (!doorPath) {
      return res.status(404).json({ error: 'Door not found' });
    }
    const fullPath = path.join(doorPath, filePath);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) {
      return res.status(400).json({ error: 'Path is not a file' });
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    res.json({ content });
  } catch (error) {
    console.error('Error reading file:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Get door thumbnail
app.get('/api/doors/:doorId/thumbnail', (req, res) => {
  try {
    const { doorId } = req.params;
    const doorPath = resolveDoorPath(doorId);
    if (!doorPath) {
      return res.status(404).json({ error: 'Door not found' });
    }
    const thumbnailPath = path.join(doorPath, 'thumbnail.png');

    if (!fs.existsSync(thumbnailPath)) {
      return res.status(404).json({ error: 'Thumbnail not found' });
    }

    res.sendFile(thumbnailPath);
  } catch (error) {
    console.error('Error serving thumbnail:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Save specific file content
app.post('/api/doors/:doorId/files/*', (req, res) => {
  try {
    const { doorId } = req.params;
    const filePath = req.params[0]; // Everything after /files/
    const { content } = req.body;

    if (content === undefined) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const doorPath = resolveDoorPath(doorId);
    if (!doorPath) {
      return res.status(404).json({ error: 'Door not found' });
    }
    const fullPath = path.join(doorPath, filePath);

    // Security check: ensure path is within door directory
    const resolvedPath = path.resolve(fullPath);
    if (!resolvedPath.startsWith(doorPath)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Create directory if needed
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`✓ Saved file: ${filePath}`);

    res.json({ success: true, path: filePath });
  } catch (error) {
    console.error('Error saving file:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// AI ASSISTANT & GENERATION
// =============================================================================

/**
 * Discover free models from OpenRouter
 */
async function discoverOpenRouterFreeModels(includeReasoning = true) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const response = await fetch('https://openrouter.ai/api/v1/models', {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!response.ok) return [];

    const data = await response.json();
    const models = data.data || [];

    // Filter for free models (pricing is "0")
    return models
      .filter(model => {
        const promptPrice = parseFloat(model.pricing?.prompt || '1');
        const completionPrice = parseFloat(model.pricing?.completion || '1');
        const isFree = promptPrice === 0 && completionPrice === 0;

        if (!isFree) return false;

        if (!includeReasoning) {
          // Filter out "think" models if reasoning is not requested
          const isThinkingModel = model.id.toLowerCase().includes('think') ||
                                 model.id.toLowerCase().includes('reason') ||
                                 model.id.toLowerCase().includes('deepseek-r1');
          if (isThinkingModel) return false;
        }

        return true;
      })
      .map(model => model.id)
      .sort();
  } catch (error) {
    console.error('Error discovering OpenRouter models:', error);
    return [];
  }
}

// API: Get free OpenRouter models
app.get('/api/ai-models/openrouter/free', async (req, res) => {
  try {
    const includeReasoning = req.query.reasoning === 'true';
    const models = await discoverOpenRouterFreeModels(includeReasoning);
    res.json(models);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Build door (TypeScript compilation)
app.post('/api/doors/:doorId/build', (req, res) => {
  try {
    const { doorId } = req.params;
    const doorPath = resolveDoorPath(doorId);

    if (!fs.existsSync(doorPath)) {
      return res.status(404).json({ error: 'Door not found' });
    }

    console.log(`[BUILD] Building door: ${doorId}`);

    const tsc = spawn('npx', ['tsc', '--noEmit'], {
      cwd: doorPath,
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    tsc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    tsc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    tsc.on('close', (code) => {
      const output = stdout + stderr;
      const errors = [];

      // Parse TypeScript errors
      // Format: filename(line,col): error TS####: message
      const errorRegex = /(.+?)\((\d+),(\d+)\):\s+error\s+TS\d+:\s+(.+)/g;
      let match;

      while ((match = errorRegex.exec(output)) !== null) {
        errors.push({
          file: path.basename(match[1]),
          line: parseInt(match[2]),
          column: parseInt(match[3]),
          message: match[4],
        });
      }

      if (code === 0) {
        console.log(`✓ Build successful: ${doorId}`);
        res.json({ success: true, errors: [] });
      } else {
        console.log(`✗ Build failed: ${doorId} (${errors.length} errors)`);
        res.json({ success: false, errors });
      }
    });
  } catch (error) {
    console.error('Error building door:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Format model ID for OpenRouter API
 */
function formatOpenRouterModel(model) {
  if (!model) return 'meta-llama/llama-4-maverick:free';
  
  // Strip :free suffix for the API call (it's metadata, not part of the model ID)
  let modelForApi = model.replace(/:free$/, '');

  // Capitalization mapping for models where providers expect specific casing
  const capitalizationMap = {
    'agentica-org/deepcoder-14b-preview': 'agentica-org/DeepCoder-14B-Preview',
  };

  // Apply capitalization fix if needed (case-insensitive lookup)
  const modelLower = modelForApi.toLowerCase();
  if (capitalizationMap[modelLower]) {
    modelForApi = capitalizationMap[modelLower];
  }
  
  return modelForApi;
}

// API: AI Prompt for Door Improvement
app.post('/api/ai-prompt', async (req, res) => {
  try {
    const { doorId, currentFile, buildErrors, prompt, apiKey, provider = 'openrouter', model } = req.body;

    if (!doorId || !prompt) {
      return res.status(400).json({ error: 'doorId and prompt are required' });
    }

    if (!apiKey && !process.env.OPENROUTER_API_KEY && !process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY) {
      return res.status(400).json({ error: 'API key is required' });
    }

    const targetDoorPath = resolveDoorPath(doorId);
    if (!fs.existsSync(targetDoorPath)) {
      return res.status(404).json({ error: 'Door not found' });
    }

    console.log(`[AI] AI prompt for ${doorId} (${provider}): ${prompt.substring(0, 50)}...`);

    // Build context for AI
    let context = `You are an expert TypeScript developer helping to improve a BBS door game for the AmiExpress SDK.

Door: ${doorId}
`;

    // Add current file context if available
    if (currentFile && currentFile.content) {
      context += `\nCurrent file: ${currentFile.path}
\`\`\`typescript
${currentFile.content}
\`\`\`
`;
    } else {
      // Load main index.ts file
      const indexPath = path.join(targetDoorPath, 'index.ts');
      if (fs.existsSync(indexPath)) {
        const indexContent = fs.readFileSync(indexPath, 'utf8');
        context += `\nMain file (index.ts):
\`\`\`typescript
${indexContent}
\`\`\`
`;
      }
    }

    // Add build errors if any
    if (buildErrors && buildErrors.length > 0) {
      context += `\nBuild Errors:
${buildErrors.map(e => `- ${e.file}:${e.line}: ${e.message}`).join('\n')}
`;
    }

    // Add package.json context
    const pkgPath = path.join(targetDoorPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      context += `\nPackage Info:
Name: ${pkg.name}
Description: ${pkg.description || 'N/A'}
`;
    }

    context += `\nUser Request: ${prompt}

Please provide:
1. A brief explanation of what you'll change (2-3 sentences)
2. The complete updated code for the file

Return your response in this JSON format:
{
  "explanation": "Brief explanation here",
  "code": "Complete updated code here"
}

Important:
- Return ONLY valid JSON, no markdown code blocks
- Include the COMPLETE file content, not just the changes
- Ensure the code is valid TypeScript
- Maintain the existing code style
- If fixing errors, explain what was wrong`;

    let aiMessage = '';

    if (provider === 'openrouter') {
      const effectiveKey = apiKey || process.env.OPENROUTER_API_KEY;
      const modelForApi = formatOpenRouterModel(model);
      
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${effectiveKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/amiexpress/sdk',
          'X-Title': 'AmiExpress SDK Door Editor',
        },
        body: JSON.stringify({
          model: modelForApi,
          messages: [
            {
              role: 'user',
              content: context,
            },
          ],
          temperature: 0.7,
          max_tokens: 4000,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        return res.status(500).json({ success: false, error: error.error?.message || 'OpenRouter API request failed' });
      }

      const aiResponse = await response.json();
      console.log(`[AI] OpenRouter response received:`, JSON.stringify(aiResponse).substring(0, 500));
      
      if (!aiResponse.choices || aiResponse.choices.length === 0) {
        console.error('[AI] OpenRouter returned no choices:', aiResponse);
        return res.status(500).json({
          success: false,
          error: 'AI returned no response choices. Try a different model.',
        });
      }
      
      aiMessage = aiResponse.choices?.[0]?.message?.content;
    } else if (provider === 'claude') {
      const effectiveKey = apiKey || process.env.ANTHROPIC_API_KEY;
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': effectiveKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: model || 'claude-3-5-sonnet-20241022',
          max_tokens: 4000,
          messages: [{ role: 'user', content: context }],
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        return res.status(500).json({ success: false, error: error.error?.message || 'Claude API request failed' });
      }

      const aiResponse = await response.json();
      aiMessage = aiResponse.content[0].text;
    } else if (provider === 'openai') {
      const effectiveKey = apiKey || process.env.OPENAI_API_KEY;
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${effectiveKey}`,
        },
        body: JSON.stringify({
          model: model || 'gpt-4o',
          messages: [{ role: 'user', content: context }],
          max_tokens: 4000,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('[AI] OpenAI error:', error);
        return res.status(500).json({ success: false, error: error.error?.message || 'OpenAI API request failed' });
      }

      const aiResponse = await response.json();
      console.log(`[AI] OpenAI response received:`, JSON.stringify(aiResponse).substring(0, 500));
      aiMessage = aiResponse.choices?.[0]?.message?.content;
    } else if (provider === 'gemini') {
      const effectiveKey = apiKey || process.env.GEMINI_API_KEY;
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-1.5-pro'}:generateContent?key=${effectiveKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: context }] }],
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('[AI] Gemini error:', error);
        return res.status(500).json({ success: false, error: error.error?.message || 'Gemini API request failed' });
      }

      const aiResponse = await response.json();
      console.log(`[AI] Gemini response received:`, JSON.stringify(aiResponse).substring(0, 500));
      aiMessage = aiResponse.candidates?.[0]?.content?.parts?.[0]?.text;
    }

    if (!aiMessage) {
      return res.status(500).json({
        success: false,
        error: 'No response from AI',
      });
    }

    // Parse AI response
    let parsedResponse;
    try {
      console.log(`[AI] Parsing response (first 200 chars): ${aiMessage.substring(0, 200).replace(/\n/g, ' ')}...`);
      
      // Robust JSON extraction
      const extractJson = (text) => {
        if (!text) return null;
        
        // 1. Strip thought blocks/reasoning if present
        let cleanedText = text.replace(/<(thought|reasoning)>[\s\S]*?<\/\1>/gi, '');
        
        // 2. Try to find JSON in markdown code blocks first
        const codeBlockMatch = cleanedText.match(/```(?:json)?\s*(\{[\s\S]*?code[\s\S]*?\})\s*```/i);
        
        if (codeBlockMatch) {
          try {
            return JSON.parse(codeBlockMatch[1]);
          } catch (e) {
            // Fall through
          }
        }
        
        // 3. Try to find any block that looks like our JSON structure (flexible key order)
        // This looks for a { ... "key" ... "key" ... } structure
        const jsonRegex = /\{\s*"(?:explanation|code)"[\s\S]*?"(?:explanation|code)"[\s\S]*?\}/i;
        const match = cleanedText.match(jsonRegex);
        
        if (match) {
          try {
            return JSON.parse(match[0]);
          } catch (e) {
            // Fall through
          }
        }
        
        // 4. Last resort: try greedy match
        const greedyMatch = cleanedText.match(/\{[\s\S]*\}/);
        if (greedyMatch) {
          try {
            return JSON.parse(greedyMatch[0]);
          } catch (e) {
            // Fall through
          }
        }
        
        // 5. Try parsing the whole thing
        try {
          return JSON.parse(cleanedText);
        } catch (e) {
          return null;
        }
      };

      parsedResponse = extractJson(aiMessage);
      
      if (!parsedResponse || !parsedResponse.code) {
        throw new Error('Could not find valid JSON with "code" key in AI response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response. Raw message:', aiMessage);
      console.error('Parse error:', parseError.message);
      return res.status(500).json({
        success: false,
        error: `Failed to parse AI response: ${parseError.message}. The AI might have returned invalid formatting. Please try again.`,
      });
    }

    // Build response
    const filePath = currentFile?.path || 'index.ts';
    const originalContent = currentFile?.content || (fs.existsSync(path.join(targetDoorPath, 'index.ts')) ? fs.readFileSync(path.join(targetDoorPath, 'index.ts'), 'utf8') : '');

    res.json({
      success: true,
      explanation: parsedResponse.explanation,
      filesToModify: [
        {
          path: filePath,
          originalContent: originalContent,
          suggestedContent: parsedResponse.code,
        },
      ],
    });

  } catch (error) {
    console.error('Error processing AI prompt:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process AI prompt',
    });
  }
});

// Temporary downloads directory
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

// Track downloads for auto-cleanup
const downloadTracking = new Map();

// API: Get door files (for archive file manager)
app.get('/api/doors/:doorId/files', async (req, res) => {
  try {
    const { doorId } = req.params;
    const { includeSource = 'true', includeAssets = 'true', includeDocs = 'true' } = req.query;

    const doorPath = resolveDoorPath(doorId);

    if (!fs.existsSync(doorPath)) {
      return res.status(404).json({ error: 'Door not found' });
    }

    const pkgPath = path.join(doorPath, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      return res.status(404).json({ error: 'package.json not found' });
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const doorDir = pkg.doorDir || doorId;

    const buildFileTree = (dirPath, relativePath = '') => {
      const files = [];
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const entryRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          if (['node_modules', '.git'].includes(entry.name)) {
            continue;
          }

          if (entry.name === 'dist' || entry.name === 'assets' || entry.name === 'data') {
            const children = buildFileTree(fullPath, entryRelativePath);
            if (children.length > 0) {
              files.push({
                id: `folder-${entryRelativePath}`,
                name: entry.name,
                type: 'folder',
                path: entryRelativePath,
                children,
              });
            }
            continue;
          }

          const children = buildFileTree(fullPath, entryRelativePath);
          if (children.length > 0) {
            files.push({
              id: `folder-${entryRelativePath}`,
              name: entry.name,
              type: 'folder',
              path: entryRelativePath,
              children,
            });
          }
          continue;
        }

        let shouldInclude = false;
        if (entry.name === 'package.json' || entry.name === 'package-lock.json') {
          shouldInclude = true;
        } else if (includeSource === 'true' && /\.(ts|js|d\.ts|map)$/i.test(entry.name)) {
          shouldInclude = true;
        } else if (includeAssets === 'true' && (fullPath.includes('/assets/') || fullPath.includes('/data/'))) {
          shouldInclude = true;
        } else if (includeDocs === 'true' && (entry.name.endsWith('.md') || entry.name.endsWith('.txt'))) {
          shouldInclude = true;
        } else if (entry.name === 'config.json') {
          shouldInclude = true;
        }

        if (shouldInclude) {
          const stats = fs.statSync(fullPath);
          files.push({
            id: `file-${entryRelativePath}`,
            name: entry.name,
            type: 'file',
            path: entryRelativePath,
            size: stats.size,
          });
        }
      }

      return files;
    };

    const doorTree = buildFileTree(doorPath);
    const fileTree = [
      {
        id: `folder-Commands`,
        name: 'Commands',
        type: 'folder',
        path: 'Commands',
        children: [
          {
            id: `folder-Commands/BBSCmd`,
            name: 'BBSCmd',
            type: 'folder',
            path: 'Commands/BBSCmd',
            children: [
              {
                id: `file-Commands/BBSCmd/${path.basename(infoPath)}`,
                name: path.basename(infoPath),
                type: 'file',
                path: `Commands/BBSCmd/${path.basename(infoPath)}`,
                size: fs.statSync(infoPath).size,
              },
            ],
          },
        ],
      },
      {
        id: `folder-Doors`,
        name: 'Doors',
        type: 'folder',
        path: 'Doors',
        children: [
          {
            id: `folder-Doors/${doorDir}`,
            name: doorDir,
            type: 'folder',
            path: `Doors/${doorDir}`,
            children: doorTree.map((node) => ({
              ...node,
              path: `Doors/${doorDir}/${node.path}`,
              id: `door-${node.id}`,
            })),
          },
        ],
      },
    ];

    res.json({
      doorId,
      files: fileTree,
    });

  } catch (error) {
    console.error('Error fetching door files:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Create release archive
app.post('/api/doors/:doorId/release', upload.array('extraFiles'), async (req, res) => {
  try {
    const { doorId } = req.params;

    // Parse options from formData
    const options = req.body.options ? JSON.parse(req.body.options) : req.body;
    const { format = 'zip', includeSource = true, includeAssets = true, includeDocs = true } = options;
    if (format !== 'zip') {
      return res.status(400).json({
        error: 'Only zip is supported for TypeScript door releases. Use LHA for native Amiga doors.'
      });
    }

    // Get uploaded files from multer
    const extraFiles = req.files || [];
    console.log(`[PACKAGE] Creating release with ${extraFiles.length} extra file(s)`);

    const doorPath = resolveDoorPath(doorId);

    if (!fs.existsSync(doorPath)) {
      return res.status(404).json({ error: 'Door not found' });
    }

    const pkgPath = path.join(doorPath, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      return res.status(404).json({ error: 'package.json not found' });
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const version = pkg.version || '1.0.0';
    const filename = `${doorId}-v${version}.${format}`;
    const outputPath = path.join(downloadsDir, filename);

    console.log(`[PACKAGE] Creating release: ${filename}`);

    if (format === 'zip') {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip();

      const findInfoFile = (startDir, command) => {
        const candidates = [
          path.join(startDir, 'Commands', 'BBSCmd'),
          path.join(startDir, '..', 'Commands', 'BBSCmd'),
          path.join(startDir, '..', '..', 'Commands', 'BBSCmd'),
        ];

        for (const candidate of candidates) {
          if (!fs.existsSync(candidate)) continue;
          const direct = path.join(candidate, `${command}.info`);
          if (fs.existsSync(direct)) {
            return direct;
          }
          const infoFiles = fs.readdirSync(candidate).filter((file) => file.toLowerCase().endsWith('.info'));
          if (infoFiles.length > 0) {
            return path.join(candidate, infoFiles[0]);
          }
        }

        return null;
      };

      const buildInfoContent = (params) => {
        const name = params.pkg?.doorMetadata?.name || params.pkg?.displayName || params.pkg?.name || params.doorDir;
        const description = params.pkg?.description || params.pkg?.doorMetadata?.description || '';
        const access = params.pkg?.accessLevel ?? params.pkg?.doorMetadata?.minSecLevel ?? 0;
        const doorType = params.pkg?.doorType || 'TS';
        const lines = [
          `BBSCMD=${params.command}`,
          `TYPE=${doorType}`,
          `LOCATION=Doors/${params.doorDir}`,
          name ? `NAME=${name}` : '',
          description ? `DESCRIPTION=${description}` : '',
          `ACCESS=${access}`,
          'MULTINODE=YES',
          'PRIORITY=SAME',
          '',
        ];
        return lines.filter(Boolean).join('\n');
      };

      const normalizePackageJsonForRelease = (input) => {
        const normalized = { ...input };
        const dependencies = { ...(input.dependencies || {}) };
        dependencies['@amiexpress/bbs-door-sdk'] = 'file:../../sdk';
        normalized.dependencies = dependencies;
        return normalized;
      };

      const normalizePackageLockForRelease = (input) => {
        if (!input || typeof input !== 'object') return input;
        const sdkSpec = 'file:../../sdk';
        if (input.packages && input.packages['']) {
          input.packages[''].dependencies = {
            ...(input.packages[''].dependencies || {}),
            '@amiexpress/bbs-door-sdk': sdkSpec,
          };
        }
        if (input.dependencies && input.dependencies['@amiexpress/bbs-door-sdk']) {
          input.dependencies['@amiexpress/bbs-door-sdk'] = {
            ...input.dependencies['@amiexpress/bbs-door-sdk'],
            version: sdkSpec,
            resolved: sdkSpec,
            link: true,
          };
        }
        if (input.packages && input.packages['node_modules/@amiexpress/bbs-door-sdk']) {
          input.packages['node_modules/@amiexpress/bbs-door-sdk'] = {
            ...input.packages['node_modules/@amiexpress/bbs-door-sdk'],
            version: sdkSpec,
            resolved: sdkSpec,
            link: true,
          };
        }
        return input;
      };

      const commandName = (pkg.bbsCommand || pkg.doorMetadata?.command || doorId)
        .toString()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
      const doorDir = pkg.doorDir || doorId;

      const infoPath = findInfoFile(doorPath, commandName);
      if (infoPath) {
        zip.addLocalFile(infoPath, 'Commands/BBSCmd', `${commandName}.info`);
      } else {
        const infoContent = buildInfoContent({ command: commandName, doorDir, pkg });
        zip.addFile(`Commands/BBSCmd/${commandName}.info`, Buffer.from(infoContent, 'utf-8'));
      }

      const addDirectory = (dirPath, zipPath = '') => {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          const zipFilePath = zipPath ? path.join(zipPath, entry.name) : entry.name;

          if (entry.isDirectory()) {
            if (['node_modules', '.git'].includes(entry.name)) {
              continue;
            }

            if (['dist', 'assets', 'data'].includes(entry.name)) {
              addDirectory(fullPath, zipFilePath);
              continue;
            }

            addDirectory(fullPath, zipFilePath);
            continue;
          }

          if (entry.name === 'package.json' || entry.name === 'package-lock.json') {
            continue;
          }

          if (entry.name === 'config.json') {
            zip.addLocalFile(fullPath, zipPath);
            continue;
          }

          if (includeSource && /\.(ts|js|d\.ts|map)$/i.test(entry.name)) {
            zip.addLocalFile(fullPath, zipPath);
            continue;
          }

          if (includeAssets && (fullPath.includes('/assets/') || fullPath.includes('/data/'))) {
            zip.addLocalFile(fullPath, zipPath);
            continue;
          }

          if (includeDocs && (entry.name.endsWith('.md') || entry.name.endsWith('.txt'))) {
            zip.addLocalFile(fullPath, zipPath);
          }
        }
      };

      addDirectory(doorPath, path.join('Doors', doorDir));

      const normalizedPackageJson = normalizePackageJsonForRelease(pkg);
      zip.addFile(
        `Doors/${doorDir}/package.json`,
        Buffer.from(JSON.stringify(normalizedPackageJson, null, 2), 'utf-8')
      );

      const lockPath = path.join(doorPath, 'package-lock.json');
      if (fs.existsSync(lockPath)) {
        try {
          const lockJson = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
          const normalizedLock = normalizePackageLockForRelease(lockJson);
          zip.addFile(
            `Doors/${doorDir}/package-lock.json`,
            Buffer.from(JSON.stringify(normalizedLock, null, 2), 'utf-8')
          );
        } catch {
          // Skip malformed lock files
        }
      }

      // Add extra uploaded files to root of archive
      if (extraFiles.length > 0) {
        console.log(`📎 Adding ${extraFiles.length} extra file(s) to archive`);
        extraFiles.forEach((file) => {
          console.log(`  + ${file.originalname} (${file.size} bytes)`);
          zip.addFile(file.originalname, file.buffer);
        });
      }

      // Generate FILE_ID.DIZ (BBS standard format)
      const generateFileDiz = () => {
        const lines = [];
        const title = `${pkg.name || doorId} v${version}`;

        // Center title (45 char width for FILE_ID.DIZ standard)
        const centerText = (text, width = 45) => {
          const padding = Math.max(0, Math.floor((width - text.length) / 2));
          return ' '.repeat(padding) + text;
        };

        const wordWrap = (text, width = 45) => {
          const words = text.split(' ');
          const result = [];
          let currentLine = '';
          for (const word of words) {
            if ((currentLine + ' ' + word).trim().length <= width) {
              currentLine += (currentLine ? ' ' : '') + word;
            } else {
              if (currentLine) result.push(currentLine);
              currentLine = word;
            }
          }
          if (currentLine) result.push(currentLine);
          return result;
        };

        lines.push(centerText(title));
        lines.push(centerText('─'.repeat(Math.min(title.length, 45))));
        lines.push('');

        // Description (word-wrapped to 45 chars)
        if (pkg.description) {
          lines.push(...wordWrap(pkg.description));
          lines.push('');
        }

        lines.push(`By: ${pkg.author || 'Unknown'}`);
        lines.push(`Category: ${pkg.category || 'BBS Door'}`);
        lines.push(`Released: ${new Date().toISOString().split('T')[0]}`);

        // Limit to 10 lines, 45 chars each (FILE_ID.DIZ standard)
        return lines.slice(0, 10).map(l => l.substring(0, 45)).join('\r\n');
      };

      zip.addFile('FILE_ID.DIZ', Buffer.from(generateFileDiz(), 'utf-8'));

      // Create README.TXT
      if (includeDocs) {
        const readmeContent = `${pkg.name || doorId} v${version}
${'='.repeat((pkg.name || doorId).length + version.length + 3)}

${pkg.description || 'BBS Door Game'}

INSTALLATION
------------
1. Extract the archive to your BBS root directory
2. Confirm the .info file is under Commands/BBSCmd/
3. Restart the BBS (or reload doors)
4. Configure menus as needed

REQUIREMENTS
------------
- Node.js 18 or higher
- Modern terminal with ANSI support
- Minimum 80x24 terminal size

AUTHOR
------
${pkg.author || 'Unknown'}

RELEASED
--------
${new Date().toISOString().split('T')[0]}

Made with AmiExpress BBS Door SDK
https://github.com/amiexpress/sdk
`;
        zip.addFile('README.TXT', Buffer.from(readmeContent, 'utf-8'));
      }

      // Write ZIP file
      zip.writeZip(outputPath);

      const stats = fs.statSync(outputPath);
      console.log(`✓ Release created: ${filename} (${stats.size} bytes)`);

      // Track for auto-cleanup (1 hour)
      downloadTracking.set(filename, {
        path: outputPath,
        created: Date.now(),
      });

      res.json({ filename, size: stats.size });
    } else {
      res.status(400).json({ error: 'Unsupported format. Only "zip" is supported' });
    }
  } catch (error) {
    console.error('Error creating release:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Download release archive
app.get('/downloads/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(downloadsDir, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    console.log(`⬇️  Downloading: ${filename}`);

    res.download(filePath, filename, (err) => {
      if (err) {
        console.error('Error downloading file:', err);
      } else {
        // Delete after successful download
        console.log(`🗑️  Cleaning up: ${filename}`);
        setTimeout(() => {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            downloadTracking.delete(filename);
          }
        }, 1000);
      }
    });
  } catch (error) {
    console.error('Error serving download:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// INSTALL/UNINSTALL DOOR TO BBS
// =============================================================================

/**
 * Get door install status - check if door is installed in main BBS
 */
app.get('/api/doors/:doorId/install-status', (req, res) => {
  try {
    const { doorId } = req.params;
    const sdkDoorPath = resolveDoorPath(doorId);

    // BBS doors directory (web/backend/src/doors)
    const bbsDoorsPath = path.join(__dirname, '../../../web/backend/src/doors', doorId);

    if (!fs.existsSync(sdkDoorPath)) {
      return res.status(404).json({ error: 'Door not found in SDK' });
    }

    const installed = fs.existsSync(bbsDoorsPath);

    res.json({ installed, doorId, bbsPath: bbsDoorsPath });
  } catch (error) {
    console.error('Error checking install status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Install door to main BBS
 */
app.post('/api/doors/:doorId/install', async (req, res) => {
  try {
    const { doorId } = req.params;
    const sdkDoorPath = resolveDoorPath(doorId);
    const bbsDoorsPath = path.join(__dirname, '../../../web/backend/src/doors', doorId);

    if (!fs.existsSync(sdkDoorPath)) {
      return res.status(404).json({ error: 'Door not found in SDK' });
    }

    if (fs.existsSync(bbsDoorsPath)) {
      return res.status(409).json({ error: 'Door already installed in BBS' });
    }

    console.log(`📥 Installing door to BBS: ${doorId}`);

    // Copy door directory recursively
    const copyRecursive = (src, dest) => {
      fs.mkdirSync(dest, { recursive: true });
      const entries = fs.readdirSync(src, { withFileTypes: true });

      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        // Skip node_modules, dist, and hidden files
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
          continue;
        }

        if (entry.isDirectory()) {
          copyRecursive(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    };

    copyRecursive(sdkDoorPath, bbsDoorsPath);

    console.log(`[OK] Door installed to BBS: ${doorId}`);

    // Hot-reload doors in BBS backend without restart
    console.log(`🔄 Hot-reloading BBS doors...`);
    try {
      const reloadResult = await new Promise((resolve, reject) => {
        const postData = JSON.stringify({});
        const options = {
          hostname: 'localhost',
          port: 3001,
          path: '/api/doors/reload',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          }
        };

        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode === 200) {
              resolve(JSON.parse(data));
            } else {
              reject(new Error(`Reload failed with status ${res.statusCode}: ${data}`));
            }
          });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
      });

      console.log(`[OK] Doors reloaded: ${reloadResult.message}`);

      res.json({
        success: true,
        message: `Door "${doorId}" installed and activated successfully (${reloadResult.doorsReloaded} doors loaded)`,
        path: bbsDoorsPath,
        reloaded: true,
        doorsReloaded: reloadResult.doorsReloaded
      });
    } catch (reloadError) {
      console.warn(`[WARNING]  Door installed but hot-reload failed:`, reloadError.message);
      console.warn(`   Backend restart required for door to be available`);

      res.json({
        success: true,
        message: `Door "${doorId}" installed but hot-reload failed. Restart BBS backend to activate.`,
        path: bbsDoorsPath,
        reloaded: false,
        reloadError: reloadError.message
      });
    }
  } catch (error) {
    console.error('Error installing door:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Uninstall door from main BBS
 */
app.delete('/api/doors/:doorId/install', (req, res) => {
  try {
    const { doorId } = req.params;
    const bbsDoorsPath = path.join(__dirname, '../../../web/backend/src/doors', doorId);

    if (!fs.existsSync(bbsDoorsPath)) {
      return res.status(404).json({ error: 'Door not installed in BBS' });
    }

    console.log(`📤 Uninstalling door from BBS: ${doorId}`);

    // Remove directory recursively
    const removeRecursive = (dir) => {
      if (fs.existsSync(dir)) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            removeRecursive(fullPath);
          } else {
            fs.unlinkSync(fullPath);
          }
        }
        fs.rmdirSync(dir);
      }
    };

    removeRecursive(bbsDoorsPath);

    console.log(`[OK] Door uninstalled from BBS: ${doorId}`);

    res.json({
      success: true,
      message: `Door "${doorId}" uninstalled from BBS successfully`
    });
  } catch (error) {
    console.error('Error uninstalling door:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// README/NFO FILE EDITOR
// =============================================================================

/**
 * Get .nfo file content for door
 */
app.get('/api/doors/:doorId/nfo', (req, res) => {
  try {
    const { doorId } = req.params;
    const doorPath = resolveDoorPath(doorId);

    if (!fs.existsSync(doorPath)) {
      return res.status(404).json({ error: 'Door not found' });
    }

    // Look for .nfo files
    const nfoFiles = fs.readdirSync(doorPath).filter(f => f.toLowerCase().endsWith('.nfo'));

    if (nfoFiles.length === 0) {
      // Return empty template if no .nfo file exists
      const doorName = doorId.toUpperCase();
      const titleLine = ' '.repeat(Math.floor((76 - doorName.length) / 2)) + doorName;
      const titlePadding = ' '.repeat(76 - titleLine.length);

      return res.json({
        exists: false,
        filename: `${doorId}.nfo`,
        content: `╔════════════════════════════════════════════════════════════════════════════╗
║                                                                            ║
║${titleLine}${titlePadding}║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝

[Description of your door here]

Features:
  * Feature 1
  * Feature 2
  * Feature 3

Installation:
  1. Install door files to your BBS
  2. Configure command in BBS menu
  3. Set appropriate user access levels

Author: [Your Name]
Version: 1.0.0
Released: ${new Date().toISOString().split('T')[0]}

═══════════════════════════════════════════════════════════════════════════════
`
      });
    }

    const nfoPath = path.join(doorPath, nfoFiles[0]);
    const content = fs.readFileSync(nfoPath, 'utf8');

    res.json({
      exists: true,
      filename: nfoFiles[0],
      content
    });
  } catch (error) {
    console.error('Error reading .nfo file:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Save .nfo file content for door
 */
app.post('/api/doors/:doorId/nfo', (req, res) => {
  try {
    const { doorId } = req.params;
    const { content, filename } = req.body;

    if (content === undefined) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const doorPath = resolveDoorPath(doorId);

    if (!fs.existsSync(doorPath)) {
      return res.status(404).json({ error: 'Door not found' });
    }

    const nfoFilename = filename || `${doorId}.nfo`;
    const nfoPath = path.join(doorPath, nfoFilename);

    fs.writeFileSync(nfoPath, content, 'utf8');
    console.log(`✓ Saved .nfo file: ${nfoFilename}`);

    res.json({ success: true, filename: nfoFilename });
  } catch (error) {
    console.error('Error saving .nfo file:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// FILE_ID.DIZ TEMPLATE EDITOR
// =============================================================================

/**
 * Get FILE_ID.DIZ content for door
 */
app.get('/api/doors/:doorId/file_id_diz', (req, res) => {
  try {
    const { doorId } = req.params;
    const doorPath = resolveDoorPath(doorId);

    if (!fs.existsSync(doorPath)) {
      return res.status(404).json({ error: 'Door not found' });
    }

    const dizPath = path.join(doorPath, 'FILE_ID.DIZ');

    if (!fs.existsSync(dizPath)) {
      // Load template from sdk/templates/FILE_ID.DIZ
      const pkgPath = path.join(doorPath, 'package.json');
      let pkg = {};
      if (fs.existsSync(pkgPath)) {
        pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      }

      const name = pkg.name || doorId;
      const version = pkg.version || '1.0.0';
      const title = `${name} v${version}`;

      // Center title within 40 chars (width of placeholder)
      const centerText = (text, width = 40) => {
        const totalPadding = width - text.length;
        const leftPad = Math.max(0, Math.ceil(totalPadding / 2));
        const rightPad = Math.max(0, totalPadding - leftPad);
        return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
      };

      // Try to load the template file
      const templatePath = path.join(__dirname, '..', '..', 'templates', 'FILE_ID.DIZ');
      let template;

      if (fs.existsSync(templatePath)) {
        // Load template and replace placeholder with centered title
        template = fs.readFileSync(templatePath, 'utf8');
        const centeredTitle = centerText(title, 40);
        template = template.replace(/\*{40}/, centeredTitle);
      } else {
        // Fallback to simple template if file doesn't exist
        const simpleCenter = (text, width = 45) => {
          const padding = Math.max(0, Math.floor((width - text.length) / 2));
          return ' '.repeat(padding) + text;
        };

        template = `${simpleCenter(title)}
${simpleCenter('─'.repeat(Math.min(title.length, 45)))}

${pkg.description || 'BBS Door Game'}

By: ${pkg.author || 'Unknown'}
Category: ${pkg.category || 'BBS Door'}
Released: ${new Date().toISOString().split('T')[0]}

Made with AmiExpress SDK`;
      }

      return res.json({
        exists: false,
        content: template
      });
    }

    const content = fs.readFileSync(dizPath, 'utf8');

    res.json({
      exists: true,
      content
    });
  } catch (error) {
    console.error('Error reading FILE_ID.DIZ:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Save FILE_ID.DIZ content for door
 */
app.post('/api/doors/:doorId/file_id_diz', (req, res) => {
  try {
    const { doorId } = req.params;
    const { content } = req.body;

    if (content === undefined) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const doorPath = resolveDoorPath(doorId);

    if (!fs.existsSync(doorPath)) {
      return res.status(404).json({ error: 'Door not found' });
    }

    // FILE_ID.DIZ should be max 10 lines, 45 chars each (BBS standard)
    const lines = content.split('\n').slice(0, 10);
    const formattedContent = lines.map(l => l.substring(0, 45)).join('\r\n');

    const dizPath = path.join(doorPath, 'FILE_ID.DIZ');
    fs.writeFileSync(dizPath, formattedContent, 'utf8');
    console.log(`✓ Saved FILE_ID.DIZ`);

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving FILE_ID.DIZ:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Upload FILE_ID.DIZ template file
 */
app.post('/api/doors/:doorId/file_id_diz/upload', (req, res) => {
  try {
    const { doorId } = req.params;
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const doorPath = resolveDoorPath(doorId);

    if (!fs.existsSync(doorPath)) {
      return res.status(404).json({ error: 'Door not found' });
    }

    // FILE_ID.DIZ should be max 10 lines, 45 chars each (BBS standard)
    const lines = content.split('\n').slice(0, 10);
    const formattedContent = lines.map(l => l.substring(0, 45)).join('\r\n');

    const dizPath = path.join(doorPath, 'FILE_ID.DIZ');
    fs.writeFileSync(dizPath, formattedContent, 'utf8');
    console.log(`✓ Uploaded FILE_ID.DIZ template`);

    res.json({ success: true, message: 'FILE_ID.DIZ template uploaded successfully' });
  } catch (error) {
    console.error('Error uploading FILE_ID.DIZ:', error);
    res.status(500).json({ error: error.message });
  }
});

// API: Generate game with Claude AI
app.post('/api/games/generate', async (req, res) => {
  try {
    const { name, description, bbsCommand, type, features, apiKey } = req.body;

    if (!name || !description) {
      return res.status(400).json({ error: 'Name and description are required' });
    }

    console.log(`[GAME] Generating game: ${name}`);

    // Use provided API key or server environment variable
    const claudeApiKey = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!claudeApiKey) {
      return res.status(400).json({
        error: 'No Claude AI API key provided. Either supply your own key or configure ANTHROPIC_API_KEY on the server.'
      });
    }

    // Create game prompt
    const prompt = `You are an expert game developer creating a BBS door game using the AmiExpress SDK.

Create a ${type} game called "${name}".

Description: ${description}

Features to include:
${features.map(f => `- ${f}`).join('\n')}

Generate COMPLETE, production-ready TypeScript code for this game using the AmiExpress BBS Door SDK.

The code must:
1. Import from '@amiexpress/bbs-door-sdk'
2. Use the Door, GraphicsEngine, and other SDK components
3. Implement all requested features
4. Include proper ANSI graphics and colors (no emojis, use * X ! - + characters)
5. Handle user input with arrow keys and common keys
6. Be playable and fun
7. Follow BBS aesthetic (80x24 terminal, retro style)

Return ONLY valid TypeScript code with no explanations. The code should be complete and ready to run.`;

    // Call Claude AI API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Claude AI API request failed');
    }

    const aiResponse = await response.json();
    let gameCode = aiResponse.content[0].text;

    // Clean code: remove thought blocks and markdown code blocks
    gameCode = gameCode.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
    gameCode = gameCode.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '').trim();
    gameCode = gameCode.replace(/```typescript\n?/g, '').replace(/```\n?/g, '').trim();

    // Create door ID (sanitized name)
    const doorId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const targetDoorPath = resolveDoorPath(doorId);

    // Create door directory
    if (fs.existsSync(targetDoorPath)) {
      return res.status(409).json({ error: `A game with ID "${doorId}" already exists` });
    }

    fs.mkdirSync(targetDoorPath, { recursive: true });

    // Create package.json
    const packageJson = {
      name: `@amiexpress/door-${doorId}`,
      version: '1.0.0',
      description: description,
      bbsCommand: bbsCommand || doorId.toUpperCase().replace(/-/g, '_'),
      category: type || 'Game',
      main: 'index.ts',
      scripts: {
        start: 'ts-node index.ts',
        build: 'tsc',
      },
      dependencies: {
        '@amiexpress/bbs-door-sdk': 'file:../../',
      },
      devDependencies: {
        '@types/node': '^20.0.0',
        'typescript': '^5.0.0',
        'ts-node': '^10.9.0',
      },
      author: 'AI Game Wizard',
      license: 'MIT',
    };

    fs.writeFileSync(
      path.join(targetDoorPath, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );

    // Create tsconfig.json
    const tsconfig = {
      compilerOptions: {
        target: 'ES2020',
        module: 'commonjs',
        lib: ['ES2020'],
        outDir: './dist',
        rootDir: './',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
        declaration: true,
      },
      include: ['*.ts'],
      exclude: ['node_modules', 'dist'],
    };

    fs.writeFileSync(
      path.join(targetDoorPath, 'tsconfig.json'),
      JSON.stringify(tsconfig, null, 2)
    );

    // Create index.ts with generated code
    fs.writeFileSync(path.join(targetDoorPath, 'index.ts'), gameCode);

    // Create README.md
    const readme = `# ${name}

${description}

## Game Type
${type}

## Features
${features.map(f => `- ${f}`).join('\n')}

## How to Run

\`\`\`bash
npm install
npm start
\`\`\`

## How to Build

\`\`\`bash
npm run build
\`\`\`

---
*Generated with AI Game Wizard*
`;

    fs.writeFileSync(path.join(targetDoorPath, 'README.md'), readme);

    // Install dependencies
    console.log(`[PACKAGE] Installing dependencies for ${doorId}...`);
    execSync('npm install', {
      cwd: targetDoorPath,
      stdio: 'ignore',
    });

    console.log(`[OK] Game created: ${doorId}`);

    res.json({
      success: true,
      doorId,
      message: `Game "${name}" created successfully!`,
    });
  } catch (error) {
    console.error('Error generating game:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate game',
      details: error.stack,
    });
  }
});

// API: Generate game with streaming and multi-AI support
app.post('/api/games/generate-stream', async (req, res) => {
  const requestStartTime = Date.now();
  console.log(`\n========== /api/games/generate-stream REQUEST RECEIVED ==========`);
  console.log(`[API] Timestamp: ${new Date().toISOString()}`);

  try {
    const { name, description, bbsCommand, type, features, provider = 'openrouter', model, apiKey, qualityMode = 'balanced' } = req.body;

    console.log(`[API] Request params:`, { name, provider, model, qualityMode, hasApiKey: !!apiKey });

    if (!name || !description) {
      console.error(`[API] Missing required fields`);
      return res.status(400).json({ error: 'Name and description are required' });
    }

    console.log(`[GAME] Generating game: ${name} (${provider}/${model})`);

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    console.log(`[API] SSE headers set`);

    const sendProgress = (progress, phase) => {
      res.write(`data: ${JSON.stringify({ type: 'progress', progress, phase })}\n\n`);
    };

    const sendCodeChunk = (chunk) => {
      res.write(`data: ${JSON.stringify({ type: 'code_chunk', chunk })}\n\n`);
    };

    const sendComplete = (doorId) => {
      res.write(`data: ${JSON.stringify({ type: 'complete', doorId })}\n\n`);
      res.end();
    };

    const sendError = (error) => {
      res.write(`data: ${JSON.stringify({ type: 'error', error })}\n\n`);
      res.end();
    };

    sendProgress(10, 'Preparing request...');

    // Get API key
    const keys = {
      claude: apiKey || process.env.ANTHROPIC_API_KEY,
      openai: apiKey || process.env.OPENAI_API_KEY,
      gemini: apiKey || process.env.GEMINI_API_KEY,
      openrouter: apiKey || process.env.OPENROUTER_API_KEY,
    };

    const providerKey = keys[provider];
    if (!providerKey) {
      return sendError(`No API key for ${provider}. Configure in Settings or set environment variable.`);
    }

    // Create prompt
    const maxTokens = qualityMode === 'fast' ? 4000 : qualityMode === 'best' ? 12000 : 8000;
    const prompt = `You are an expert game developer creating a BBS door game using the AmiExpress SDK.

Create a ${type} game called "${name}".

Description: ${description}

Features to include:
${features.map(f => `- ${f}`).join('\n')}

Generate COMPLETE, production-ready TypeScript code for this game using the AmiExpress BBS Door SDK.

The code must:
1. Import from '@amiexpress/bbs-door-sdk'
2. Use the Door class and SDK components
3. Implement all requested features
4. Include proper ANSI graphics and colors (no emojis, use * X ! - + characters)
5. Handle user input with arrow keys and common keys
6. Be playable and fun
7. Follow BBS aesthetic (80x24 terminal, retro style)
8. Include comments explaining key sections

Return ONLY valid TypeScript code with no explanations before or after.`;

    sendProgress(20, `Calling ${provider} AI...`);

    let gameCode = '';

    // Call appropriate AI provider
    if (provider === 'claude') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': providerKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: model || 'claude-sonnet-4-20250514',
          max_tokens: maxTokens,
          stream: true,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        return sendError(error.error?.message || 'Claude API request failed');
      }

      sendProgress(40, 'Generating code...');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'content_block_delta' && data.delta?.text) {
                const text = data.delta.text;
                gameCode += text;
                sendCodeChunk(text);
              }
            } catch (e) {
              // Ignore JSON parse errors
            }
          }
        }
      }

    } else if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${providerKey}`,
        },
        body: JSON.stringify({
          model: model || 'gpt-4-turbo',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
          stream: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        return sendError(error.error?.message || 'OpenAI API request failed');
      }

      sendProgress(40, 'Generating code...');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') break;

            try {
              const parsed = JSON.parse(data);
              const text = parsed.choices?.[0]?.delta?.content;
              if (text) {
                gameCode += text;
                sendCodeChunk(text);
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }

    } else if (provider === 'gemini') {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-2.0-flash-exp'}:streamGenerateContent?key=${providerKey}&alt=sse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        return sendError(error.error?.message || 'Gemini API request failed');
      }

      sendProgress(40, 'Generating code...');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                gameCode += text;
                sendCodeChunk(text);
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }

    } else if (provider === 'openrouter') {
      console.log(`[OpenRouter] ========== Starting OpenRouter Request ==========`);
      console.log(`[OpenRouter] Model (raw): ${model}`);

      const modelForApi = formatOpenRouterModel(model);

      console.log(`[OpenRouter] Model (for API): ${modelForApi}`);
      console.log(`[OpenRouter] API key present: ${!!providerKey}`);
      console.log(`[OpenRouter] API key length: ${providerKey ? providerKey.length : 0}`);
      console.log(`[OpenRouter] Max tokens: ${maxTokens}`);
      console.log(`[OpenRouter] About to make fetch request...`);

      // Add timeout to prevent hanging (reduced to 30 seconds for faster debugging)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.error('[OpenRouter] ⏰ Request timeout after 30 seconds');
        controller.abort();
      }, 30000); // 30 second timeout

      let response;
      try {
        console.log(`[OpenRouter] [START] Initiating fetch to https://openrouter.ai/api/v1/chat/completions...`);
        const fetchStartTime = Date.now();

        response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${providerKey}`,
            'HTTP-Referer': 'https://github.com/amiexpress/sdk',
            'X-Title': 'AmiExpress BBS Door SDK',
          },
          body: JSON.stringify({
            model: modelForApi,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: maxTokens,
            stream: true,
          }),
          signal: controller.signal,
        });

        const fetchDuration = Date.now() - fetchStartTime;
        console.log(`[OpenRouter] [OK] Fetch completed in ${fetchDuration}ms`);
        clearTimeout(timeoutId);
      } catch (error) {
        const fetchDuration = Date.now() - fetchStartTime;
        clearTimeout(timeoutId);
        console.error(`[OpenRouter] [ERROR] Fetch error after ${fetchDuration}ms:`, error);
        console.error(`[OpenRouter] Error name: ${error.name}`);
        console.error(`[OpenRouter] Error message: ${error.message}`);
        console.error(`[OpenRouter] Error stack:`, error.stack);

        if (error.name === 'AbortError') {
          return sendError('OpenRouter API request timed out after 30 seconds. The service may be slow or unavailable. Please try again or select a different model.');
        }
        return sendError(`OpenRouter connection failed: ${error.message}. Check your network connection and API key.`);
      }

      console.log(`[OpenRouter] Response status: ${response.status}`);
      console.log(`[OpenRouter] Response ok: ${response.ok}`);
      console.log(`[OpenRouter] Response has body: ${!!response.body}`);

      if (!response.ok) {
        let errorMessage = 'OpenRouter API request failed';
        try {
          const error = await response.json();
          console.log(`[OpenRouter] Error response:`, error);
          errorMessage = error.error?.message || error.message || errorMessage;

          // Provide specific error messages
          if (response.status === 401) {
            errorMessage = 'Invalid OpenRouter API key. Get your free key at https://openrouter.ai/keys';
          } else if (response.status === 402) {
            errorMessage = 'This model requires credits. Please select a free model or add credits to your OpenRouter account.';
          } else if (response.status === 403) {
            // Check if this is a key limit error
            const isKeyLimitError = errorMessage.toLowerCase().includes('key limit') ||
                                   errorMessage.toLowerCase().includes('limit exceeded');

            if (isKeyLimitError) {
              errorMessage = 'OpenRouter API key limit exceeded. Your API key has reached its usage limit. ' +
                           'To continue using OpenRouter: ' +
                           '1. Go to https://openrouter.ai/settings/keys to manage your API key limits, ' +
                           '2. Add credits to your account at https://openrouter.ai/settings/credits, or ' +
                           '3. Wait for your limit to reset (limits reset monthly). ' +
                           'Alternatively, try a different AI provider (Claude, OpenAI, or Gemini) from the provider dropdown.';
            } else {
              errorMessage = `Access forbidden (403): ${errorMessage}. Check your API key permissions at https://openrouter.ai/settings/keys`;
            }
          } else if (response.status === 429) {
            errorMessage = 'Rate limit exceeded. Please wait a few minutes and try again.';
          } else if (response.status === 404) {
            // Check if this is a data policy error (free models require training opt-in)
            const isDataPolicyError = errorMessage.toLowerCase().includes('data policy') ||
                                     errorMessage.toLowerCase().includes('paid model training');

            if (isDataPolicyError) {
              // Determine which setting is needed based on the error message
              const needsPaidEndpoints = errorMessage.toLowerCase().includes('paid model training');

              if (needsPaidEndpoints) {
                errorMessage = 'This model requires enabling "paid endpoints" training in your OpenRouter privacy settings. ' +
                             'Go to https://openrouter.ai/settings/privacy and check "Enable paid endpoints that may train on inputs". ' +
                             'Note: Some models with ":free" suffix still require this setting. ' +
                             'Alternatively, try a different free model from the dropdown.';
              } else {
                errorMessage = 'This model requires enabling training in your OpenRouter privacy settings. ' +
                             'Go to https://openrouter.ai/settings/privacy and enable the appropriate training options. ' +
                             'For free models: check "Enable free endpoints that may train on inputs". ' +
                             'For paid models: check "Enable paid endpoints that may train on inputs".';
              }
            } else if (error.error?.metadata?.raw?.includes('model not found')) {
              // Extract the model name the provider expected
              const expectedModel = error.error?.metadata?.raw?.match(/"model not found: ([^"]+)"/)?.[1];
              errorMessage = `Model not found. OpenRouter API tried: "${modelForApi}". `;
              if (expectedModel && expectedModel !== modelForApi) {
                errorMessage += `Provider expects different capitalization: "${expectedModel}". `;
              }
              errorMessage += 'Try selecting a different model from the dropdown.';
            } else {
              // Generic 404 error
              errorMessage = `Model or endpoint not found: ${modelForApi}. The model may have been removed or renamed. Try selecting a different model.`;
            }
          } else if (response.status === 400 && error.error?.message?.includes('model')) {
            errorMessage = `Model not found: ${modelForApi}. The model may no longer be available or the name changed.`;
          }
        } catch (e) {
          console.error(`[OpenRouter] Failed to parse error response:`, e);
          errorMessage = `OpenRouter error: ${response.status} ${response.statusText}`;
        }
        return sendError(errorMessage);
      }

      // Verify response.body exists
      if (!response.body) {
        console.error('[OpenRouter] Response body is null or undefined');
        return sendError('OpenRouter returned an empty response. Please try again or select a different model.');
      }

      sendProgress(40, 'Generating code...');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        console.log('[OpenRouter] Starting to read stream...');
        let chunkCount = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log(`[OpenRouter] Stream complete. Received ${chunkCount} chunks`);
            break;
          }

          chunkCount++;
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              if (data === '[DONE]') {
                console.log('[OpenRouter] Received [DONE] signal');
                break;
              }

              try {
                const parsed = JSON.parse(data);
                const text = parsed.choices?.[0]?.delta?.content;
                if (text) {
                  gameCode += text;
                  sendCodeChunk(text);
                }
              } catch (e) {
                // Ignore JSON parse errors for incomplete chunks
                if (data && data.length > 0 && !data.startsWith('{')) {
                  console.log(`[OpenRouter] Skipping non-JSON line: ${data.substring(0, 50)}`);
                }
              }
            }
          }
        }

        // Verify we got some code
        if (!gameCode || gameCode.trim().length === 0) {
          console.error('[OpenRouter] No code generated');
          return sendError('OpenRouter did not generate any code. The model may not support this request. Please try a different model.');
        }

        console.log(`[OpenRouter] Generated ${gameCode.length} characters of code`);
      } catch (streamError) {
        console.error('[OpenRouter] Stream reading error:', streamError);
        return sendError(`Error reading OpenRouter response: ${streamError.message}`);
      }
    }

    sendProgress(60, 'Creating project structure...');

    // Clean code: remove thought blocks and markdown code blocks
    gameCode = gameCode.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
    gameCode = gameCode.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '').trim();
    gameCode = gameCode.replace(/```typescript\n?/g, '').replace(/```\n?/g, '').trim();

    // Create door ID
    const doorId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const newGamePath = resolveDoorPath(doorId);

    if (fs.existsSync(newGamePath)) {
      return sendError(`A game with ID "${doorId}" already exists`);
    }

    fs.mkdirSync(newGamePath, { recursive: true });

    sendProgress(70, 'Creating package files...');

    // Create package.json
    const packageJson = {
      name: `@amiexpress/door-${doorId}`,
      version: '1.0.0',
      description: description,
      bbsCommand: bbsCommand || doorId.toUpperCase().replace(/-/g, '_'),
      category: type || 'Game',
      main: 'index.ts',
      scripts: { start: 'ts-node index.ts', build: 'tsc' },
      dependencies: { '@amiexpress/bbs-door-sdk': 'file:../../' },
      devDependencies: {
        '@types/node': '^20.0.0',
        'typescript': '^5.0.0',
        'ts-node': '^10.9.0',
      },
      author: `AI Game Wizard (${provider})`,
      license: 'MIT',
    };

    fs.writeFileSync(path.join(newGamePath, 'package.json'), JSON.stringify(packageJson, null, 2));

    // Create tsconfig.json
    const tsconfig = {
      compilerOptions: {
        target: 'ES2020',
        module: 'commonjs',
        lib: ['ES2020'],
        outDir: './dist',
        rootDir: './',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
        declaration: true,
      },
      include: ['*.ts'],
      exclude: ['node_modules', 'dist'],
    };

    fs.writeFileSync(path.join(newGamePath, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));

    // Create index.ts
    fs.writeFileSync(path.join(newGamePath, 'index.ts'), gameCode);

    // Create README.md
    const readme = `# ${name}

${description}

## Game Type
${type}

## Features
${features.map(f => `- ${f}`).join('\n')}

## AI Provider
Generated with **${provider}** (${model || 'default model'})

## How to Run

\`\`\`bash
npm install
npm start
\`\`\`

## How to Build

\`\`\`bash
npm run build
\`\`\`

---
*Generated with AI Game Wizard - ${new Date().toISOString()}*
`;

    fs.writeFileSync(path.join(newGamePath, 'README.md'), readme);

    sendProgress(80, 'Installing dependencies...');

    // Install dependencies
    console.log(`[PACKAGE] Installing dependencies for ${doorId}...`);
    execSync('npm install', { cwd: newGamePath, stdio: 'ignore' });

    sendProgress(100, 'Complete!');
    console.log(`[OK] Game created: ${doorId}`);

    sendComplete(doorId);

  } catch (error) {
    console.error('Error generating game:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    res.end();
  }
});

// API: Save generated game code
app.post('/api/games/save', async (req, res) => {
  try {
    const { name, description, type, features, code } = req.body;

    if (!name || !code) {
      return res.status(400).json({ error: 'Name and code are required' });
    }

    const doorId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const targetDoorPath = resolveDoorPath(doorId);

    if (fs.existsSync(targetDoorPath)) {
      return res.status(409).json({ error: `A game with ID "${doorId}" already exists` });
    }

    fs.mkdirSync(targetDoorPath, { recursive: true });

    // Create all files
    const packageJson = {
      name: `@amiexpress/door-${doorId}`,
      version: '1.0.0',
      description: description || name,
      main: 'index.ts',
      scripts: { start: 'ts-node index.ts', build: 'tsc' },
      dependencies: { '@amiexpress/bbs-door-sdk': 'file:../../' },
      devDependencies: {
        '@types/node': '^20.0.0',
        'typescript': '^5.0.0',
        'ts-node': '^10.9.0',
      },
      author: 'AI Game Wizard',
      license: 'MIT',
    };

    fs.writeFileSync(path.join(targetDoorPath, 'package.json'), JSON.stringify(packageJson, null, 2));

    const tsconfig = {
      compilerOptions: {
        target: 'ES2020',
        module: 'commonjs',
        lib: ['ES2020'],
        outDir: './dist',
        rootDir: './',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
        declaration: true,
      },
      include: ['*.ts'],
      exclude: ['node_modules', 'dist'],
    };

    fs.writeFileSync(path.join(targetDoorPath, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));
    fs.writeFileSync(path.join(targetDoorPath, 'index.ts'), code);

    const readme = `# ${name}

${description || 'AI-generated BBS door game'}

## Game Type
${type || 'Custom'}

## Features
${(features || []).map(f => `- ${f}`).join('\n')}

---
*Generated with AI Game Wizard*
`;

    fs.writeFileSync(path.join(targetDoorPath, 'README.md'), readme);

    // Install dependencies
    execSync('npm install', { cwd: targetDoorPath, stdio: 'ignore' });

    console.log(`[OK] Game saved: ${doorId}`);

    res.json({
      success: true,
      doorId,
      message: `Game "${name}" saved successfully!`,
    });

  } catch (error) {
    console.error('Error saving game:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// DOOR IMPORT - Import door sources from ZIP/LHA/LZX/Directory
// =============================================================================

/**
 * Import door sources from archive or directory
 * Supports: ZIP, LHA, LZX formats
 */
app.post('/api/doors/import', async (req, res) => {
  try {
    const { fileData, fileName, fileType } = req.body;

    if (!fileData || !fileName) {
      return res.status(400).json({ error: 'Missing file data or file name' });
    }

    console.log(`[PACKAGE] Importing door from: ${fileName} (${fileType})`);

    // Create temp directory for extraction
    const tempDir = path.join(__dirname, 'temp-import');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Decode base64 file data
    const fileBuffer = Buffer.from(fileData.split(',')[1] || fileData, 'base64');
    const tempFilePath = path.join(tempDir, fileName);
    fs.writeFileSync(tempFilePath, fileBuffer);

    let extractedDir = null;

    // Extract based on file type
    if (fileType === 'application/zip' || fileName.endsWith('.zip')) {
      console.log('[PACKAGE] Extracting ZIP archive...');
      const zip = new AdmZip(tempFilePath);
      const extractPath = path.join(tempDir, 'extracted');
      zip.extractAllTo(extractPath, true);
      extractedDir = extractPath;
    } else if (fileType === 'application/x-lzh-compressed' || fileName.endsWith('.lha') || fileName.endsWith('.lzh')) {
      console.log('[PACKAGE] Extracting LHA archive...');
      // Try to use unlha command if available
      try {
        const extractPath = path.join(tempDir, 'extracted');
        fs.mkdirSync(extractPath, { recursive: true });
        execSync(`unlha x "${tempFilePath}" "${extractPath}"`, { stdio: 'pipe' });
        extractedDir = extractPath;
      } catch (err) {
        // Clean up temp files
        fs.rmSync(tempDir, { recursive: true, force: true });
        return res.status(400).json({
          error: 'LHA extraction failed. Please install "unlha" command or use ZIP format instead.',
          details: err.message
        });
      }
    } else if (fileType === 'application/x-lzx' || fileName.endsWith('.lzx')) {
      console.log('[PACKAGE] Extracting LZX archive...');
      // Try to use unlzx command if available
      try {
        const extractPath = path.join(tempDir, 'extracted');
        fs.mkdirSync(extractPath, { recursive: true });
        execSync(`unlzx -x "${tempFilePath}" "${extractPath}"`, { stdio: 'pipe' });
        extractedDir = extractPath;
      } catch (err) {
        // Clean up temp files
        fs.rmSync(tempDir, { recursive: true, force: true });
        return res.status(400).json({
          error: 'LZX extraction failed. Please install "unlzx" command or use ZIP format instead.',
          details: err.message
        });
      }
    } else {
      // Clean up temp files
      fs.rmSync(tempDir, { recursive: true, force: true });
      return res.status(400).json({
        error: 'Unsupported file type. Please use ZIP, LHA, or LZX format.'
      });
    }

    // Find the door directory (should contain package.json)
    let doorSourceDir = null;
    const findDoorDirectory = (dir) => {
      const entries = fs.readdirSync(dir);

      // Check if current directory has package.json
      if (entries.includes('package.json')) {
        return dir;
      }

      // If only one subdirectory, check it (common case: archive contains single folder)
      const subdirs = entries.filter(name => {
        const fullPath = path.join(dir, name);
        return fs.statSync(fullPath).isDirectory() && !name.startsWith('.');
      });

      if (subdirs.length === 1) {
        return findDoorDirectory(path.join(dir, subdirs[0]));
      }

      // Multiple subdirectories - look for one with package.json
      for (const subdir of subdirs) {
        const fullPath = path.join(dir, subdir);
        const subEntries = fs.readdirSync(fullPath);
        if (subEntries.includes('package.json')) {
          return fullPath;
        }
      }

      return null;
    };

    doorSourceDir = findDoorDirectory(extractedDir);

    if (!doorSourceDir) {
      // Clean up temp files
      fs.rmSync(tempDir, { recursive: true, force: true });
      return res.status(400).json({
        error: 'Invalid door structure. Archive must contain a directory with package.json file.'
      });
    }

    // Validate door structure
    const requiredFiles = ['package.json'];
    const missingFiles = requiredFiles.filter(file => !fs.existsSync(path.join(doorSourceDir, file)));

    if (missingFiles.length > 0) {
      // Clean up temp files
      fs.rmSync(tempDir, { recursive: true, force: true });
      return res.status(400).json({
        error: `Invalid door structure. Missing required files: ${missingFiles.join(', ')}`
      });
    }

    // Read package.json to get door name
    const pkgPath = path.join(doorSourceDir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    let doorId = pkg.name || path.basename(doorSourceDir);

    // Sanitize door ID (remove @ prefix, convert slashes to hyphens)
    doorId = doorId.replace(/^@[^/]+\//, '').replace(/\//g, '-').toLowerCase();

    // Check if door already exists - import to BBS doors directory
    const targetDir = path.join(BBS_DOORS_DIR, doorId);

    if (fs.existsSync(targetDir)) {
      // Clean up temp files
      fs.rmSync(tempDir, { recursive: true, force: true });
      return res.status(409).json({
        error: `Door "${doorId}" already exists in SDK. Please remove it first or rename your door.`,
        doorId
      });
    }

    // Copy door to examples directory
    console.log(`[PACKAGE] Installing door to: ${targetDir}`);

    const copyRecursive = (src, dest) => {
      const stat = fs.statSync(src);
      if (stat.isDirectory()) {
        if (!fs.existsSync(dest)) {
          fs.mkdirSync(dest, { recursive: true });
        }
        fs.readdirSync(src).forEach(item => {
          copyRecursive(path.join(src, item), path.join(dest, item));
        });
      } else {
        fs.copyFileSync(src, dest);
      }
    };

    copyRecursive(doorSourceDir, targetDir);

    // Clean up temp files
    fs.rmSync(tempDir, { recursive: true, force: true });

    console.log(`[OK] Door "${doorId}" imported successfully!`);

    res.json({
      success: true,
      doorId,
      name: pkg.name || doorId,
      version: pkg.version || '1.0.0',
      message: `Door "${doorId}" imported successfully!`
    });

  } catch (error) {
    console.error('Error importing door:', error);

    // Clean up temp files on error
    const tempDir = path.join(__dirname, 'temp-import');
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.error('Error cleaning up temp files:', cleanupErr);
      }
    }

    res.status(500).json({ error: error.message });
  }
});

// API: Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    server: 'AmiExpress Preview Server',
    version: '1.0.0',
    uptime: process.uptime(),
    connections: clients.size,
  });
});

// Cleanup old downloads every hour
setInterval(() => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;

  downloadTracking.forEach((info, filename) => {
    if (now - info.created > oneHour) {
      console.log(`🗑️  Cleaning up old download: ${filename}`);
      if (fs.existsSync(info.path)) {
        fs.unlinkSync(info.path);
      }
      downloadTracking.delete(filename);
    }
  });
}, 60 * 60 * 1000); // Run every hour

// WebSocket connections
const clients = new Map();

/**
 * Helper to log to both console and browser terminal
 *
 * Only sends logs to browser and console if DEBUG_OUTPUT is enabled (or if it's an error)
 * This ensures clean door output in normal mode
 */
function debugLog(clientOrId, message, level = 'log') {
  // Log to console if DEBUG_OUTPUT is enabled or if it's an error
  if (DEBUG_OUTPUT || level === 'error') {
    const consoleMethod = level === 'error' ? console.error : console.log;
    consoleMethod(message);
  }

  // Also send to browser if DEBUG_OUTPUT is enabled or if it's an error
  // This ensures clean door output in normal mode (no debug messages in terminal)
  if (DEBUG_OUTPUT || level === 'error') {
    let client = clientOrId;
    if (typeof clientOrId === 'number') {
      client = clients.get(clientOrId);
    }

    if (client && client.ws && client.ws.readyState === WebSocket.OPEN) {
      // Determine ANSI color based on log level
      let color = '';
      let reset = '\x1b[0m';

      if (level === 'error') {
        color = '\x1b[31m'; // Red
      } else if (message.includes('✓') || message.includes('SUCCESS')) {
        color = '\x1b[32m'; // Green
      } else if (message.includes('[WARNING]') || message.includes('WARNING')) {
        color = '\x1b[33m'; // Yellow
      } else if (message.includes('📨') || message.includes('📤') || message.includes('➡️')) {
        color = '\x1b[36m'; // Cyan
      } else if (message.includes('[START]') || message.includes('🛑')) {
        color = '\x1b[35m'; // Magenta
      } else {
        color = '\x1b[90m'; // Gray
      }

      client.ws.send(
        JSON.stringify({
          type: 'debug',
          data: `${color}${message}${reset}`,
        })
      );
    }
  }
}

wss.on('connection', (ws) => {
  console.log('[OK] Client connected');

  const clientId = Date.now();
  clients.set(clientId, {
    ws,
    doorProcess: null,
    currentDoor: null,
    watcher: null,
  });

  ws.on('message', (message) => {
    const data = JSON.parse(message);
    handleClientMessage(clientId, data);
  });

  ws.on('close', () => {
    console.log('[ERROR] Client disconnected');
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
  debugLog(clientId, `📨 [WS MESSAGE] Received from client ${clientId}:`);
  debugLog(clientId, `   Type: ${data.type}`);
  debugLog(clientId, `   Data: ${JSON.stringify(data).substring(0, 200)}`);

  const client = clients.get(clientId);
  if (!client) {
    debugLog(clientId, `[ERROR] [WS MESSAGE] Client ${clientId} not found`, 'error');
    return;
  }

  if (data.type === 'start-door') {
    debugLog(clientId, `➡️  [WS MESSAGE] Handling start-door for doorId="${data.doorId}"`);
    startDoor(clientId, data.doorId);
  } else if (data.type === 'input') {
    // Check if this is a command (selectDoor:, buildDoor:, runDoor:, etc.)
    if (typeof data.data === 'string') {
      if (data.data.startsWith('selectDoor:')) {
        const doorId = data.data.substring('selectDoor:'.length);
        debugLog(clientId, `➡️  [WS MESSAGE] Handling selectDoor for doorId="${doorId}"`);
        selectDoor(clientId, doorId);
      } else if (data.data.startsWith('buildDoor:')) {
        const doorId = data.data.substring('buildDoor:'.length);
        debugLog(clientId, `➡️  [WS MESSAGE] Handling buildDoor for doorId="${doorId}"`);
        buildDoor(clientId, doorId);
      } else if (data.data.startsWith('runDoor:')) {
        const doorId = data.data.substring('runDoor:'.length);
        debugLog(clientId, `➡️  [WS MESSAGE] Handling runDoor for doorId="${doorId}"`);
        startDoor(clientId, doorId);
      } else if (data.data.startsWith('loadFile:')) {
        const filePath = data.data.substring('loadFile:'.length);
        debugLog(clientId, `➡️  [WS MESSAGE] Handling loadFile for path="${filePath}"`);
        loadFile(clientId, filePath);
      } else if (data.data.startsWith('saveFile:')) {
        const parts = data.data.substring('saveFile:'.length).split(':');
        const filePath = parts[0];
        const content = parts.slice(1).join(':');
        debugLog(clientId, `➡️  [WS MESSAGE] Handling saveFile for path="${filePath}" (${content.length} chars)`);
        saveFile(clientId, filePath, content);
      } else {
        // Regular keyboard input
        debugLog(clientId, `⌨️  [WS MESSAGE] Handling keyboard input: "${data.data}"`);
        sendInputToDoor(clientId, data.data);
      }
    } else if (data.key) {
      // Legacy format with 'key' field
      debugLog(clientId, `⌨️  [WS MESSAGE] Handling legacy keyboard input: "${data.key}"`);
      sendInputToDoor(clientId, data.key);
    }
  } else if (data.type === 'stop-door') {
    debugLog(clientId, `➡️  [WS MESSAGE] Handling stop-door`);
    stopDoor(clientId);
  } else if (data.type === 'output') {
    // ClientDoor SDK protocol: door sending ANSI output
    debugLog(clientId, `📤 [CLIENT DOOR OUTPUT] Sending ANSI to terminal (${data.data?.text?.length || 0} bytes)`);
    client.ws.send(
      JSON.stringify({
        type: 'ansi-output',
        data: data.data?.text || '',
      })
    );
  } else if (data.type === 'rpc-request') {
    // ClientDoor SDK protocol: door making RPC call
    debugLog(clientId, `[CONFIG] [CLIENT DOOR RPC] Request: ${data.method}`);
    // For now, send error response - RPC handlers can be added later
    client.ws.send(
      JSON.stringify({
        type: 'rpc-error',
        id: data.id,
        error: {
          code: -1,
          message: 'RPC not implemented in preview server',
        },
      })
    );
  } else if (data.type === 'door-message') {
    // Wrapped door message from client door (via socket.io wrapper)
    debugLog(clientId, `[PACKAGE] [DOOR MESSAGE] Unwrapping door message, event: ${data.event}`);

    // Extract the inner message from the wrapped format
    // Structure: { type: 'door-message', event: 'door:client:message', data: { sessionId, message } }
    const innerMessage = data.data?.message;

    if (innerMessage) {
      debugLog(clientId, `   ➡️  Inner message type: ${innerMessage.type}`);
      // Recursively handle the unwrapped message
      handleClientMessage(clientId, innerMessage);
    } else {
      debugLog(clientId, `   [WARNING]  No inner message found in door-message wrapper`, 'error');
    }
  } else {
    debugLog(clientId, `[WARNING]  [WS MESSAGE] Unknown message type: ${data.type}`);
  }
}

/**
 * Select door and send metadata
 */
function selectDoor(clientId, doorId) {
  const client = clients.get(clientId);
  if (!client) return;

  try {
    const doorPath = resolveDoorPath(doorId);

    if (!fs.existsSync(doorPath)) {
      client.ws.send(
        JSON.stringify({
          type: 'error',
          data: `Door not found: ${doorId}`,
        })
      );
      return;
    }

    // Load package.json
    const pkgPath = path.join(doorPath, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      client.ws.send(
        JSON.stringify({
          type: 'error',
          data: 'package.json not found',
        })
      );
      return;
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    // Scan files
    const files = [];
    let totalSize = 0;
    let fileCount = 0;

    function scanDir(dir, baseDir = '') {
      const items = fs.readdirSync(dir);
      items.forEach((item) => {
        const fullPath = path.join(dir, item);
        const relativePath = path.join(baseDir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          if (item !== 'node_modules' && item !== '.git' && item !== 'dist') {
            scanDir(fullPath, relativePath);
          }
        } else {
          totalSize += stat.size;
          fileCount++;
        }
      });
    }

    scanDir(doorPath);

    // Determine door type
    const tsFile = path.join(doorPath, 'index.ts');
    const jsFile = path.join(doorPath, 'index.js');
    const distFile = path.join(doorPath, 'dist', 'index.js');

    let doorType = 'unknown';
    let entryPoint = '';
    let hasBuild = false;

    if (fs.existsSync(tsFile)) {
      doorType = 'typescript';
      entryPoint = 'index.ts';
      hasBuild = fs.existsSync(distFile);
    } else if (fs.existsSync(jsFile)) {
      doorType = 'javascript';
      entryPoint = 'index.js';
      hasBuild = true;
    } else if (fs.existsSync(distFile)) {
      doorType = 'javascript';
      entryPoint = 'dist/index.js';
      hasBuild = true;
    }

    // Get last modified time
    const pkgStat = fs.statSync(pkgPath);
    const lastModified = pkgStat.mtimeMs;

    // Set current door
    client.currentDoor = doorId;

    // Resolve BBS command (prefer explicit package field, otherwise derive from door id)
    const bbsCommand = (pkg.bbsCommand || doorId || '').toUpperCase();

    // Send metadata
    client.ws.send(
      JSON.stringify({
        type: 'doorMetadata',
        data: {
          name: pkg.name || doorId,
          version: pkg.version || '1.0.0',
          description: pkg.description || '',
          author: pkg.author || '',
          doorType,
          entryPoint,
          hasBuild,
          fileCount,
          totalSize,
          lastModified,
          dependencies: pkg.dependencies || {},
          bbsCommand,
        },
      })
    );

    // Load file tree
    loadFileTree(clientId, doorId);
  } catch (error) {
    console.error('Error selecting door:', error);
    client.ws.send(
      JSON.stringify({
        type: 'error',
        data: error.message,
      })
    );
  }
}

/**
 * Load file tree for door
 */
function loadFileTree(clientId, doorId) {
  const client = clients.get(clientId);
  if (!client) return;

  try {
    const doorPath = resolveDoorPath(doorId);

    function buildTree(dir, baseDir = '') {
      const items = fs.readdirSync(dir);
      const tree = [];

      items.forEach((item) => {
        const fullPath = path.join(dir, item);
        const relativePath = path.join(baseDir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          if (item !== 'node_modules' && item !== '.git' && item !== 'dist') {
            const children = buildTree(fullPath, relativePath);
            if (children.length > 0) {
              tree.push({
                name: item,
                path: relativePath.replace(/\\/g, '/'),
                type: 'directory',
                children,
              });
            }
          }
        } else {
          // Only include editable files
          const ext = path.extname(item);
          if (['.ts', '.js', '.json', '.md', '.txt'].includes(ext)) {
            tree.push({
              name: item,
              path: relativePath.replace(/\\/g, '/'),
              type: 'file',
              size: stat.size,
            });
          }
        }
      });

      return tree;
    }

    const files = buildTree(doorPath);

    // Send file tree
    client.ws.send(
      JSON.stringify({
        type: 'fileContent',
        data: {
          files,
          currentFile: null,
        },
      })
    );
  } catch (error) {
    console.error('Error loading file tree:', error);
  }
}

/**
 * Build door
 */
function buildDoor(clientId, doorId) {
  const client = clients.get(clientId);
  if (!client) return;

  try {
    const doorPath = resolveDoorPath(doorId);

    if (!fs.existsSync(doorPath)) {
      client.ws.send(
        JSON.stringify({
          type: 'error',
          data: `Door not found: ${doorId}`,
        })
      );
      return;
    }

    console.log(`[BUILD] Building door: ${doorId}`);

    // Send initial build status
    client.ws.send(
      JSON.stringify({
        type: 'buildStatus',
        data: {
          building: true,
          success: false,
          errors: [],
          warnings: [],
          lastBuild: Date.now(),
          duration: 0,
        },
      })
    );

    const startTime = Date.now();

    // Actually build the door with npm run build
    const build = spawn('npm', ['run', 'build'], {
      cwd: doorPath,
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    build.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      // Send to client terminal in real-time
      client.ws.send(
        JSON.stringify({
          type: 'output',
          data: text,
        })
      );
    });

    build.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      // Send to client terminal in real-time
      client.ws.send(
        JSON.stringify({
          type: 'output',
          data: text,
        })
      );
    });

    build.on('close', (code) => {
      const output = stdout + stderr;
      const errors = [];
      const warnings = [];

      // Parse TypeScript errors from build output
      // Format: filename(line,col): error TS####: message
      const errorRegex = /(.+?)\((\d+),(\d+)\):\s+error\s+TS\d+:\s+(.+)/g;
      let match;

      while ((match = errorRegex.exec(output)) !== null) {
        errors.push({
          file: path.basename(match[1]),
          line: parseInt(match[2]),
          column: parseInt(match[3]),
          message: match[4],
        });
      }

      // If TypeScript compilation failed, report immediately
      if (code !== 0) {
        const duration = Date.now() - startTime;
        console.log(`✗ Build failed: ${doorId} (${errors.length} errors, ${duration}ms)`);

        client.ws.send(
          JSON.stringify({
            type: 'buildStatus',
            data: {
              building: false,
              success: false,
              errors,
              warnings,
              lastBuild: Date.now(),
              duration,
            },
          })
        );

        client.ws.send(
          JSON.stringify({
            type: 'output',
            data: `\x1b[31m✗ Build failed\x1b[0m (${errors.length} errors, ${duration}ms)\n`,
          })
        );
        errors.forEach((err) => {
          client.ws.send(
            JSON.stringify({
              type: 'output',
              data: `  ${err.file}:${err.line}:${err.column} - ${err.message}\n`,
            })
          );
        });
        return;
      }

      // TypeScript compiled - now verify door can actually run
      console.log(`✓ TypeScript compiled: ${doorId}, verifying runtime...`);

      const verify = spawn('ts-node', ['--compilerOptions', '{"module":"commonjs"}', 'index.ts'], {
        cwd: doorPath,
        shell: true,
        timeout: 3000, // 3 second timeout for verification
      });

      let verifyStderr = '';

      verify.stderr.on('data', (data) => {
        const text = data.toString();
        verifyStderr += text;
        // Send verification errors to client terminal in real-time
        client.ws.send(
          JSON.stringify({
            type: 'output',
            data: text,
          })
        );
      });

      verify.on('close', async (verifyCode) => {
        const duration = Date.now() - startTime;

        // Parse runtime errors from ts-node output
        const runtimeErrorRegex = /(.+?)\((\d+),(\d+)\):\s+error\s+TS\d+:\s+(.+)/g;
        while ((match = runtimeErrorRegex.exec(verifyStderr)) !== null) {
          errors.push({
            file: path.basename(match[1]),
            line: parseInt(match[2]),
            column: parseInt(match[3]),
            message: match[4],
          });
        }

        // Only check for TSError compilation failures (not runtime warnings)
        // Lines like "TSError: ⨯ Unable to compile TypeScript:" indicate actual errors
        if (verifyStderr.includes('TSError:') || verifyStderr.includes('Unable to compile TypeScript')) {
          // Extract TypeScript compilation errors
          const tsErrorLines = verifyStderr.split('\n').filter(line =>
            line.includes('error TS') && !line.includes('Error:')
          );

          tsErrorLines.forEach(line => {
            if (errors.length === 0) {
              errors.push({
                file: 'index.ts',
                line: 0,
                column: 0,
                message: line.trim(),
              });
            }
          });
        }

        const success = errors.length === 0;

        if (success) {
          console.log(`✓ Build successful: ${doorId} (${duration}ms)`);

          // Install door to BBS (generate .info, create symlink, reload commands)
          console.log(`[PACKAGE] Installing ${doorId} to BBS...`);
          const installResult = await installDoorToBBS(doorId);

          if (installResult.success) {
            console.log(`✓ ${installResult.message}`);
          } else {
            console.warn(`[WARNING]  ${installResult.message}`);
          }

          // Auto-launch door in BBS terminal after successful build
          // Read bbsCommand from package.json (prefer live doors/<id>, fallback to examples)
          const projectRoot = path.resolve(__dirname, '../../..');
          const doorsBase = path.join(projectRoot, 'doors');
          const sdkExamplesBase = path.join(__dirname, '../../examples');
          const preferredDoorPath = path.join(doorsBase, doorId);
          const fallbackDoorPath = path.join(sdkExamplesBase, doorId);
          const doorPath = fs.existsSync(preferredDoorPath) ? preferredDoorPath : fallbackDoorPath;
          const pkgPath = path.join(doorPath, 'package.json');
          let bbsCommand = doorId.toUpperCase(); // Default fallback

          if (fs.existsSync(pkgPath)) {
            try {
              const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
              bbsCommand = pkg.bbsCommand || doorId.toUpperCase();
            } catch (err) {
              console.warn(`[WARNING]  Could not read bbsCommand from ${pkgPath}`);
            }
          } else {
            console.warn(`[WARNING]  package.json not found for ${doorId} (looked in ${doorPath})`);
          }

          console.log(`[START] Auto-launching door in BBS: ${doorId} (command: ${bbsCommand})`);
          client.ws.send(
            JSON.stringify({
              type: 'auto-launch',
              data: { doorId, bbsCommand },
            })
          );
        } else {
          console.log(`✗ Build failed: ${doorId} (${errors.length} runtime errors, ${duration}ms)`);
        }

        // Send final build status
        client.ws.send(
          JSON.stringify({
            type: 'buildStatus',
            data: {
              building: false,
              success,
              errors,
              warnings,
              lastBuild: Date.now(),
              duration,
            },
          })
        );

        // Send output to terminal
        if (success) {
          client.ws.send(
            JSON.stringify({
              type: 'output',
              data: `\x1b[32m✓ Build successful\x1b[0m (${duration}ms)\n`,
            })
          );
        } else {
          client.ws.send(
            JSON.stringify({
              type: 'output',
              data: `\x1b[31m✗ Build failed\x1b[0m (${errors.length} errors, ${duration}ms)\n`,
            })
          );
          errors.forEach((err) => {
            client.ws.send(
              JSON.stringify({
                type: 'output',
                data: `  ${err.file}:${err.line}:${err.column} - ${err.message}\n`,
              })
            );
          });
        }
      }); // End verify.on('close')
    }); // End build.on('close')
  } catch (error) {
    console.error('Error building door:', error);
    client.ws.send(
      JSON.stringify({
        type: 'error',
        data: error.message,
      })
    );
  }
}

/**
 * Load file content
 */
function loadFile(clientId, filePath) {
  const client = clients.get(clientId);
  if (!client || !client.currentDoor) return;

  try {
    const doorPath = resolveDoorPath(client.currentDoor);
    if (!doorPath) {
      client.ws.send(
        JSON.stringify({
          type: 'error',
          data: `Door not found: ${client.currentDoor}`,
        })
      );
      return;
    }
    const fullPath = path.join(doorPath, filePath);

    if (!fs.existsSync(fullPath)) {
      client.ws.send(
        JSON.stringify({
          type: 'error',
          data: `File not found: ${filePath}`,
        })
      );
      return;
    }

    const content = fs.readFileSync(fullPath, 'utf8');

    client.ws.send(
      JSON.stringify({
        type: 'fileContent',
        data: {
          path: filePath,
          content,
        },
      })
    );
  } catch (error) {
    console.error('Error loading file:', error);
    client.ws.send(
      JSON.stringify({
        type: 'error',
        data: error.message,
      })
    );
  }
}

/**
 * Save file content
 */
function saveFile(clientId, filePath, content) {
  const client = clients.get(clientId);
  if (!client || !client.currentDoor) return;

  try {
    const doorPath = resolveDoorPath(client.currentDoor);
    if (!doorPath) {
      client.ws.send(
        JSON.stringify({
          type: 'error',
          data: `Door not found: ${client.currentDoor}`,
        })
      );
      return;
    }
    const fullPath = path.join(doorPath, filePath);

    // Security check
    const resolvedPath = path.resolve(fullPath);
    if (!resolvedPath.startsWith(doorPath)) {
      client.ws.send(
        JSON.stringify({
          type: 'error',
          data: 'Access denied',
        })
      );
      return;
    }

    // Create directory if needed
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`✓ Saved file: ${filePath}`);
  } catch (error) {
    console.error('Error saving file:', error);
    client.ws.send(
      JSON.stringify({
        type: 'error',
        data: error.message,
      })
    );
  }
}

/**
 * Start a CLIENT door (runs in browser)
 */
async function startClientDoor(clientId, doorId, doorPath) {
  const client = clients.get(clientId);
  if (!client) return;

  debugLog(clientId, `[PACKAGE] [CLIENT DOOR] Bundling ${doorId} for browser...`);

  try {
    // Bundle with esbuild for browser
    const esbuild = require('esbuild');
    const entryFile = path.join(doorPath, 'index.ts');

    if (!fs.existsSync(entryFile)) {
      throw new Error(`Entry file not found: ${entryFile}`);
    }

    const outfile = path.join(doorPath, '.preview-bundle.js');

    debugLog(clientId, `[BUILD] [CLIENT DOOR] Building bundle...`);
    await esbuild.build({
      entryPoints: [entryFile],
      bundle: true,
      outfile,
      platform: 'browser',
      format: 'iife',
      sourcemap: 'inline',
      loader: { '.ts': 'ts' },
      logLevel: 'warning',
      // Provide empty shims for Node.js built-in modules that don't work in browser
      inject: [],
      define: {
        'process.env.NODE_ENV': '"production"',
        'process.env.PREVIEW_MODE': '"0"',
        'process.platform': '"browser"',
        'process.stdin': 'undefined',
        'process.stdout': 'undefined',
        'process.stderr': 'undefined',
        'process.exit': '(function(){})',
        'process.cwd': '(function(){return "/"})',
        'process.on': '(function(){})',
        'global': 'window',
      },
      // Mark Node.js built-ins as external (they'll be replaced with empty objects)
      external: [],
      // Use esbuild plugins to handle Node.js built-ins
      plugins: [
        {
          name: 'node-builtins-browser',
          setup(build) {
            // Intercept imports of Node.js built-ins and provide empty shims
            const nodeBuiltins = [
              'fs', 'path', 'os', 'crypto', 'stream', 'util', 'events', 'buffer',
              'zlib', 'assert', 'http', 'https', 'net', 'tls', 'child_process',
              'cluster', 'dns', 'dgram', 'readline', 'repl', 'tty', 'v8', 'vm',
              'async_hooks', 'perf_hooks', 'worker_threads', 'inspector',
              'constants', 'module', 'process', 'querystring', 'string_decoder',
              'sys', 'timers', 'url', 'punycode', 'domain'
            ];
            nodeBuiltins.forEach(mod => {
              build.onResolve({ filter: new RegExp(`^${mod}$`) }, args => ({
                path: args.path,
                namespace: 'node-builtin-shim',
                pluginData: { moduleName: mod },
              }));
              build.onLoad({ filter: /.*/, namespace: 'node-builtin-shim' }, (args) => {
                const moduleName = args.pluginData?.moduleName;

                // Provide a proper EventEmitter implementation for the 'events' module
                if (moduleName === 'events') {
                  return {
                    contents: `
                      // Browser-compatible EventEmitter implementation
                      export class EventEmitter {
                        constructor() {
                          this._events = {};
                        }

                        on(event, listener) {
                          if (!this._events[event]) {
                            this._events[event] = [];
                          }
                          this._events[event].push(listener);
                          return this;
                        }

                        once(event, listener) {
                          const onceWrapper = (...args) => {
                            this.off(event, onceWrapper);
                            listener.apply(this, args);
                          };
                          this.on(event, onceWrapper);
                          return this;
                        }

                        off(event, listener) {
                          if (!this._events[event]) return this;
                          this._events[event] = this._events[event].filter(l => l !== listener);
                          return this;
                        }

                        removeListener(event, listener) {
                          return this.off(event, listener);
                        }

                        removeAllListeners(event) {
                          if (event) {
                            delete this._events[event];
                          } else {
                            this._events = {};
                          }
                          return this;
                        }

                        emit(event, ...args) {
                          if (!this._events[event]) return false;
                          this._events[event].forEach(listener => {
                            try {
                              listener.apply(this, args);
                            } catch (err) {
                              console.error('Error in event listener:', err);
                            }
                          });
                          return true;
                        }

                        listeners(event) {
                          return this._events[event] || [];
                        }

                        listenerCount(event) {
                          return this.listeners(event).length;
                        }
                      }

                      export default EventEmitter;
                      export const __esModule = true;
                    `,
                    loader: 'js',
                  };
                }

                // For other Node.js built-ins, return empty shim
                return {
                  contents: 'export default {}; export const __esModule = true;',
                  loader: 'js',
                };
              });
            });
          },
        },
        {
          name: 'node-only-packages',
          setup(build) {
            // Shim Node.js-only packages that shouldn't run in browser
            const nodePackages = [
              'archiver', 'adm-zip', 'glob', 'graceful-fs', 'rimraf',
              'chokidar', 'fs-extra', 'mkdirp', 'tar', 'tar-stream',
              'crc32-stream', 'lazystream', 'readable-stream', 'inflight',
              // neo-blessed internal dependencies that don't work in browser
              'term.js', 'pty.js', 'blessed/lib/colors'
            ];
            nodePackages.forEach(pkg => {
              build.onResolve({ filter: new RegExp(`^${pkg}(/.*)?$`) }, args => ({
                path: args.path,
                namespace: 'node-package-shim',
              }));
            });
            build.onLoad({ filter: /.*/, namespace: 'node-package-shim' }, () => ({
              contents: 'export default {}; export const __esModule = true;',
              loader: 'js',
            }));
          },
        }
      ],
    });

    debugLog(clientId, `[OK] [CLIENT DOOR] Bundle created: ${outfile}`);

    // Read the bundled code
    const bundledCode = fs.readFileSync(outfile, 'utf8');

    // Send bundle to client for execution in browser
    debugLog(clientId, `📤 [CLIENT DOOR] Sending bundle to browser (${bundledCode.length} bytes)`);
    client.ws.send(JSON.stringify({
      type: 'client-door-bundle',
      doorId,
      code: bundledCode,
    }));

    debugLog(clientId, `[OK] [CLIENT DOOR] Bundle sent to browser, door will execute there`);

    // Send door-started message
    client.ws.send(JSON.stringify({
      type: 'door-started',
      doorId,
      runtime: 'client',
    }));

    // Send CONNECT message to initialize the client door
    // Give the door time to load before sending connect message
    setTimeout(() => {
      debugLog(clientId, `🔌 [CLIENT DOOR] Sending CONNECT message to initialize door`);
      client.ws.send(JSON.stringify({
        type: 'connect',
        user: {
          id: 1,
          name: 'Developer',
          node: 1,
          securityLevel: 255,
          timeLeft: 3600,
          graphicsMode: 'ANSI',
          termWidth: 80,
          termHeight: 24,
          data: {},
        },
        timestamp: Date.now(),
      }));
    }, 100); // Small delay to ensure bundle is loaded and executed

  } catch (err) {
    debugLog(clientId, `[ERROR] [CLIENT DOOR] Bundling failed: ${err.message}`, 'error');
    debugLog(clientId, `   Stack: ${err.stack}`, 'error');

    client.ws.send(JSON.stringify({
      type: 'error',
      message: `Failed to bundle client door: ${err.message}`,
    }));
  }
}

/**
 * Start door process
 */
function startDoor(clientId, doorId) {
  debugLog(clientId, `\n${'='.repeat(80)}`);
  debugLog(clientId, `[START] [START DOOR] Called for clientId=${clientId}, doorId="${doorId}"`);
  debugLog(clientId, `${'='.repeat(80)}`);

  const client = clients.get(clientId);
  if (!client) {
    debugLog(clientId, `[ERROR] [START DOOR] Client ${clientId} not found in clients map`, 'error');
    return;
  }
  debugLog(clientId, `✓ [START DOOR] Client ${clientId} found`);

  // Stop existing door
  if (client.doorProcess) {
    debugLog(clientId, `[WARNING]  [START DOOR] Existing door process found (PID: ${client.doorProcess.pid}), killing it...`);
    client.doorProcess.kill();
  }

  const doorPath = resolveDoorPath(doorId);
  debugLog(clientId, `📂 [START DOOR] Door path: ${doorPath}`);
  debugLog(clientId, `📂 [START DOOR] Door path exists: ${fs.existsSync(doorPath)}`);

  // Check door runtime type from package.json
  const pkgPath = path.join(doorPath, 'package.json');
  let runtime = 'server'; // Default to server runtime

  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      runtime = pkg.runtime || 'server';
      debugLog(clientId, `[PACKAGE] [START DOOR] Runtime type: ${runtime}`);
    } catch (err) {
      debugLog(clientId, `[WARNING]  [START DOOR] Could not read package.json, assuming server runtime`, 'warn');
    }
  }

  // Handle client doors differently
  if (runtime === 'client') {
    debugLog(clientId, `[WEB] [START DOOR] CLIENT DOOR detected - bundling for browser...`);
    startClientDoor(clientId, doorId, doorPath);
    return;
  }

  // Server door: continue with Node.js execution
  debugLog(clientId, `[SERVER]  [START DOOR] SERVER DOOR detected - spawning Node.js process...`);

  // Check for TypeScript or JavaScript
  const tsFile = path.join(doorPath, 'index.ts');
  const jsFile = path.join(doorPath, 'index.js');
  const distFile = path.join(doorPath, 'dist', 'index.js');

  debugLog(clientId, `[DEBUG] [START DOOR] Checking for entry files...`);
  debugLog(clientId, `   - index.ts exists: ${fs.existsSync(tsFile)}`);
  debugLog(clientId, `   - index.js exists: ${fs.existsSync(jsFile)}`);
  debugLog(clientId, `   - dist/index.js exists: ${fs.existsSync(distFile)}`);

  let command, args, mainFile;

  if (fs.existsSync(tsFile)) {
    // Use ts-node for TypeScript files
    command = 'npx';
    args = ['ts-node', 'index.ts'];
    mainFile = tsFile;
    debugLog(clientId, `✓ [START DOOR] Using TypeScript entry: ${mainFile}`);
  } else if (fs.existsSync(distFile)) {
    // Use compiled dist file
    command = 'node';
    args = ['dist/index.js'];
    mainFile = distFile;
    debugLog(clientId, `✓ [START DOOR] Using compiled entry: ${mainFile}`);
  } else if (fs.existsSync(jsFile)) {
    // Use JavaScript file
    command = 'node';
    args = ['index.js'];
    mainFile = jsFile;
    debugLog(clientId, `✓ [START DOOR] Using JavaScript entry: ${mainFile}`);
  } else {
    debugLog(clientId, `[ERROR] [START DOOR] No entry file found!`, 'error');
    debugLog(clientId, `   Checked paths:`, 'error');
    debugLog(clientId, `   - ${tsFile}`, 'error');
    debugLog(clientId, `   - ${jsFile}`, 'error');
    debugLog(clientId, `   - ${distFile}`, 'error');

    const errorMsg = `Door main file not found. Checked: ${tsFile}, ${jsFile}, ${distFile}`;
    debugLog(clientId, `📤 [START DOOR] Sending error to client: ${errorMsg}`, 'error');

    client.ws.send(
      JSON.stringify({
        type: 'error',
        message: errorMsg,
      })
    );
    return;
  }

  debugLog(clientId, `[CONFIG] [START DOOR] Command: ${command}`);
  debugLog(clientId, `[CONFIG] [START DOOR] Args: ${JSON.stringify(args)}`);
  debugLog(clientId, `[CONFIG] [START DOOR] CWD: ${doorPath}`);
  debugLog(clientId, `[CONFIG] [START DOOR] Environment: PREVIEW_MODE=1`);

  let doorProcess;

  try {
    doorProcess = spawn(command, args, {
      cwd: doorPath,
      env: { ...process.env, PREVIEW_MODE: '1' },
      stdio: ['pipe', 'pipe', 'pipe'], // Explicitly pipe stdin, stdout, stderr
    });

    debugLog(clientId, `✓ [START DOOR] Process spawned with PID: ${doorProcess.pid}`);

    client.doorProcess = doorProcess;
    client.currentDoor = doorId;
    debugLog(clientId, `✓ [START DOOR] Client state updated (currentDoor="${doorId}")`);
  } catch (error) {
    debugLog(clientId, `[ERROR] [START DOOR] Failed to spawn process: ${error.message}`, 'error');
    client.ws.send(
      JSON.stringify({
        type: 'error',
        message: `Failed to start door: ${error.message}`,
      })
    );
    return;
  }

  // Capture stdout (ANSI output)
  doorProcess.stdout.on('data', (data) => {
    const output = data.toString();
    debugLog(clientId, `📤 [STDOUT] ${output.length} bytes`);
    debugLog(clientId, `   Preview: ${output.substring(0, 100)}${output.length > 100 ? '...' : ''}`);

    client.ws.send(
      JSON.stringify({
        type: 'output',
        data: output,
      })
    );
    debugLog(clientId, `✓ [STDOUT] Sent to client via WebSocket`);
  });

  // Capture stderr (errors)
  doorProcess.stderr.on('data', (data) => {
    const errorOutput = data.toString();

    // Filter out benign informational messages
    const isBenign = errorOutput.includes('AudioEngine: Running in Node.js environment') ||
                     errorOutput.includes('Audio features disabled');

    if (isBenign) {
      // Log but don't send to client
      debugLog(clientId, `ℹ️  [INFO] ${errorOutput.trim()}`);
      return;
    }

    debugLog(clientId, `📤 [STDERR] ${errorOutput.length} bytes`, 'error');
    debugLog(clientId, `   Error: ${errorOutput}`, 'error');

    client.ws.send(
      JSON.stringify({
        type: 'error',
        message: errorOutput,
      })
    );
    debugLog(clientId, `✓ [STDERR] Sent to client via WebSocket`);
  });

  // Handle process errors (like EAGAIN)
  doorProcess.on('error', (error) => {
    debugLog(clientId, `\n${'='.repeat(80)}`);
    debugLog(clientId, `[ERROR] [PROCESS ERROR] Door process error`);
    debugLog(clientId, `   Door: ${doorId}`);
    debugLog(clientId, `   Error: ${error.message}`);
    debugLog(clientId, `   Stack: ${error.stack}`);
    debugLog(clientId, `${'='.repeat(80)}\n`);

    // Send error to client (only once)
    if (client.doorProcess) {
      client.ws.send(
        JSON.stringify({
          type: 'error',
          message: `Door process error: ${error.message}`,
        })
      );

      client.doorProcess = null;
      client.currentDoor = null;
    }
  });

  // Handle process exit
  doorProcess.on('exit', (code, signal) => {
    debugLog(clientId, `\n${'='.repeat(80)}`);
    debugLog(clientId, `🛑 [EXIT] Door process exited`);
    debugLog(clientId, `   Door: ${doorId}`);
    debugLog(clientId, `   PID: ${doorProcess.pid}`);
    debugLog(clientId, `   Exit code: ${code}`);
    debugLog(clientId, `   Signal: ${signal || 'none'}`);
    debugLog(clientId, `${'='.repeat(80)}\n`);

    client.ws.send(
      JSON.stringify({
        type: 'door-stopped',
        code,
      })
    );
    debugLog(clientId, `✓ [EXIT] Sent door-stopped message to client`);

    client.doorProcess = null;
  });

  // Watch for file changes (hot reload)
  const watchPattern = path.join(doorPath, '**/*.{ts,js}');
  debugLog(clientId, `👁️  [WATCH] Setting up file watcher for: ${watchPattern}`);

  const watcher = chokidar.watch(watchPattern, {
    ignored: /node_modules/,
    persistent: true,
  });

  watcher.on('change', (filePath) => {
    debugLog(clientId, `[NOTE] [WATCH] File changed: ${filePath}`);
    debugLog(clientId, `🔄 [WATCH] Triggering hot reload...`);

    client.ws.send(
      JSON.stringify({
        type: 'reload',
        message: 'Files changed, reloading...',
      })
    );

    // Restart door
    stopDoor(clientId);
    setTimeout(() => {
      debugLog(clientId, `🔄 [WATCH] Restarting door after file change...`);
      startDoor(clientId, doorId);
    }, 1000);
  });

  watcher.on('error', (error) => {
    debugLog(clientId, `[ERROR] [WATCH] Watcher error: ${error.message}`, 'error');
  });

  client.watcher = watcher;
  debugLog(clientId, `✓ [START DOOR] File watcher initialized`);

  // Send started message
  const startedMsg = { type: 'door-started', doorId };
  debugLog(clientId, `📤 [START DOOR] Sending door-started message: ${JSON.stringify(startedMsg)}`);

  client.ws.send(JSON.stringify(startedMsg));

  debugLog(clientId, `✓ [START DOOR] Door startup complete!`);
  debugLog(clientId, `${'='.repeat(80)}\n`);
}

/**
 * Send input to door
 */
function sendInputToDoor(clientId, key) {
  const client = clients.get(clientId);
  if (!client) return;

  // Check if this is a client door (no server-side process)
  if (!client.doorProcess) {
    // Client door: send INPUT message via WebSocket
    debugLog(clientId, `⌨️  [CLIENT DOOR INPUT] Sending key to client door: "${key}"`);

    // Convert key to SDK INPUT message format
    const keyEvent = {
      key: key,
      code: key.charCodeAt(0),
      ctrl: key.charCodeAt(0) < 32,
      alt: false,
      shift: false,
    };

    client.ws.send(JSON.stringify({
      type: 'input',
      data: keyEvent,
      timestamp: Date.now(),
    }));
    return;
  }

  // Server door: send to stdin
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
server.listen(PORT, async () => {
  const serverUrl = `http://localhost:${PORT}`;
  const urlLine = `   Server running at: ${serverUrl}`;
  const urlPadding = ' '.repeat(64 - urlLine.length);

  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║   [GAME]  AmiExpress BBS Door Preview Server                   ║
║                                                                ║
║${urlLine}${urlPadding}║
║                                                                ║
║   Features:                                                    ║
║   [OK] Live ANSI rendering                                     ║
║   [OK] Real-time keyboard input                                ║
║   [OK] Hot reload on file changes                              ║
║   [OK] Debug console                                           ║
║                                                                ║
║   Open your browser and start testing!                         ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
  `);

  // Wait a moment for clients to connect, then compile examples
  setTimeout(async () => {
    await compileExamples();
  }, 2000); // 2 second delay to allow browser to connect
});
