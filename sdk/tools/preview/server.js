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
const { spawn, execSync } = require('child_process');

const PORT = process.env.PORT || 8080;

/**
 * Kill any existing servers on the port before starting
 */
function killOldServers() {
  try {
    console.log(`🔍 Checking for existing servers on port ${PORT}...`);

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

        console.log('✅ Old servers killed');
      } else {
        console.log('✅ No old servers found');
      }
    } catch (err) {
      // No process found on port (lsof returns non-zero when nothing found)
      console.log('✅ No old servers found');
    }
  } catch (err) {
    console.warn('⚠️  Could not check for old servers:', err.message);
  }
}

// Kill old servers before starting
killOldServers();

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
const publicReactDir = path.join(__dirname, 'public-react');
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicReactDir)) {
  console.log('📦 Serving React frontend from public-react/');
  app.use(express.static(publicReactDir));
} else {
  console.log('📦 Serving classic frontend from public/');
  app.use(express.static(publicDir));
}

// Root route - explicitly serve index.html
app.get('/', (req, res) => {
  const reactIndex = path.join(publicReactDir, 'index.html');
  const classicIndex = path.join(publicDir, 'index.html');

  if (fs.existsSync(reactIndex)) {
    res.sendFile(reactIndex);
  } else {
    res.sendFile(classicIndex);
  }
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

// API: Get door metadata
app.get('/api/doors/:doorId/metadata', (req, res) => {
  try {
    const { doorId } = req.params;
    const doorPath = path.join(__dirname, '../../examples', doorId);

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
    const doorPath = path.join(__dirname, '../../examples', doorId);

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
    const fullPath = path.join(__dirname, '../../examples', doorId, filePath);

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

// API: Save specific file content
app.post('/api/doors/:doorId/files/*', (req, res) => {
  try {
    const { doorId } = req.params;
    const filePath = req.params[0]; // Everything after /files/
    const { content } = req.body;

    if (content === undefined) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const fullPath = path.join(__dirname, '../../examples', doorId, filePath);

    // Security check: ensure path is within door directory
    const doorPath = path.join(__dirname, '../../examples', doorId);
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

// API: Build door (TypeScript compilation)
app.post('/api/doors/:doorId/build', (req, res) => {
  try {
    const { doorId } = req.params;
    const doorPath = path.join(__dirname, '../../examples', doorId);

    if (!fs.existsSync(doorPath)) {
      return res.status(404).json({ error: 'Door not found' });
    }

    console.log(`🔨 Building door: ${doorId}`);

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

// Temporary downloads directory
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

// Track downloads for auto-cleanup
const downloadTracking = new Map();

// API: Create release archive
app.post('/api/doors/:doorId/release', async (req, res) => {
  try {
    const { doorId } = req.params;
    const { format = 'zip', includeSource = true, includeAssets = true, includeDocs = true, doormanCompatible = true } = req.body;
    const doorPath = path.join(__dirname, '../../examples', doorId);

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

    console.log(`📦 Creating release: ${filename}`);

    if (format === 'zip') {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip();

      // Helper to add files recursively
      const addDirectory = (dirPath, zipPath = '') => {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          const zipFilePath = zipPath ? path.join(zipPath, entry.name) : entry.name;

          // Skip excluded directories
          if (entry.isDirectory()) {
            if (['node_modules', '.git', 'dist', 'downloads'].includes(entry.name)) {
              continue;
            }
            addDirectory(fullPath, zipFilePath);
          } else {
            // Add file based on options
            if (entry.name === 'package.json' || entry.name === 'tsconfig.json') {
              zip.addLocalFile(fullPath, zipPath);
            } else if (includeSource && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
              zip.addLocalFile(fullPath, zipPath);
            } else if (includeAssets && (fullPath.includes('/assets/') || fullPath.includes('/data/'))) {
              zip.addLocalFile(fullPath, zipPath);
            } else if (includeDocs && (entry.name.endsWith('.md') || entry.name.endsWith('.txt'))) {
              zip.addLocalFile(fullPath, zipPath);
            }
          }
        }
      };

      // Add door files based on options
      addDirectory(doorPath);

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

      // Create .info metadata file (Doorman compatible)
      if (doormanCompatible) {
        const bbsCommand = pkg.bbsCommand || doorId.toUpperCase();
        const infoContent = `NAME=${pkg.name || doorId}
VERSION=${version}
COMMAND=${bbsCommand}
DESCRIPTION=${pkg.description || 'BBS Door Game'}
AUTHOR=${pkg.author || 'Unknown'}
CATEGORY=${pkg.category || 'Game'}
CREATED=${new Date().toISOString()}
REQUIRES_NODE=true
MIN_NODE_VERSION=18.0.0
`;
        zip.addFile(`${doorId}.info`, Buffer.from(infoContent, 'utf-8'));
      }

      // Create README.TXT
      if (includeDocs) {
        const readmeContent = `${pkg.name || doorId} v${version}
${'='.repeat((pkg.name || doorId).length + version.length + 3)}

${pkg.description || 'BBS Door Game'}

INSTALLATION
------------
1. Extract all files to your BBS doors directory
2. Install Node.js 18+ if not already installed
3. Run: npm install
4. Configure in your BBS menu system

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

// API: Generate game with Claude AI
app.post('/api/games/generate', async (req, res) => {
  try {
    const { name, description, bbsCommand, type, features, apiKey } = req.body;

    if (!name || !description) {
      return res.status(400).json({ error: 'Name and description are required' });
    }

    console.log(`🎮 Generating game: ${name}`);

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
    const gameCode = aiResponse.content[0].text;

    // Create door ID (sanitized name)
    const doorId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const doorPath = path.join(__dirname, '../../examples', doorId);

    // Create door directory
    if (fs.existsSync(doorPath)) {
      return res.status(409).json({ error: `A game with ID "${doorId}" already exists` });
    }

    fs.mkdirSync(doorPath, { recursive: true });

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
      path.join(doorPath, 'package.json'),
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
      path.join(doorPath, 'tsconfig.json'),
      JSON.stringify(tsconfig, null, 2)
    );

    // Create index.ts with generated code
    fs.writeFileSync(path.join(doorPath, 'index.ts'), gameCode);

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

    fs.writeFileSync(path.join(doorPath, 'README.md'), readme);

    // Install dependencies
    console.log(`📦 Installing dependencies for ${doorId}...`);
    execSync('npm install', {
      cwd: doorPath,
      stdio: 'ignore',
    });

    console.log(`✅ Game created: ${doorId}`);

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
  try {
    const { name, description, bbsCommand, type, features, provider = 'claude', model, apiKey, qualityMode = 'balanced' } = req.body;

    if (!name || !description) {
      return res.status(400).json({ error: 'Name and description are required' });
    }

    console.log(`🎮 Generating game: ${name} (${provider}/${model})`);

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

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
      ollama: apiKey || 'http://localhost:11434',
    };

    const providerKey = keys[provider];
    if (!providerKey && provider !== 'ollama') {
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

    } else if (provider === 'ollama') {
      const ollamaUrl = providerKey.endsWith('/') ? providerKey : providerKey + '/';
      const response = await fetch(`${ollamaUrl}api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || 'codellama',
          prompt: prompt,
          stream: true,
        }),
      });

      if (!response.ok) {
        return sendError('Ollama API request failed. Make sure Ollama is running.');
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
          if (line.trim()) {
            try {
              const data = JSON.parse(line);
              if (data.response) {
                gameCode += data.response;
                sendCodeChunk(data.response);
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }
    }

    sendProgress(60, 'Creating project structure...');

    // Clean code (remove markdown code blocks if present)
    gameCode = gameCode.replace(/```typescript\n?/g, '').replace(/```\n?/g, '').trim();

    // Create door ID
    const doorId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const doorPath = path.join(__dirname, '../../examples', doorId);

    if (fs.existsSync(doorPath)) {
      return sendError(`A game with ID "${doorId}" already exists`);
    }

    fs.mkdirSync(doorPath, { recursive: true });

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

    fs.writeFileSync(path.join(doorPath, 'package.json'), JSON.stringify(packageJson, null, 2));

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

    fs.writeFileSync(path.join(doorPath, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));

    // Create index.ts
    fs.writeFileSync(path.join(doorPath, 'index.ts'), gameCode);

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

    fs.writeFileSync(path.join(doorPath, 'README.md'), readme);

    sendProgress(80, 'Installing dependencies...');

    // Install dependencies
    console.log(`📦 Installing dependencies for ${doorId}...`);
    execSync('npm install', { cwd: doorPath, stdio: 'ignore' });

    sendProgress(100, 'Complete!');
    console.log(`✅ Game created: ${doorId}`);

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
    const doorPath = path.join(__dirname, '../../examples', doorId);

    if (fs.existsSync(doorPath)) {
      return res.status(409).json({ error: `A game with ID "${doorId}" already exists` });
    }

    fs.mkdirSync(doorPath, { recursive: true });

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

    fs.writeFileSync(path.join(doorPath, 'package.json'), JSON.stringify(packageJson, null, 2));

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

    fs.writeFileSync(path.join(doorPath, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));
    fs.writeFileSync(path.join(doorPath, 'index.ts'), code);

    const readme = `# ${name}

${description || 'AI-generated BBS door game'}

## Game Type
${type || 'Custom'}

## Features
${(features || []).map(f => `- ${f}`).join('\n')}

---
*Generated with AI Game Wizard*
`;

    fs.writeFileSync(path.join(doorPath, 'README.md'), readme);

    // Install dependencies
    execSync('npm install', { cwd: doorPath, stdio: 'ignore' });

    console.log(`✅ Game saved: ${doorId}`);

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

wss.on('connection', (ws) => {
  console.log('✅ Client connected');

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
    // Check if this is a command (selectDoor:, buildDoor:, runDoor:, etc.)
    if (typeof data.data === 'string') {
      if (data.data.startsWith('selectDoor:')) {
        const doorId = data.data.substring('selectDoor:'.length);
        selectDoor(clientId, doorId);
      } else if (data.data.startsWith('buildDoor:')) {
        const doorId = data.data.substring('buildDoor:'.length);
        buildDoor(clientId, doorId);
      } else if (data.data.startsWith('runDoor:')) {
        const doorId = data.data.substring('runDoor:'.length);
        startDoor(clientId, doorId);
      } else if (data.data.startsWith('loadFile:')) {
        const filePath = data.data.substring('loadFile:'.length);
        loadFile(clientId, filePath);
      } else if (data.data.startsWith('saveFile:')) {
        const parts = data.data.substring('saveFile:'.length).split(':');
        const filePath = parts[0];
        const content = parts.slice(1).join(':');
        saveFile(clientId, filePath, content);
      } else {
        // Regular keyboard input
        sendInputToDoor(clientId, data.data);
      }
    } else if (data.key) {
      // Legacy format with 'key' field
      sendInputToDoor(clientId, data.key);
    }
  } else if (data.type === 'stop-door') {
    stopDoor(clientId);
  }
}

/**
 * Select door and send metadata
 */
function selectDoor(clientId, doorId) {
  const client = clients.get(clientId);
  if (!client) return;

  try {
    const doorPath = path.join(__dirname, '../../examples', doorId);

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
    const doorPath = path.join(__dirname, '../../examples', doorId);

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
    const doorPath = path.join(__dirname, '../../examples', doorId);

    if (!fs.existsSync(doorPath)) {
      client.ws.send(
        JSON.stringify({
          type: 'error',
          data: `Door not found: ${doorId}`,
        })
      );
      return;
    }

    console.log(`🔨 Building door: ${doorId}`);

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
      const duration = Date.now() - startTime;
      const output = stdout + stderr;
      const errors = [];
      const warnings = [];

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

      const success = code === 0;

      if (success) {
        console.log(`✓ Build successful: ${doorId} (${duration}ms)`);
      } else {
        console.log(`✗ Build failed: ${doorId} (${errors.length} errors, ${duration}ms)`);
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
    });
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
    const fullPath = path.join(__dirname, '../../examples', client.currentDoor, filePath);

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
    const fullPath = path.join(__dirname, '../../examples', client.currentDoor, filePath);

    // Security check
    const doorPath = path.join(__dirname, '../../examples', client.currentDoor);
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

  // Check for TypeScript or JavaScript
  const tsFile = path.join(doorPath, 'index.ts');
  const jsFile = path.join(doorPath, 'index.js');
  const distFile = path.join(doorPath, 'dist', 'index.js');

  let command, args, mainFile;

  if (fs.existsSync(tsFile)) {
    // Use ts-node for TypeScript files
    command = 'npx';
    args = ['ts-node', 'index.ts'];
    mainFile = tsFile;
  } else if (fs.existsSync(distFile)) {
    // Use compiled dist file
    command = 'node';
    args = ['dist/index.js'];
    mainFile = distFile;
  } else if (fs.existsSync(jsFile)) {
    // Use JavaScript file
    command = 'node';
    args = ['index.js'];
    mainFile = jsFile;
  } else {
    client.ws.send(
      JSON.stringify({
        type: 'error',
        message: `Door main file not found. Checked: ${tsFile}, ${jsFile}, ${distFile}`,
      })
    );
    return;
  }

  console.log(`🚀 Starting door: ${doorId} (${mainFile})`);

  const doorProcess = spawn(command, args, {
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
