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
const { spawn, execSync, exec } = require('child_process');
const { promisify } = require('util');
const execPromise = promisify(exec);

const PORT = process.env.PORT || 8080;
const DEBUG_OUTPUT = process.env.DEBUG_OUTPUT === 'true' || false;

// Log DEBUG_OUTPUT at startup
console.log(`🔍 DEBUG_OUTPUT: ${DEBUG_OUTPUT} (from env: ${process.env.DEBUG_OUTPUT})`);

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

/**
 * Compile all example games and send progress to connected clients
 */
async function compileExamples() {
  const examplesDir = path.join(__dirname, '../../examples');

  // Broadcast to all clients
  const broadcast = (message, level = 'log') => {
    // Determine ANSI color based on message content
    let color = '';
    const reset = '\x1b[0m';

    if (level === 'error' || message.includes('⚠️')) {
      color = '\x1b[33m'; // Yellow for warnings
    } else if (message.includes('✅')) {
      color = '\x1b[32m'; // Green for success
    } else if (message.includes('📦')) {
      color = '\x1b[36m'; // Cyan for progress
    } else if (message.includes('🚀')) {
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

  broadcast('\x1b[36m✨ Compiling example games...\x1b[0m');
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

    broadcast(`  📦 Type-checking ${exampleName}...`);

    try {
      // Run TypeScript compiler in type-check mode (non-blocking)
      await execPromise('npx tsc --noEmit', {
        cwd: examplePath,
        timeout: 30000, // 30 second timeout
      });

      broadcast(`  ✅ ${exampleName} type-checked successfully`);
      broadcast('');
      return { name: exampleName, success: true };
    } catch (error) {
      // Type errors are non-fatal
      broadcast(`  ⚠️  ${exampleName} has type errors (non-fatal)`);
      broadcast('');
      return { name: exampleName, success: false };
    }
  });

  // Wait for all compilations to complete
  const results = await Promise.all(compilePromises);
  compileErrors = results.filter(r => !r.success && !r.skipped).length;

  if (compileErrors > 0) {
    broadcast(`⚠️  Warning: ${compileErrors} game(s) have TypeScript errors`);
    broadcast('   The preview server is running, but these games may not work correctly');
    broadcast('');
  }

  broadcast('🚀 Starting preview server...');
  broadcast('📦 Serving React frontend from public/');
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

// API: AI Prompt for Door Improvement
app.post('/api/ai-prompt', async (req, res) => {
  try {
    const { doorId, currentFile, buildErrors, prompt, apiKey } = req.body;

    if (!doorId || !prompt) {
      return res.status(400).json({ error: 'doorId and prompt are required' });
    }

    if (!apiKey) {
      return res.status(400).json({ error: 'OpenRouter API key is required' });
    }

    const doorPath = path.join(__dirname, '../../examples', doorId);
    if (!fs.existsSync(doorPath)) {
      return res.status(404).json({ error: 'Door not found' });
    }

    console.log(`🤖 AI prompt for ${doorId}: ${prompt.substring(0, 50)}...`);

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
      const indexPath = path.join(doorPath, 'index.ts');
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
    const pkgPath = path.join(doorPath, 'package.json');
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

    // Call OpenRouter API
    const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/spotUP/amiexpress-web',
        'X-Title': 'AmiExpress SDK Door Editor',
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-sonnet',
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

    if (!openRouterResponse.ok) {
      const error = await openRouterResponse.json();
      console.error('OpenRouter API error:', error);
      return res.status(500).json({
        success: false,
        error: error.error?.message || 'Failed to get AI response',
      });
    }

    const aiResponse = await openRouterResponse.json();
    const aiMessage = aiResponse.choices?.[0]?.message?.content;

    if (!aiMessage) {
      return res.status(500).json({
        success: false,
        error: 'No response from AI',
      });
    }

    // Parse AI response
    let parsedResponse;
    try {
      // Try to extract JSON from response (might be wrapped in markdown)
      const jsonMatch = aiMessage.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
      } else {
        parsedResponse = JSON.parse(aiMessage);
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiMessage);
      return res.status(500).json({
        success: false,
        error: 'Failed to parse AI response. Please try again.',
      });
    }

    // Build response
    const filePath = currentFile?.path || 'index.ts';
    const originalContent = currentFile?.content || fs.readFileSync(path.join(doorPath, 'index.ts'), 'utf8');

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
  const requestStartTime = Date.now();
  console.log(`\n========== /api/games/generate-stream REQUEST RECEIVED ==========`);
  console.log(`[API] Timestamp: ${new Date().toISOString()}`);

  try {
    const { name, description, bbsCommand, type, features, provider = 'claude', model, apiKey, qualityMode = 'balanced' } = req.body;

    console.log(`[API] Request params:`, { name, provider, model, qualityMode, hasApiKey: !!apiKey });

    if (!name || !description) {
      console.error(`[API] Missing required fields`);
      return res.status(400).json({ error: 'Name and description are required' });
    }

    console.log(`🎮 Generating game: ${name} (${provider}/${model})`);

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

      // Strip :free suffix for the API call (it's metadata, not part of the model ID)
      let modelForApi = (model || 'meta-llama/llama-4-maverick:free').replace(/:free$/, '');

      // Capitalization mapping for models where providers expect specific casing
      const capitalizationMap = {
        'agentica-org/deepcoder-14b-preview': 'agentica-org/DeepCoder-14B-Preview',
      };

      // Apply capitalization fix if needed (case-insensitive lookup)
      const modelLower = modelForApi.toLowerCase();
      if (capitalizationMap[modelLower]) {
        const originalModel = modelForApi;
        modelForApi = capitalizationMap[modelLower];
        console.log(`[OpenRouter] Applied capitalization fix: "${originalModel}" -> "${modelForApi}"`);
      }

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
        console.log(`[OpenRouter] 🚀 Initiating fetch to https://openrouter.ai/api/v1/chat/completions...`);
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
        console.log(`[OpenRouter] ✅ Fetch completed in ${fetchDuration}ms`);
        clearTimeout(timeoutId);
      } catch (error) {
        const fetchDuration = Date.now() - fetchStartTime;
        clearTimeout(timeoutId);
        console.error(`[OpenRouter] ❌ Fetch error after ${fetchDuration}ms:`, error);
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

/**
 * Helper to log to both console and browser terminal
 *
 * ALWAYS sends logs to browser terminal for debugging
 * Only logs to console if DEBUG_OUTPUT is enabled (or if it's an error)
 */
function debugLog(clientOrId, message, level = 'log') {
  // Log to console if DEBUG_OUTPUT is enabled or if it's an error
  if (DEBUG_OUTPUT || level === 'error') {
    const consoleMethod = level === 'error' ? console.error : console.log;
    consoleMethod(message);
  }

  // ALWAYS send to browser if client provided (for debugging in browser)
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
    } else if (message.includes('⚠️') || message.includes('WARNING')) {
      color = '\x1b[33m'; // Yellow
    } else if (message.includes('📨') || message.includes('📤') || message.includes('➡️')) {
      color = '\x1b[36m'; // Cyan
    } else if (message.includes('🚀') || message.includes('🛑')) {
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
  debugLog(clientId, `📨 [WS MESSAGE] Received from client ${clientId}:`);
  debugLog(clientId, `   Type: ${data.type}`);
  debugLog(clientId, `   Data: ${JSON.stringify(data).substring(0, 200)}`);

  const client = clients.get(clientId);
  if (!client) {
    debugLog(clientId, `❌ [WS MESSAGE] Client ${clientId} not found`, 'error');
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
    debugLog(clientId, `🔧 [CLIENT DOOR RPC] Request: ${data.method}`);
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
    debugLog(clientId, `📦 [DOOR MESSAGE] Unwrapping door message, event: ${data.event}`);

    // Extract the inner message from the wrapped format
    // Structure: { type: 'door-message', event: 'door:client:message', data: { sessionId, message } }
    const innerMessage = data.data?.message;

    if (innerMessage) {
      debugLog(clientId, `   ➡️  Inner message type: ${innerMessage.type}`);
      // Recursively handle the unwrapped message
      handleClientMessage(clientId, innerMessage);
    } else {
      debugLog(clientId, `   ⚠️  No inner message found in door-message wrapper`, 'error');
    }
  } else {
    debugLog(clientId, `⚠️  [WS MESSAGE] Unknown message type: ${data.type}`);
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
 * Start a CLIENT door (runs in browser)
 */
async function startClientDoor(clientId, doorId, doorPath) {
  const client = clients.get(clientId);
  if (!client) return;

  debugLog(clientId, `📦 [CLIENT DOOR] Bundling ${doorId} for browser...`);

  try {
    // Bundle with esbuild for browser
    const esbuild = require('esbuild');
    const entryFile = path.join(doorPath, 'index.ts');

    if (!fs.existsSync(entryFile)) {
      throw new Error(`Entry file not found: ${entryFile}`);
    }

    const outfile = path.join(doorPath, '.preview-bundle.js');

    debugLog(clientId, `🔨 [CLIENT DOOR] Building bundle...`);
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
        'global': 'window',
      },
      // Mark Node.js built-ins as external (they'll be replaced with empty objects)
      external: [],
      // Use esbuild plugins to handle Node.js built-ins
      plugins: [{
        name: 'node-builtins-browser',
        setup(build) {
          // Intercept imports of Node.js built-ins and provide empty shims
          const nodeBuiltins = ['fs', 'path', 'os', 'crypto', 'stream', 'util', 'events', 'buffer'];
          nodeBuiltins.forEach(mod => {
            build.onResolve({ filter: new RegExp(`^${mod}$`) }, args => ({
              path: args.path,
              namespace: 'node-builtin-shim',
            }));
            build.onLoad({ filter: /.*/, namespace: 'node-builtin-shim' }, () => ({
              contents: 'export default {}; export const __esModule = true;',
              loader: 'js',
            }));
          });
        },
      }],
    });

    debugLog(clientId, `✅ [CLIENT DOOR] Bundle created: ${outfile}`);

    // Read the bundled code
    const bundledCode = fs.readFileSync(outfile, 'utf8');

    // Send bundle to client for execution in browser
    debugLog(clientId, `📤 [CLIENT DOOR] Sending bundle to browser (${bundledCode.length} bytes)`);
    client.ws.send(JSON.stringify({
      type: 'client-door-bundle',
      doorId,
      code: bundledCode,
    }));

    debugLog(clientId, `✅ [CLIENT DOOR] Bundle sent to browser, door will execute there`);

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
    debugLog(clientId, `❌ [CLIENT DOOR] Bundling failed: ${err.message}`, 'error');
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
  debugLog(clientId, `🚀 [START DOOR] Called for clientId=${clientId}, doorId="${doorId}"`);
  debugLog(clientId, `${'='.repeat(80)}`);

  const client = clients.get(clientId);
  if (!client) {
    debugLog(clientId, `❌ [START DOOR] Client ${clientId} not found in clients map`, 'error');
    return;
  }
  debugLog(clientId, `✓ [START DOOR] Client ${clientId} found`);

  // Stop existing door
  if (client.doorProcess) {
    debugLog(clientId, `⚠️  [START DOOR] Existing door process found (PID: ${client.doorProcess.pid}), killing it...`);
    client.doorProcess.kill();
  }

  const doorPath = path.join(__dirname, '../../examples', doorId);
  debugLog(clientId, `📂 [START DOOR] Door path: ${doorPath}`);
  debugLog(clientId, `📂 [START DOOR] Door path exists: ${fs.existsSync(doorPath)}`);

  // Check door runtime type from package.json
  const pkgPath = path.join(doorPath, 'package.json');
  let runtime = 'server'; // Default to server runtime

  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      runtime = pkg.runtime || 'server';
      debugLog(clientId, `📦 [START DOOR] Runtime type: ${runtime}`);
    } catch (err) {
      debugLog(clientId, `⚠️  [START DOOR] Could not read package.json, assuming server runtime`, 'warn');
    }
  }

  // Handle client doors differently
  if (runtime === 'client') {
    debugLog(clientId, `🌐 [START DOOR] CLIENT DOOR detected - bundling for browser...`);
    startClientDoor(clientId, doorId, doorPath);
    return;
  }

  // Server door: continue with Node.js execution
  debugLog(clientId, `🖥️  [START DOOR] SERVER DOOR detected - spawning Node.js process...`);

  // Check for TypeScript or JavaScript
  const tsFile = path.join(doorPath, 'index.ts');
  const jsFile = path.join(doorPath, 'index.js');
  const distFile = path.join(doorPath, 'dist', 'index.js');

  debugLog(clientId, `🔍 [START DOOR] Checking for entry files...`);
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
    debugLog(clientId, `❌ [START DOOR] No entry file found!`, 'error');
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

  debugLog(clientId, `🔧 [START DOOR] Command: ${command}`);
  debugLog(clientId, `🔧 [START DOOR] Args: ${JSON.stringify(args)}`);
  debugLog(clientId, `🔧 [START DOOR] CWD: ${doorPath}`);
  debugLog(clientId, `🔧 [START DOOR] Environment: PREVIEW_MODE=1`);

  const doorProcess = spawn(command, args, {
    cwd: doorPath,
    env: { ...process.env, PREVIEW_MODE: '1' },
    stdio: ['pipe', 'pipe', 'pipe'], // Explicitly pipe stdin, stdout, stderr
  });

  debugLog(clientId, `✓ [START DOOR] Process spawned with PID: ${doorProcess.pid}`);

  client.doorProcess = doorProcess;
  client.currentDoor = doorId;
  debugLog(clientId, `✓ [START DOOR] Client state updated (currentDoor="${doorId}")`);

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

  // Handle process errors
  doorProcess.on('error', (error) => {
    debugLog(clientId, `\n${'='.repeat(80)}`, 'error');
    debugLog(clientId, `❌ [PROCESS ERROR] Door process error`, 'error');
    debugLog(clientId, `   Door: ${doorId}`, 'error');
    debugLog(clientId, `   Error: ${error.message}`, 'error');
    debugLog(clientId, `   Stack: ${error.stack}`, 'error');
    debugLog(clientId, `${'='.repeat(80)}\n`, 'error');

    client.ws.send(
      JSON.stringify({
        type: 'error',
        message: `Process error: ${error.message}`,
      })
    );
  });

  // Watch for file changes (hot reload)
  const watchPattern = path.join(doorPath, '**/*.{ts,js}');
  debugLog(clientId, `👁️  [WATCH] Setting up file watcher for: ${watchPattern}`);

  const watcher = chokidar.watch(watchPattern, {
    ignored: /node_modules/,
    persistent: true,
  });

  watcher.on('change', (filePath) => {
    debugLog(clientId, `📝 [WATCH] File changed: ${filePath}`);
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
    debugLog(clientId, `❌ [WATCH] Watcher error: ${error.message}`, 'error');
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
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║   🎮  AmiExpress BBS Door Preview Server                       ║
║                                                                ║
║   Server running at: http://localhost:${PORT}                     ║
║                                                                ║
║   Features:                                                    ║
║   ✓ Live ANSI rendering                                        ║
║   ✓ Real-time keyboard input                                   ║
║   ✓ Hot reload on file changes                                 ║
║   ✓ Debug console                                              ║
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
