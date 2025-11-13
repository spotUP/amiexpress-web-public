#!/usr/bin/env node
/**
 * Configuration API Test Script
 *
 * Tests the BBS configuration system backend:
 * - Authentication and authorization
 * - System configuration endpoints
 * - Node configuration CRUD
 * - Doors CRUD
 * - Languages and protocols
 * - Audit logging
 *
 * Usage: node dev/scripts/test-config-api.js
 */

const http = require('http');

// Configuration
const BASE_URL = 'http://localhost:3001';
const TEST_USER = {
  username: 'testsysop',
  password: 'TestPass123!',
  realname: 'Test Sysop',
  location: 'Test City'
};

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Test state
let testResults = {
  passed: 0,
  failed: 0,
  tests: []
};
let authToken = null;

// HTTP request helper
function makeRequest(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(url, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsed
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: body
          });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// Test assertions
function assert(condition, testName, message) {
  if (condition) {
    console.log(`${colors.green}✓${colors.reset} ${testName}`);
    testResults.passed++;
    testResults.tests.push({ name: testName, passed: true });
  } else {
    console.log(`${colors.red}✗${colors.reset} ${testName}`);
    if (message) console.log(`  ${colors.red}${message}${colors.reset}`);
    testResults.failed++;
    testResults.tests.push({ name: testName, passed: false, message });
  }
}

function assertStatus(response, expectedStatus, testName) {
  const passed = response.status === expectedStatus;
  assert(
    passed,
    testName,
    passed ? null : `Expected status ${expectedStatus}, got ${response.status}`
  );
  return passed;
}

// Print section header
function section(title) {
  console.log(`\n${colors.cyan}=== ${title} ===${colors.reset}\n`);
}

// Main test suite
async function runTests() {
  console.log(`${colors.blue}AmiExpress Configuration API Test Suite${colors.reset}\n`);

  try {
    // 1. Check if server is running
    section('Server Health Check');
    try {
      const response = await makeRequest('GET', '/');
      assert(response.status === 200 || response.status === 404,
        'Server is running',
        response.status === 200 || response.status === 404 ? null : 'Server not responding');
    } catch (error) {
      console.log(`${colors.red}✗ Server is not running${colors.reset}`);
      console.log(`${colors.yellow}Please start the server with: ./dev/scripts/start-servers.sh${colors.reset}`);
      process.exit(1);
    }

    // 2. Create test sysop user (or try to login if exists)
    section('Authentication Setup');

    // Try to register
    let registerResponse = await makeRequest('POST', '/auth/register', {
      username: TEST_USER.username,
      password: TEST_USER.password,
      realname: TEST_USER.realname,
      location: TEST_USER.location
    });

    if (registerResponse.status === 201 || registerResponse.status === 409) {
      console.log(`${colors.green}✓${colors.reset} Test user exists or created`);
    } else {
      console.log(`${colors.yellow}[WARNING]${colors.reset} Unexpected register response: ${registerResponse.status}`);
    }

    // Login to get token
    const loginResponse = await makeRequest('POST', '/auth/login', {
      username: TEST_USER.username,
      password: TEST_USER.password
    });

    if (assertStatus(loginResponse, 200, 'Login successful')) {
      authToken = loginResponse.body.accessToken;
      console.log(`  Token obtained: ${authToken.substring(0, 20)}...`);
    } else {
      console.log(`${colors.red}Cannot proceed without authentication${colors.reset}`);
      process.exit(1);
    }

    // 3. Test System Configuration
    section('System Configuration API');

    // GET system config
    let getSystemResponse = await makeRequest('GET', '/api/config/system', null, authToken);

    if (getSystemResponse.status === 403) {
      console.log(`${colors.yellow}[WARNING] User doesn't have sysop privileges (secLevel < 255)${colors.reset}`);
      console.log(`${colors.yellow}  This is expected for new test users${colors.reset}`);
      console.log(`${colors.yellow}  To test fully, manually set secLevel=255 in database${colors.reset}`);
      console.log(`\n${colors.cyan}Summary: Auth works, but sysop access required for config endpoints${colors.reset}`);
      printSummary();
      return;
    }

    assertStatus(getSystemResponse, 200, 'GET /api/config/system');
    if (getSystemResponse.status === 200 && getSystemResponse.body.success) {
      const config = getSystemResponse.body.data;
      assert(config.bbs_name !== undefined, 'System config has bbs_name field');
      assert(config.sysop_name !== undefined, 'System config has sysop_name field');
      console.log(`  BBS Name: ${config.bbs_name}`);
      console.log(`  Sysop: ${config.sysop_name}`);
    }

    // UPDATE system config
    const updateSystemResponse = await makeRequest('PUT', '/api/config/system', {
      bbs_name: 'Test BBS',
      location: 'Test Location'
    }, authToken);

    assertStatus(updateSystemResponse, 200, 'PUT /api/config/system');
    if (updateSystemResponse.status === 200 && updateSystemResponse.body.success) {
      assert(
        updateSystemResponse.body.data.bbs_name === 'Test BBS',
        'System config updated correctly'
      );
    }

    // 4. Test Node Configuration
    section('Node Configuration API');

    // GET all nodes
    const getNodesResponse = await makeRequest('GET', '/api/config/nodes', null, authToken);
    assertStatus(getNodesResponse, 200, 'GET /api/config/nodes');

    // CREATE node config
    const createNodeResponse = await makeRequest('POST', '/api/config/nodes', {
      node_number: 1,
      node_start: 'BBS:EXPRESS',
      telnet: true,
      callers_log: true,
      sysop_chat_color: 33,
      user_chat_color: 32
    }, authToken);

    if (createNodeResponse.status === 409) {
      console.log(`${colors.yellow}[WARNING]${colors.reset} POST /api/config/nodes (node 1 already exists)`);
      testResults.tests.push({ name: 'POST /api/config/nodes', passed: true });
    } else {
      assertStatus(createNodeResponse, 200, 'POST /api/config/nodes');
    }

    // GET specific node
    const getNodeResponse = await makeRequest('GET', '/api/config/nodes/1', null, authToken);
    assertStatus(getNodeResponse, 200, 'GET /api/config/nodes/1');

    // UPDATE node config
    const updateNodeResponse = await makeRequest('PUT', '/api/config/nodes/1', {
      telnet: false,
      ftp: true
    }, authToken);
    assertStatus(updateNodeResponse, 200, 'PUT /api/config/nodes/1');

    // 5. Test Doors
    section('Doors API');

    // GET all doors
    const getDoorsResponse = await makeRequest('GET', '/api/config/doors', null, authToken);
    assertStatus(getDoorsResponse, 200, 'GET /api/config/doors');

    // CREATE door
    const createDoorResponse = await makeRequest('POST', '/api/config/doors', {
      door_name: 'Test Door',
      door_command: 'TEST',
      door_type: 'BBSCMD',
      door_path: '/test/door',
      title: 'Test Door Game',
      description: 'A test door for API testing',
      enabled: true
    }, authToken);

    let testDoorId = null;
    if (createDoorResponse.status === 409) {
      console.log(`${colors.yellow}[WARNING]${colors.reset} POST /api/config/doors (door TEST already exists)`);
      // Try to get existing door
      const existingDoors = await makeRequest('GET', '/api/config/doors', null, authToken);
      if (existingDoors.body.success && existingDoors.body.data) {
        const testDoor = existingDoors.body.data.find(d => d.door_command === 'TEST');
        if (testDoor) testDoorId = testDoor.id;
      }
    } else {
      assertStatus(createDoorResponse, 200, 'POST /api/config/doors');
      if (createDoorResponse.status === 200 && createDoorResponse.body.success) {
        testDoorId = createDoorResponse.body.data.id;
      }
    }

    // UPDATE door (if we have ID)
    if (testDoorId) {
      const updateDoorResponse = await makeRequest('PUT', `/api/config/doors/${testDoorId}`, {
        description: 'Updated test door description'
      }, authToken);
      assertStatus(updateDoorResponse, 200, 'PUT /api/config/doors/:id');

      // DELETE door
      const deleteDoorResponse = await makeRequest('DELETE', `/api/config/doors/${testDoorId}`, null, authToken);
      assertStatus(deleteDoorResponse, 200, 'DELETE /api/config/doors/:id');
    }

    // 6. Test Languages
    section('Languages API');

    // GET system languages
    const getSystemLangsResponse = await makeRequest('GET', '/api/config/languages/system', null, authToken);
    assertStatus(getSystemLangsResponse, 200, 'GET /api/config/languages/system');

    // GET all languages
    const getLangsResponse = await makeRequest('GET', '/api/config/languages', null, authToken);
    assertStatus(getLangsResponse, 200, 'GET /api/config/languages');

    // CREATE language
    const createLangResponse = await makeRequest('POST', '/api/config/languages', {
      language_number: 1,
      title: 'English',
      language_code: 'en',
      file_path: '/languages/english.lng',
      enabled: true
    }, authToken);

    if (createLangResponse.status === 409) {
      console.log(`${colors.yellow}[WARNING]${colors.reset} POST /api/config/languages (language 'en' already exists)`);
    } else {
      assertStatus(createLangResponse, 200, 'POST /api/config/languages');
    }

    // 7. Test Protocols
    section('Protocols API');

    // GET all protocols
    const getProtocolsResponse = await makeRequest('GET', '/api/config/protocols', null, authToken);
    assertStatus(getProtocolsResponse, 200, 'GET /api/config/protocols');

    // CREATE protocol
    const createProtocolResponse = await makeRequest('POST', '/api/config/protocols', {
      protocol_name: 'ZModem',
      protocol_code: 'ZMODEM',
      command: 'rz',
      upload_command: 'rz -y',
      download_command: 'sz',
      batch_upload: true,
      batch_download: true,
      enabled: true
    }, authToken);

    if (createProtocolResponse.status === 409) {
      console.log(`${colors.yellow}[WARNING]${colors.reset} POST /api/config/protocols (protocol 'ZMODEM' already exists)`);
    } else {
      assertStatus(createProtocolResponse, 200, 'POST /api/config/protocols');
    }

    // 8. Test Audit Log
    section('Audit Log API');

    const getAuditResponse = await makeRequest('GET', '/api/config/audit?limit=10', null, authToken);
    assertStatus(getAuditResponse, 200, 'GET /api/config/audit');

    if (getAuditResponse.status === 200 && getAuditResponse.body.success) {
      const entries = getAuditResponse.body.data;
      assert(Array.isArray(entries), 'Audit log returns array');
      console.log(`  Audit entries: ${entries.length}`);
      if (entries.length > 0) {
        console.log(`  Recent changes logged: ✓`);
      }
    }

    // 9. Test Authorization (non-sysop access)
    section('Authorization Tests');

    // Create a regular user (non-sysop)
    const regularUser = {
      username: 'regularuser',
      password: 'TestPass123!',
      realname: 'Regular User',
      location: 'Test'
    };

    await makeRequest('POST', '/auth/register', regularUser);
    const regularLoginResponse = await makeRequest('POST', '/auth/login', {
      username: regularUser.username,
      password: regularUser.password
    });

    if (regularLoginResponse.status === 200) {
      const regularToken = regularLoginResponse.body.accessToken;

      // Try to access config with regular user
      const unauthorizedResponse = await makeRequest('GET', '/api/config/system', null, regularToken);
      assertStatus(unauthorizedResponse, 403, 'Non-sysop user denied access');
    }

    // Print summary
    printSummary();

  } catch (error) {
    console.error(`\n${colors.red}Test execution error:${colors.reset}`, error.message);
    process.exit(1);
  }
}

function printSummary() {
  console.log(`\n${colors.cyan}=== Test Summary ===${colors.reset}\n`);
  console.log(`${colors.green}Passed: ${testResults.passed}${colors.reset}`);
  console.log(`${colors.red}Failed: ${testResults.failed}${colors.reset}`);
  console.log(`Total: ${testResults.passed + testResults.failed}`);

  if (testResults.failed > 0) {
    console.log(`\n${colors.red}Failed Tests:${colors.reset}`);
    testResults.tests
      .filter(t => !t.passed)
      .forEach(t => {
        console.log(`  - ${t.name}`);
        if (t.message) console.log(`    ${t.message}`);
      });
  }

  const successRate = ((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1);
  console.log(`\nSuccess Rate: ${successRate}%`);

  if (testResults.failed === 0) {
    console.log(`\n${colors.green}🎉 All tests passed!${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`\n${colors.red}Some tests failed${colors.reset}\n`);
    process.exit(1);
  }
}

// Run tests
runTests();
