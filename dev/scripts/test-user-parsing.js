const http = require('http');
const fs = require('fs');
const FormData = require('form-data');

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
            reject(new Error('No accessToken in response: ' + data));
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

// Step 2: Upload archive
function upload(token) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync('/tmp/reference-boardbbs-test.zip')) {
      reject(new Error('Archive not found at /tmp/reference-boardbbs-test.zip'));
      return;
    }

    const form = new FormData();
    form.append('archive', fs.createReadStream('/tmp/reference-boardbbs-test.zip'));

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
            console.log('[OK] Upload successful');
            console.log('    Session ID:', json.sessionId);
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

// Step 3: Validate
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
            console.log('[OK] Validation successful');
            console.log('');
            console.log('Summary:');
            console.log('  Users:       ', json.summary.users);
            console.log('  Conferences: ', json.summary.conferences);
            console.log('  Commands:    ', json.summary.commands);
            console.log('  Nodes:       ', json.summary.nodes);
            resolve(json);
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

// Run test
(async () => {
  try {
    console.log('Testing user binary parsing...');
    console.log('');

    const token = await login();
    const uploadResult = await upload(token);
    await validate(uploadResult);

    console.log('');
    console.log('[SUCCESS] User binary parsing test complete!');
    console.log('Check backend logs for detailed parsing output');
  } catch (err) {
    console.error('[ERROR]', err.message);
    process.exit(1);
  }
})();
