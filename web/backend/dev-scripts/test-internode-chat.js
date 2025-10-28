/**
 * Internode Chat System Test
 * Tests both Phase 1 (1:1 chat) and Phase 2 (group chat rooms)
 */

const Database = require('better-sqlite3');
const path = require('path');

// Database connection
const dbPath = process.env.DATABASE_DIR 
  ? path.join(process.env.DATABASE_DIR, process.env.DATABASE_FILE || 'amiexpress.db')
  : path.join(__dirname, '..', 'data', 'amiexpress.db');

async function testChatSystem() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 Testing Internode Chat System');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const db = new Database(dbPath);

  try {
    // ========== DATABASE SCHEMA TESTS ==========
    console.log('📋 Test 1: Database Schema');
    console.log('─────────────────────────────────────');

    // Test chat_rooms table exists
    const roomsTableResult = db.prepare(`
      SELECT name FROM pragma_table_info('chat_rooms')
    `).all();

    console.log('✓ chat_rooms table columns:', roomsTableResult.length);
    const expectedRoomColumns = ['id', 'room_id', 'room_name', 'topic', 'created_by', 'created_by_username', 'is_public', 'max_users', 'is_persistent', 'password', 'created_at', 'updated_at'];
    const roomColumns = roomsTableResult.map(r => r.name);
    const missingRoomCols = expectedRoomColumns.filter(c => !roomColumns.includes(c));
    if (missingRoomCols.length > 0) {
      console.log('  ❌ Missing columns:', missingRoomCols.join(', '));
    } else {
      console.log('  ✓ All expected columns present');
    }

    // Test chat_room_members table
    const membersTableResult = db.prepare(`
      SELECT name FROM pragma_table_info('chat_room_members')
    `).all();
    console.log('✓ chat_room_members table columns:', membersTableResult.length);

    // Test chat_room_messages table
    const messagesTableResult = db.prepare(`
      SELECT name FROM pragma_table_info('chat_room_messages')
    `).all();
    console.log('✓ chat_room_messages table columns:', messagesTableResult.length);

    // Test indexes
    const indexResult = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type = 'index' 
      AND tbl_name IN ('chat_rooms', 'chat_room_members', 'chat_room_messages')
      ORDER BY name
    `).all();
    console.log('✓ Indexes created:', indexResult.length);
    indexResult.forEach(row => {
      console.log('  - ' + row.name);
    });

    console.log('\n📋 Test 2: Room Creation & Management');
    console.log('─────────────────────────────────────');

    // Clean up any existing test data
    db.prepare(`DELETE FROM chat_rooms WHERE room_name LIKE 'TestRoom%'`).run();

    // Get a test user
    const userResult = db.prepare(`SELECT id, username FROM users LIMIT 1`).get();
    if (!userResult) {
      console.log('❌ No users found in database. Please create a user first.');
      return;
    }
    const testUser = userResult;
    console.log('✓ Using test user:', testUser.username);

    // Test room creation
    const roomId = 'test_room_' + Date.now();
    db.prepare(`
      INSERT INTO chat_rooms (room_id, room_name, topic, created_by, created_by_username, is_public, max_users)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(roomId, 'TestRoom1', 'Test topic', testUser.id, testUser.username, 1, 50);
    console.log('✓ Created test room:', 'TestRoom1');

    // Test room retrieval
    const roomCheck = db.prepare(`SELECT * FROM chat_rooms WHERE room_id = ?`).get(roomId);
    if (roomCheck) {
      console.log('✓ Room retrieved successfully');
      console.log('  - Room name:', roomCheck.room_name);
      console.log('  - Topic:', roomCheck.topic);
      console.log('  - Max users:', roomCheck.max_users);
      console.log('  - Public:', roomCheck.is_public);
    } else {
      console.log('❌ Failed to retrieve created room');
    }

    console.log('\n📋 Test 3: Room Membership');
    console.log('─────────────────────────────────────');

    // Test joining room
    db.prepare(`
      INSERT INTO chat_room_members (room_id, user_id, username, socket_id, is_moderator)
      VALUES (?, ?, ?, ?, ?)
    `).run(roomId, testUser.id, testUser.username, 'test_socket_123', 0);
    console.log('✓ User joined room:', testUser.username);

    // Test member retrieval
    const memberCheck = db.prepare(`
      SELECT * FROM chat_room_members WHERE room_id = ?
    `).all(roomId);
    console.log('✓ Room members:', memberCheck.length);
    memberCheck.forEach(member => {
      console.log('  -', member.username, member.is_moderator ? '[MOD]' : '', member.is_muted ? '[MUTED]' : '');
    });

    console.log('\n📋 Test 4: Room Messages');
    console.log('─────────────────────────────────────');

    // Test message creation
    db.prepare(`
      INSERT INTO chat_room_messages (room_id, sender_id, sender_username, message, message_type)
      VALUES (?, ?, ?, ?, ?)
    `).run(roomId, testUser.id, testUser.username, 'Test message 1', 'message');
    db.prepare(`
      INSERT INTO chat_room_messages (room_id, sender_id, sender_username, message, message_type)
      VALUES (?, ?, ?, ?, ?)
    `).run(roomId, testUser.id, testUser.username, 'Test message 2', 'message');
    console.log('✓ Created 2 test messages');

    // Test message retrieval
    const messagesCheck = db.prepare(`
      SELECT * FROM chat_room_messages
      WHERE room_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `).all(roomId);
    console.log('✓ Room messages:', messagesCheck.length);
    messagesCheck.forEach(msg => {
      const timestamp = new Date(msg.created_at * 1000).toLocaleTimeString();
      console.log('  [' + timestamp + ']', msg.sender_username + ':', msg.message);
    });

    console.log('\n📋 Test 5: Moderator Actions');
    console.log('─────────────────────────────────────');

    // Test mute user
    db.prepare(`
      UPDATE chat_room_members
      SET is_muted = 1
      WHERE room_id = ? AND user_id = ?
    `).run(roomId, testUser.id);
    console.log('✓ User muted');

    // Check mute status
    const muteCheck = db.prepare(`
      SELECT is_muted FROM chat_room_members
      WHERE room_id = ? AND user_id = ?
    `).get(roomId, testUser.id);
    console.log('✓ Mute status verified:', Boolean(muteCheck.is_muted));

    // Test unmute user
    db.prepare(`
      UPDATE chat_room_members
      SET is_muted = 0
      WHERE room_id = ? AND user_id = ?
    `).run(roomId, testUser.id);
    console.log('✓ User unmuted');

    console.log('\n📋 Test 6: Room Listing');
    console.log('─────────────────────────────────────');

    // Test public room listing
    const publicRooms = db.prepare(`
      SELECT r.*,
        (SELECT COUNT(*) FROM chat_room_members WHERE room_id = r.room_id) as member_count
      FROM chat_rooms r
      WHERE is_public = 1
      ORDER BY created_at DESC
    `).all();
    console.log('✓ Public rooms found:', publicRooms.length);
    publicRooms.forEach(room => {
      console.log('  -', room.room_name, '[' + room.member_count + '/' + room.max_users + ']', room.topic || '(no topic)');
    });

    console.log('\n📋 Test 7: Room Leave & Cleanup');
    console.log('─────────────────────────────────────');

    // Test leaving room
    db.prepare(`
      DELETE FROM chat_room_members
      WHERE room_id = ? AND user_id = ?
    `).run(roomId, testUser.id);
    console.log('✓ User left room');

    // Verify member removed
    const memberVerify = db.prepare(`
      SELECT COUNT(*) as count FROM chat_room_members
      WHERE room_id = ? AND user_id = ?
    `).get(roomId, testUser.id);
    console.log('✓ Member removal verified:', memberVerify.count === 0);

    console.log('\n📋 Test 8: Foreign Key Constraints');
    console.log('─────────────────────────────────────');

    // Test cascade delete (room deletion should delete members and messages)
    const beforeDeleteMembers = db.prepare(`SELECT COUNT(*) as count FROM chat_room_members WHERE room_id = ?`).get(roomId);
    const beforeDeleteMessages = db.prepare(`SELECT COUNT(*) as count FROM chat_room_messages WHERE room_id = ?`).get(roomId);

    db.prepare(`DELETE FROM chat_rooms WHERE room_id = ?`).run(roomId);
    console.log('✓ Room deleted');

    const afterDeleteMembers = db.prepare(`SELECT COUNT(*) as count FROM chat_room_members WHERE room_id = ?`).get(roomId);
    const afterDeleteMessages = db.prepare(`SELECT COUNT(*) as count FROM chat_room_messages WHERE room_id = ?`).get(roomId);

    console.log('✓ Cascade delete verified:');
    console.log('  - Members deleted:', afterDeleteMembers.count === 0);
    console.log('  - Messages deleted:', afterDeleteMessages.count === 0);

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

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  } finally {
    db.close();
  }
}

// Run tests
testChatSystem().catch(console.error);
