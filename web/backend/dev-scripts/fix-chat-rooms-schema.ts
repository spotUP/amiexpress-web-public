#!/usr/bin/env node
/**
 * Fix chat_rooms schema mismatch on Render
 * Run this with: node fix-chat-rooms-schema.js
 */

const { Client } = require('pg');

async function fixChatRoomsSchema() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('✓ Connected to database');

    // Drop chat room tables in correct order
    console.log('→ Dropping chat_room_messages...');
    await client.query('DROP TABLE IF EXISTS chat_room_messages CASCADE');
    
    console.log('→ Dropping chat_room_members...');
    await client.query('DROP TABLE IF EXISTS chat_room_members CASCADE');
    
    console.log('→ Dropping chat_rooms...');
    await client.query('DROP TABLE IF EXISTS chat_rooms CASCADE');

    console.log('✓ Chat room tables dropped successfully');
    console.log('');
    console.log('The tables will be recreated automatically on next server restart.');
    
  } catch (error) {
    console.error('✗ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

fixChatRoomsSchema();
