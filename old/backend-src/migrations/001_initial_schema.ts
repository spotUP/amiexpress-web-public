import { db } from '../database';

export const name = 'Initial Schema Setup';

export async function up(db: any): Promise<void> {
  // This migration creates the initial schema
  // The schema is already created in the Database class initDatabase method
  // This migration serves as a baseline for future migrations
  console.log('Running initial schema migration - schema already exists');
}

export async function down(db: any): Promise<void> {
  // Cannot rollback initial schema
  throw new Error('Cannot rollback initial schema migration');
}