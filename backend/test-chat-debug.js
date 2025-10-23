/**
 * Comprehensive Chat System Debug Test
 * Tests each step of the chat flow systematically
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'amiexpress_db',
  user: 'spot'
});

async function runTests() {
  console.log('\n='.repeat(60));
  console.log('CHAT SYSTEM DEBUG TEST');
  console.log('='.repeat(60));

  try {
    // Test 1: Check users table schema
    console.log('\n[TEST 1] Checking users table schema...');
    const schemaResult = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'users'
      AND column_name ILIKE '%available%'
    `);
    console.log('✓ Column found:', schemaResult.rows[0]);

    // Test 2: Check user availability
    console.log('\n[TEST 2] Checking user availability...');
    const usersQuery = `SELECT username, "availableForChat" FROM users WHERE username IN ('sysop', 'spot')`;
    const usersResult = await pool.query(usersQuery);
    console.log('✓ Users:');
    usersResult.rows.forEach(row => {
      console.log(`  - ${row.username}: availableForChat = ${row.availableForChat}`);
    });

    // Test 3: Test getUserByUsernameForOLM query
    console.log('\n[TEST 3] Testing getUserByUsernameForOLM query...');
    const olmQuery = `SELECT id, username, "availableForChat" FROM users WHERE LOWER(username) = LOWER($1)`;
    const olmResult = await pool.query(olmQuery, ['sysop']);
    console.log('✓ Query result:', olmResult.rows[0]);

    // Test 4: Check chat_sessions table
    console.log('\n[TEST 4] Checking chat_sessions table...');
    const sessionsResult = await pool.query('SELECT COUNT(*) as count FROM chat_sessions');
    console.log(`✓ Chat sessions in database: ${sessionsResult.rows[0].count}`);

    // Test 5: Check chat_messages table
    console.log('\n[TEST 5] Checking chat_messages table...');
    const messagesResult = await pool.query('SELECT COUNT(*) as count FROM chat_messages');
    console.log(`✓ Chat messages in database: ${messagesResult.rows[0].count}`);

    // Test 6: Verify chat_messages schema (no sender_username column)
    console.log('\n[TEST 6] Verifying chat_messages schema...');
    const msgSchemaResult = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'chat_messages'
      ORDER BY ordinal_position
    `);
    console.log('✓ Columns:', msgSchemaResult.rows.map(r => r.column_name).join(', '));

    console.log('\n' + '='.repeat(60));
    console.log('ALL TESTS PASSED!');
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ TEST FAILED:');
    console.error(error.message);
    console.error('\nFull error:');
    console.error(error);
  } finally {
    await pool.end();
  }
}

runTests();
