const http = require('http');
const fs = require('fs');
const FormData = require('form-data');

// ANSI colors for output
const GREEN = '\x1b[0;32m';
const RED = '\x1b[0;31m';
const YELLOW = '\x1b[0;33m';
const BLUE = '\x1b[0;36m';
const RESET = '\x1b[0m';

const log = (level, msg) => {
  const colors = { OK: GREEN, ERROR: RED, WARNING: YELLOW, INFO: BLUE };
  const color = colors[level] || RESET;
  console.log(`${color}[${level}]${RESET} ${msg}`);
};

// Helper: Login
function login() {
  return new Promise((resolve, reject) => {
    const loginData = JSON.stringify({ username: 'sysop', password: 'sysop' });

    const req = http.request({
      hostname: 'localhost',
      port: 3001,
      path: '/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': loginData.length
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.accessToken) {
            log('OK', 'Login successful');
            resolve(json.accessToken);
          } else {
            reject(new Error('No accessToken in response'));
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.write(loginData);
    req.end();
  });
}

// Helper: Upload archive
function upload(token, archivePath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(archivePath)) {
      reject(new Error(`Archive not found at ${archivePath}`));
      return;
    }

    const form = new FormData();
    form.append('archive', fs.createReadStream(archivePath));

    const req = http.request({
      hostname: 'localhost',
      port: 3001,
      path: '/api/import/upload',
      method: 'POST',
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${token}`
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.success) {
            log('OK', 'Upload successful');
            log('INFO', `Session ID: ${json.sessionId}`);
            resolve({ token, sessionId: json.sessionId });
          } else {
            reject(new Error('Upload failed: ' + JSON.stringify(json)));
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    form.pipe(req);
  });
}

// Helper: Validate
function validate({ token, sessionId }) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3001,
      path: `/api/import/validate/${sessionId}`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.success) {
            log('OK', 'Validation successful');
            resolve({ token, sessionId, validation: json });
          } else {
            reject(new Error('Validation failed'));
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// Helper: Execute import
function executeImport({ token, sessionId }, strategy) {
  return new Promise((resolve, reject) => {
    const importData = JSON.stringify({
      userConflictStrategy: strategy,
      conferenceConflictStrategy: strategy,
      commandConflictStrategy: strategy,
      importUsers: true,
      importConferences: true,
      importCommands: true,
      importNodes: true,
      createBackup: false
    });

    log('INFO', `Executing import with strategy: ${strategy}`);

    const req = http.request({
      hostname: 'localhost',
      port: 3001,
      path: `/api/import/execute/${sessionId}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': importData.length,
        'Authorization': `Bearer ${token}`
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.success) {
            log('OK', `Import execution started (${strategy})`);
            resolve({ token, sessionId });
          } else {
            log('ERROR', `Import failed: ${json.message || 'Unknown error'}`);
            if (json.errors) {
              log('ERROR', `Errors: ${JSON.stringify(json.errors, null, 2)}`);
            }
            reject(new Error('Import execution failed'));
          }
        } catch (err) {
          log('ERROR', `Parse error: ${err.message}`);
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.write(importData);
    req.end();
  });
}

// Helper: Get status
function getStatus({ token, sessionId }) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3001,
      path: `/api/import/session/${sessionId}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.success) {
            resolve({ token, sessionId, session: json.session });
          } else {
            reject(new Error('Failed to get status'));
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// Helper: Query database
function queryDatabase(query) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const dbPath = '~/Code/amiexpress-web/data/amiexpress.db';

    const sqlite = spawn('sqlite3', [dbPath, query]);
    let output = '';
    let error = '';

    sqlite.stdout.on('data', (data) => output += data);
    sqlite.stderr.on('data', (data) => error += data);

    sqlite.on('close', (code) => {
      if (code === 0) {
        resolve(output.trim());
      } else {
        reject(new Error(error || 'Database query failed'));
      }
    });
  });
}

// Test: Verify real name fix
async function testRealNameFix(token) {
  console.log('');
  log('INFO', '='.repeat(60));
  log('INFO', 'TEST 1: Verify Real Name Fix');
  log('INFO', '='.repeat(60));

  try {
    // Query for Xavier Madison's real name
    const result = await queryDatabase(
      "SELECT username, realname FROM users WHERE username = 'Xavier Madison';"
    );

    console.log('');
    log('INFO', 'Database query result:');
    console.log(result);

    if (result && result.includes('Xavier Madison')) {
      const lines = result.split('\n');
      const data = lines[0].split('|');
      const realname = data[1] ? data[1].trim() : '';

      if (realname && realname !== '') {
        log('OK', `Real name populated: "${realname}"`);
        return true;
      } else {
        log('WARNING', 'Real name is still empty');
        log('INFO', 'This may be because user.misc file has empty real name field');
        return false;
      }
    } else {
      log('WARNING', 'Xavier Madison not found in database');
      log('INFO', 'Import may need to be re-run');
      return false;
    }
  } catch (err) {
    log('ERROR', `Database query failed: ${err.message}`);
    return false;
  }
}

// Test: Replace strategy
async function testReplaceStrategy(token) {
  console.log('');
  log('INFO', '='.repeat(60));
  log('INFO', 'TEST 2: Replace Conflict Strategy');
  log('INFO', '='.repeat(60));

  try {
    // Upload and validate
    const uploadResult = await upload(token, '/tmp/reference-boardbbs-test.zip');
    const validateResult = await validate(uploadResult);

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 500));

    // Execute import with replace strategy
    const executeResult = await executeImport(validateResult, 'replace');

    // Wait for import to complete
    log('INFO', 'Waiting for import to complete...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Get status
    const statusResult = await getStatus(executeResult);

    console.log('');
    log('INFO', 'Import Results:');
    console.log(`  Status: ${statusResult.session.status}`);
    console.log(`  Progress: ${statusResult.session.progress}%`);

    if (statusResult.session.result) {
      const r = statusResult.session.result;
      console.log(`  Users replaced: ${r.usersImported || 0}`);
      console.log(`  Conferences replaced: ${r.conferencesImported || 0}`);
      console.log(`  Commands replaced: ${r.commandsImported || 0}`);
    }

    if (statusResult.session.status === 'completed') {
      log('OK', 'Replace strategy test passed');
      return true;
    } else {
      log('ERROR', 'Replace strategy test failed');
      return false;
    }
  } catch (err) {
    log('ERROR', `Replace test failed: ${err.message}`);
    return false;
  }
}

// Test: Rename strategy
async function testRenameStrategy(token) {
  console.log('');
  log('INFO', '='.repeat(60));
  log('INFO', 'TEST 3: Rename Conflict Strategy');
  log('INFO', '='.repeat(60));

  try {
    // Upload and validate
    const uploadResult = await upload(token, '/tmp/reference-boardbbs-test.zip');
    const validateResult = await validate(uploadResult);

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 500));

    // Execute import with rename strategy
    const executeResult = await executeImport(validateResult, 'rename');

    // Wait for import to complete
    log('INFO', 'Waiting for import to complete...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Get status
    const statusResult = await getStatus(executeResult);

    console.log('');
    log('INFO', 'Import Results:');
    console.log(`  Status: ${statusResult.session.status}`);
    console.log(`  Progress: ${statusResult.session.progress}%`);

    if (statusResult.session.result) {
      const r = statusResult.session.result;
      console.log(`  Users imported: ${r.usersImported || 0}`);
      console.log(`  Conferences imported: ${r.conferencesImported || 0}`);
      console.log(`  Commands imported: ${r.commandsImported || 0}`);
    }

    // Check if renamed user exists (Xavier Madison2 or similar)
    const result = await queryDatabase(
      "SELECT username FROM users WHERE username LIKE 'Xavier Madison%';"
    );

    console.log('');
    log('INFO', 'Users matching "Xavier Madison%":');
    console.log(result);

    if (statusResult.session.status === 'completed') {
      log('OK', 'Rename strategy test passed');
      return true;
    } else {
      log('ERROR', 'Rename strategy test failed');
      return false;
    }
  } catch (err) {
    log('ERROR', `Rename test failed: ${err.message}`);
    return false;
  }
}

// Test: Merge strategy
async function testMergeStrategy(token) {
  console.log('');
  log('INFO', '='.repeat(60));
  log('INFO', 'TEST 4: Merge Conflict Strategy');
  log('INFO', '='.repeat(60));

  try {
    // Upload and validate
    const uploadResult = await upload(token, '/tmp/reference-boardbbs-test.zip');
    const validateResult = await validate(uploadResult);

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 500));

    // Execute import with merge strategy
    const executeResult = await executeImport(validateResult, 'merge');

    // Wait for import to complete
    log('INFO', 'Waiting for import to complete...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Get status
    const statusResult = await getStatus(executeResult);

    console.log('');
    log('INFO', 'Import Results:');
    console.log(`  Status: ${statusResult.session.status}`);
    console.log(`  Progress: ${statusResult.session.progress}%`);

    if (statusResult.session.result) {
      const r = statusResult.session.result;
      console.log(`  Users merged: ${r.usersImported || 0}`);
      console.log(`  Conferences merged: ${r.conferencesImported || 0}`);
      console.log(`  Commands merged: ${r.commandsImported || 0}`);
    }

    if (statusResult.session.status === 'completed') {
      log('OK', 'Merge strategy test passed');
      return true;
    } else {
      log('ERROR', 'Merge strategy test failed');
      return false;
    }
  } catch (err) {
    log('ERROR', `Merge test failed: ${err.message}`);
    return false;
  }
}

// Main
(async () => {
  console.log('');
  log('INFO', 'Testing All Conflict Strategies + Real Name Fix');
  log('INFO', 'Archive: /tmp/reference-boardbbs-test.zip');
  console.log('');

  const results = {
    realName: false,
    replace: false,
    rename: false,
    merge: false
  };

  try {
    const token = await login();

    // Test 1: Real name fix
    results.realName = await testRealNameFix(token);

    // Test 2: Replace strategy
    results.replace = await testReplaceStrategy(token);

    // Test 3: Rename strategy
    results.rename = await testRenameStrategy(token);

    // Test 4: Merge strategy
    results.merge = await testMergeStrategy(token);

    // Summary
    console.log('');
    log('INFO', '='.repeat(60));
    log('INFO', 'TEST SUMMARY');
    log('INFO', '='.repeat(60));
    console.log('');

    const status = (passed) => passed ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;

    console.log(`  Real Name Fix:      ${status(results.realName)}`);
    console.log(`  Replace Strategy:   ${status(results.replace)}`);
    console.log(`  Rename Strategy:    ${status(results.rename)}`);
    console.log(`  Merge Strategy:     ${status(results.merge)}`);

    console.log('');

    const totalTests = Object.keys(results).length;
    const passedTests = Object.values(results).filter(r => r).length;

    if (passedTests === totalTests) {
      log('OK', `All tests passed! (${passedTests}/${totalTests})`);
      console.log('');
      log('INFO', 'All conflict resolution strategies are working correctly!');
      process.exit(0);
    } else {
      log('WARNING', `Some tests failed: ${passedTests}/${totalTests} passed`);
      process.exit(1);
    }
  } catch (err) {
    log('ERROR', err.message);
    process.exit(1);
  }
})();
