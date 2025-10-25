#!/usr/bin/env node
/**
 * Database Reset Script
 * Clears all data from the database to allow re-initialization with correct IDs
 */

const { Pool } = require('pg');
require('dotenv').config();

async function resetDatabase() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🔄 Resetting database...');

    // Delete data in correct order (respecting foreign keys)
    await pool.query('DELETE FROM file_entries');
    console.log('  ✓ Cleared file_entries');

    await pool.query('DELETE FROM messages');
    console.log('  ✓ Cleared messages');

    await pool.query('DELETE FROM sessions');
    console.log('  ✓ Cleared sessions');

    await pool.query('DELETE FROM node_sessions');
    console.log('  ✓ Cleared node_sessions');

    await pool.query('DELETE FROM file_areas');
    console.log('  ✓ Cleared file_areas');

    await pool.query('DELETE FROM message_bases');
    console.log('  ✓ Cleared message_bases');

    await pool.query('DELETE FROM conferences');
    console.log('  ✓ Cleared conferences');

    await pool.query('DELETE FROM users WHERE username != \'sysop\'');
    console.log('  ✓ Cleared non-sysop users');

    console.log('✅ Database reset complete!');
    console.log('   Restart the backend to re-initialize with correct IDs');

  } catch (error) {
    console.error('❌ Error resetting database:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

resetDatabase();
