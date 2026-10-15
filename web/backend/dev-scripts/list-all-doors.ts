#!/usr/bin/env node

/**
 * List All Enabled Doors in AmiExpress-Web BBS
 * Scans Commands/BBSCmd/ for all .info files and categorizes them
 */

const fs = require('fs');
const path = require('path');

/**
 * Door type descriptions based on common Amiga BBS door patterns
 */
const DOOR_DESCRIPTIONS = {
  // System Commands
  'B': 'Bulletin Reader - Browse and read bulletin messages',
  'WHO': 'Who\'s Online - Display list of currently logged in users',
  'RTW': 'Road To Wealth - Text adventure/maze game',
  'WALL': 'Wall - Post messages to the system wall',
  'CHAT': 'Chat - Multi-user chat system',
  'GAMES': 'Games Menu - Access to various games and utilities',
  'HELP': 'Help System - Display help information',
  'SYSOP': 'Sysop Commands - Administrative functions',
  
  // File Utilities
  'F': 'File Utilities - File management operations',
  'DL': 'Download - File download system',
  'UL': 'Upload - File upload system',
  'FL': 'File List - List files in current directory',
  'DIR': 'Directory - Directory navigation',
  'SIZE': 'Size Check - Check file sizes',
  'SCAN': 'File Scanner - Scan for specific files',
  
  // Message System
  'R': 'Read Messages - Read bulletin board messages',
  'P': 'Post Messages - Post new messages',
  'M': 'Messages - Message system menu',
  'QM': 'Quick Message - Send quick messages to users',
  'XM': 'Express Mail - Send private messages',
  
  // User Management
  'U': 'User Commands - User account management',
  'J': 'Join Conference - Switch to different conference',
  'N': 'New User - New user registration',
  'Q': 'Quit - Log off the system',
  'LOGOFF': 'Log Off - End current session',
  
  // Conference/Board Navigation
  'C': 'Conference - Conference navigation',
  'CONF': 'Conference Menu - Conference selection',
  'CONF1': 'Conference 1 - General discussion',
  'CONF2': 'Conference 2 - Programming讨论',
  'CONF3': 'Conference 3 - Hardware讨论',
  'CONF4': 'Conference 4 - Off-topic讨论',
  
  // Games (Common Amiga BBS games)
  'LORD': 'Lords of Midnight - Fantasy adventure game',
  'LORD2': 'Lords of Midnight 2 - Sequel to fantasy adventure',
  'TW2002': 'Trade Wars 2002 - Multi-player space trading game',
  'DMUD': 'Dungeons & MUDs - Multi-user dungeon game',
  'DARK': 'Dark Castle - Adventure game',
  'MEGA': 'Mega Man - Action game',
  'NUKE': 'Nuke game - Nuclear strategy game',
  'FISH': 'Fisherman - Fishing simulation game',
  'HACK': 'Hacker - Hacking simulation game',
  'GWAR': 'GWAR - Heavy metal themed game',
  'LEGN': 'Legend of the Five Rings - Strategy game',
  'LUNA': 'Lunar Lander - Lunar landing simulation',
  
  // File Archives/Utilities
  'ARCL': 'Archive List - List archive contents',
  'REQ': 'Request - File request system',
  'FASTDUPE': 'Fast Duplicate Finder - Find duplicate files',
  'BYTEKILLER': 'ByteKiller - File compression utility',
  'BYTECALC': 'Byte Calculator - File size calculations',
  
  // Communication Tools
  'BBSLINK': 'BBS Link - Connect to other BBS systems',
  'BBSLINKWALL': 'BBS Link Wall - Post to linked BBS walls',
  'GLOBALWALL': 'Global Wall - System-wide announcements',
  'DANNOUNCE': 'Door Announce - Announce door games',
  
  // Advanced Features
  'ANSI': 'ANSI Editor - Create ANSI graphics',
  'ANSIED': 'ANSI Editor - Edit ANSI artwork',
  'REXX': 'REXX Script - Execute REXX scripts',
  'AREXX': 'AREXX Script - Execute AREXX automation',
  'OLM': 'OLM (Off-Line Mail) - Off-line mail system',
  'V-AWAIT': 'V-Await - Screen animation/delay system',
  
  // System Status/Info
  'S': 'Status - System status information',
  'I': 'Info - System information display',
  'STATS': 'Statistics - System usage statistics',
  'TIME': 'Time - Display current time/date',
  'VER': 'Version - Display system version',
  
  // Security/Access
  'PASSWORD': 'Password - Change user password',
  'SECURITY': 'Security - Security level information',
  'ACCESS': 'Access - Access level checking'
};

/**
 * Get door type and description based on filename
 */
function getDoorInfo(filename) {
  const baseName = path.basename(filename, '.info').toUpperCase();
  const description = DOOR_DESCRIPTIONS[baseName] || 'Unknown door/command';
  
  // Determine door type based on common patterns
  let type = 'Unknown';
  if (baseName.match(/^CONF\d+$/)) type = 'Conference';
  else if (['LORD', 'LORD2', 'TW2002', 'DMUD', 'DARK', 'MEGA', 'NUKE', 'FISH', 'HACK', 'GWAR', 'LEGN', 'LUNA'].includes(baseName)) {
    type = 'Game';
  }
  else if (['B', 'R', 'P', 'M', 'QM', 'XM'].includes(baseName)) {
    type = 'Message System';
  }
  else if (['F', 'DL', 'UL', 'FL', 'DIR', 'SIZE', 'SCAN', 'ARCL', 'REQ', 'FASTDUPE', 'BYTEKILLER'].includes(baseName)) {
    type = 'File System';
  }
  else if (['U', 'J', 'N', 'Q', 'LOGOFF', 'WALL', 'CHAT'].includes(baseName)) {
    type = 'User Management';
  }
  else if (['WHO', 'S', 'I', 'STATS', 'TIME', 'VER', 'HELP'].includes(baseName)) {
    type = 'Information/System';
  }
  else if (['ANSI', 'ANSIED', 'REXX', 'AREXX', 'OLM'].includes(baseName)) {
    type = 'Advanced Features';
  }
  
  return {
    command: baseName,
    description,
    type,
    filename
  };
}

async function listAllDoors() {
  console.log('📋 AmiExpress-Web BBS - Complete Door Listing');
  console.log('=' .repeat(70));
  
  const commandsPath = path.join(process.cwd(), 'Commands', 'BBSCmd');
  
  if (!fs.existsSync(commandsPath)) {
    console.log('❌ Commands directory not found:', commandsPath);
    return;
  }
  
  const files = fs.readdirSync(commandsPath);
  const infoFiles = files.filter(f => f.toLowerCase().endsWith('.info'));
  
  console.log(`\n📁 Found ${infoFiles.length} door/command files in Commands/BBSCmd/\n`);
  
  // Categorize doors
  const categories = {};
  const doors = [];
  
  for (const infoFile of infoFiles) {
    const doorInfo = getDoorInfo(infoFile);
    doors.push(doorInfo);
    
    if (!categories[doorInfo.type]) {
      categories[doorInfo.type] = [];
    }
    categories[doorInfo.type].push(doorInfo);
  }
  
  // Display by category
  const categoryOrder = [
    'Conference',
    'Game', 
    'Message System',
    'File System',
    'User Management',
    'Information/System',
    'Advanced Features',
    'Unknown'
  ];
  
  let totalDoors = 0;
  
  for (const category of categoryOrder) {
    const categoryDoors = categories[category];
    if (!categoryDoors || categoryDoors.length === 0) continue;
    
    console.log(`\n🎯 ${category.toUpperCase()} (${categoryDoors.length} doors)`);
    console.log('-'.repeat(50));
    
    // Sort doors alphabetically within category
    categoryDoors.sort((a, b) => a.command.localeCompare(b.command));
    
    for (const door of categoryDoors) {
      console.log(`  ${door.command.padEnd(8)} - ${door.description}`);
      totalDoors++;
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log(`📊 TOTAL: ${totalDoors} doors/commands enabled`);
  
  console.log('\n🚀 HOW TO USE:');
  console.log('1. Login to BBS at http://localhost:3001');
  console.log('2. Type any command at the prompt (e.g., "B", "WHO", "RTW")');
  console.log('3. Press ENTER to execute');
  console.log('4. Press ENTER again to return to menu');
  
  console.log('\n💡 POPULAR DOORS TO TRY:');
  const popularDoors = ['B', 'WHO', 'RTW', 'WALL', 'CHAT', 'GAMES', 'HELP'];
  console.log(popularDoors.map(cmd => `   ${cmd}`).join('  '));
  
  console.log('\n📖 NOTE: 68K Amiga doors are now enabled with enhanced debugging.');
  console.log('   Check backend logs for detailed execution information.');
  
  return {
    total: totalDoors,
    categories: Object.keys(categories).length,
    doors: doors
  };
}

// Run if called directly
if (require.main === module) {
  listAllDoors().then(result => {
    console.log(`\n✅ Door scan complete: ${result.total} doors found in ${result.categories} categories`);
    process.exit(0);
  }).catch(error => {
    console.error('💥 Error scanning doors:', error);
    process.exit(1);
  });
}

module.exports = { listAllDoors, getDoorInfo };