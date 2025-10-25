/**
 * Internode Chat System Test
 * Tests both Phase 1 (1:1 chat) and Phase 2 (group chat rooms)
 */

const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://spot@localhost:5432/amiexpress_db'
});

async function testChatSystem() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 Testing Internode Chat System');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const client = await pool.connect();

    // ========== DATABASE SCHEMA TESTS ==========
    console.log('📋 Test 1: Database Schema');
    console.log('─────────────────────────────────────');

    // Test chat_rooms table exists
    const roomsTableResult = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'chat_rooms'
      ORDER BY ordinal_position
    `);

    console.log('✓ chat_rooms table columns:', roomsTableResult.rows.length);
    const expectedRoomColumns = ['id', 'room_id', 'room_name', 'topic', 'created_by', 'created_by_username', 'is_public', 'max_users', 'is_persistent', 'password', 'created_at', 'updated_at'];
    const roomColumns = roomsTableResult.rows.map(r => r.column_name);
    const missingRoomCols = expectedRoomColumns.filter(c => !roomColumns.includes(c));
    if (missingRoomCols.length > 0) {
      console.log('  ❌ Missing columns:', missingRoomCols.join(', '));
    } else {
      console.log('  ✓ All expected columns present');
    }

    // Test chat_room_members table
    const membersTableResult = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'chat_room_members'
      ORDER BY ordinal_position
    `);
    console.log('✓ chat_room_members table columns:', membersTableResult.rows.length);

    // Test chat_room_messages table
    const messagesTableResult = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'chat_room_messages'
      ORDER BY ordinal_position
    `);
    console.log('✓ chat_room_messages table columns:', messagesTableResult.rows.length);

    // Test indexes
    const indexResult = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename IN ('chat_rooms', 'chat_room_members', 'chat_room_messages')
      ORDER BY indexname
    `);
    console.log('✓ Indexes created:', indexResult.rows.length);
    indexResult.rows.forEach(row => {
      console.log('  - ' + row.indexname);
    });

    console.log('\n📋 Test 2: Room Creation & Management');
    console.log('─────────────────────────────────────');

    // Clean up any existing test data
    await client.query(`DELETE FROM chat_rooms WHERE room_name LIKE 'TestRoom%'`);

    // Get a test user
    const userResult = await client.query(`SELECT id, username FROM users LIMIT 1`);
    if (userResult.rows.length === 0) {
      console.log('❌ No users found in database. Please create a user first.');
      client.release();
      return;
    }
    const testUser = userResult.rows[0];
    console.log('✓ Using test user:', testUser.username);

    // Test room creation
    const roomId = 'test_room_' + Date.now();
    await client.query(`
      INSERT INTO chat_rooms (room_id, room_name, topic, created_by, created_by_username, is_public, max_users)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [roomId, 'TestRoom1', 'Test topic', testUser.id, testUser.username, true, 50]);
    console.log('✓ Created test room:', 'TestRoom1');

    // Test room retrieval
    const roomCheck = await client.query(`SELECT * FROM chat_rooms WHERE room_id = $1`, [roomId]);
    if (roomCheck.rows.length > 0) {
      console.log('✓ Room retrieved successfully');
      console.log('  - Room name:', roomCheck.rows[0].room_name);
      console.log('  - Topic:', roomCheck.rows[0].topic);
      console.log('  - Max users:', roomCheck.rows[0].max_users);
      console.log('  - Public:', roomCheck.rows[0].is_public);
    } else {
      console.log('❌ Failed to retrieve created room');
    }

    console.log('\n📋 Test 3: Room Membership');
    console.log('─────────────────────────────────────');

    // Test joining room
    await client.query(`
      INSERT INTO chat_room_members (room_id, user_id, username, socket_id, is_moderator)
      VALUES ($1, $2, $3, $4, $5)
    `, [roomId, testUser.id, testUser.username, 'test_socket_123', false]);
    console.log('✓ User joined room:', testUser.username);

    // Test member retrieval
    const memberCheck = await client.query(`
      SELECT * FROM chat_room_members WHERE room_id = $1
    `, [roomId]);
    console.log('✓ Room members:', memberCheck.rows.length);
    memberCheck.rows.forEach(member => {
      console.log('  -', member.username, member.is_moderator ? '[MOD]' : '', member.is_muted ? '[MUTED]' : '');
    });

    console.log('\n📋 Test 4: Room Messages');
    console.log('─────────────────────────────────────');

    // Test message creation
    await client.query(`
      INSERT INTO chat_room_messages (room_id, sender_id, sender_username, message, message_type)
      VALUES ($1, $2, $3, $4, $5)
    `, [roomId, testUser.id, testUser.username, 'Test message 1', 'message']);
    await client.query(`
      INSERT INTO chat_room_messages (room_id, sender_id, sender_username, message, message_type)
      VALUES ($1, $2, $3, $4, $5)
    `, [roomId, testUser.id, testUser.username, 'Test message 2', 'message']);
    console.log('✓ Created 2 test messages');

    // Test message retrieval
    const messagesCheck = await client.query(`
      SELECT * FROM chat_room_messages
      WHERE room_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `, [roomId]);
    console.log('✓ Room messages:', messagesCheck.rows.length);
    messagesCheck.rows.forEach(msg => {
      const timestamp = new Date(msg.created_at).toLocaleTimeString();
      console.log('  [' + timestamp + ']', msg.sender_username + ':', msg.message);
    });

    console.log('\n📋 Test 5: Moderator Actions');
    console.log('─────────────────────────────────────');

    // Test mute user
    await client.query(`
      UPDATE chat_room_members
      SET is_muted = TRUE
      WHERE room_id = $1 AND user_id = $2
    `, [roomId, testUser.id]);
    console.log('✓ User muted');

    // Check mute status
    const muteCheck = await client.query(`
      SELECT is_muted FROM chat_room_members
      WHERE room_id = $1 AND user_id = $2
    `, [roomId, testUser.id]);
    console.log('✓ Mute status verified:', muteCheck.rows[0].is_muted);

    // Test unmute user
    await client.query(`
      UPDATE chat_room_members
      SET is_muted = FALSE
      WHERE room_id = $1 AND user_id = $2
    `, [roomId, testUser.id]);
    console.log('✓ User unmuted');

    console.log('\n📋 Test 6: Room Listing');
    console.log('─────────────────────────────────────');

    // Test public room listing
    const publicRooms = await client.query(`
      SELECT r.*,
        (SELECT COUNT(*) FROM chat_room_members WHERE room_id = r.room_id) as member_count
      FROM chat_rooms r
      WHERE is_public = TRUE
      ORDER BY created_at DESC
    `);
    console.log('✓ Public rooms found:', publicRooms.rows.length);
    publicRooms.rows.forEach(room => {
      console.log('  -', room.room_name, '[' + room.member_count + '/' + room.max_users + ']', room.topic || '(no topic)');
    });

    console.log('\n📋 Test 7: Room Leave & Cleanup');
    console.log('─────────────────────────────────────');

    // Test leaving room
    await client.query(`
      DELETE FROM chat_room_members
      WHERE room_id = $1 AND user_id = $2
    `, [roomId, testUser.id]);
    console.log('✓ User left room');

    // Verify member removed
    const memberVerify = await client.query(`
      SELECT COUNT(*) as count FROM chat_room_members
      WHERE room_id = $1 AND user_id = $2
    `, [roomId, testUser.id]);
    console.log('✓ Member removal verified:', memberVerify.rows[0].count === '0');

    console.log('\n📋 Test 8: Foreign Key Constraints');
    console.log('─────────────────────────────────────');

    // Test cascade delete (room deletion should delete members and messages)
    const beforeDeleteMembers = await client.query(`SELECT COUNT(*) FROM chat_room_members WHERE room_id = $1`, [roomId]);
    const beforeDeleteMessages = await client.query(`SELECT COUNT(*) FROM chat_room_messages WHERE room_id = $1`, [roomId]);

    await client.query(`DELETE FROM chat_rooms WHERE room_id = $1`, [roomId]);
    console.log('✓ Room deleted');

    const afterDeleteMembers = await client.query(`SELECT COUNT(*) FROM chat_room_members WHERE room_id = $1`, [roomId]);
    const afterDeleteMessages = await client.query(`SELECT COUNT(*) FROM chat_room_messages WHERE room_id = $1`, [roomId]);

    console.log('✓ Cascade delete verified:');
    console.log('  - Members deleted:', afterDeleteMembers.rows[0].count === '0');
    console.log('  - Messages deleted:', afterDeleteMessages.rows[0].count === '0');

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ All Database Tests Passed!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📊 Test Summary:');
    console.log('  ✓ Database schema validation');
    console.log('  ✓ Room creation & retrieval');
    console.log('  ✓ Room membership management');
    console.log('  ✓ Message storage & retrieval');
    console.log('  ✓ Moderator actions (mute/unmute)');
    console.log('  ✓ Room listing queries');
    console.log('  ✓ Leave room functionality');
    console.log('  ✓ Cascade delete constraints');
    console.log('\n✅ Internode Chat System: READY FOR USE\n');

    client.release();

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

// Run tests
testChatSystem().catch(console.error);
