const http = require('http');

// Get session ID from command line or use the last one
const sessionId = process.argv[2] || '8da00a0e-6ce6-4995-b9a3-41e22c7ceee4';

// Step 1: Login
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
            console.log('[OK] Login successful');
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

// Step 2: Execute import
function executeImport(token, sessionId, strategy = 'skip') {
  return new Promise((resolve, reject) => {
    const importData = JSON.stringify({
      strategy,
      options: {
        importUsers: true,
        importConferences: true,
        importCommands: true,
        importNodes: true
      }
    });

    console.log('');
    console.log('[INFO] Executing import...');
    console.log('       Session:', sessionId);
    console.log('       Strategy:', strategy);

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
            console.log('[OK] Import execution started');
            resolve({ token, sessionId });
          } else {
            console.log('[ERROR] Import failed:', json.message || 'Unknown error');
            if (json.errors) {
              console.log('[ERROR] Errors:', JSON.stringify(json.errors, null, 2));
            }
            reject(new Error('Import execution failed: ' + JSON.stringify(json)));
          }
        } catch (err) {
          console.log('[ERROR] Parse error:', err.message);
          console.log('[ERROR] Response:', data);
          reject(err);
        }
      });
    });

    req.on('error', (err) => {
      console.log('[ERROR] Request error:', err.message);
      reject(err);
    });
    req.write(importData);
    req.end();
  });
}

// Step 3: Get import status
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
            console.log('');
            console.log('[OK] Import status retrieved');
            console.log('');
            console.log('Status:', json.session.status);
            console.log('Progress:', json.session.progress + '%');

            if (json.session.result) {
              console.log('');
              console.log('Results:');
              console.log('  Users imported:       ', json.session.result.usersImported || 0);
              console.log('  Conferences imported: ', json.session.result.conferencesImported || 0);
              console.log('  Commands imported:    ', json.session.result.commandsImported || 0);
              console.log('  Nodes imported:       ', json.session.result.nodesImported || 0);
            }

            if (json.session.errors && json.session.errors.length > 0) {
              console.log('');
              console.log('Errors:', json.session.errors.length);
              json.session.errors.slice(0, 5).forEach((err, i) => {
                console.log(`  ${i + 1}. ${err}`);
              });
            }

            resolve(json);
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

// Run test
(async () => {
  try {
    console.log('Testing import execution...');
    console.log('');

    const token = await login();

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 500));

    const executeResult = await executeImport(token, sessionId, 'skip');

    // Wait for import to process
    console.log('');
    console.log('[INFO] Waiting for import to complete...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    await getStatus(executeResult);

    console.log('');
    console.log('[SUCCESS] Import execution test complete!');
  } catch (err) {
    console.error('[ERROR]', err.message);
    process.exit(1);
  }
})();
