#!/usr/bin/env ts-node
/**
 * Post today's changelog to BBS bulletins
 */

import { db } from '../src/database';
import * as path from 'path';

async function postChangelog() {
  try {
    console.log('Posting daily changelog to BBS bulletins...');

    // Create bulletin entry for all conferences (conferenceId = 0 means global)
    const bulletinId = await db.createBulletin({
      conferenceId: 0,
      filename: 'changelog-2025-10-16.txt',
      title: 'Daily Changelog - October 16, 2025 - AREXX Complete!'
    });

    console.log(`✓ Bulletin created with ID: ${bulletinId}`);
    console.log(`✓ Title: Daily Changelog - October 16, 2025 - AREXX Complete!`);
    console.log(`✓ File: data/bulletins/changelog-2025-10-16.txt`);
    console.log(`✓ Conference: Global (All conferences)`);

    console.log('\n✓ Daily changelog successfully posted to BBS bulletins!');

    process.exit(0);
  } catch (error) {
    console.error('Error posting bulletin:', error);
    process.exit(1);
  }
}

postChangelog();
