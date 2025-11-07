import express from 'express';
import cors from 'cors';
import { config } from '../config';

/**
 * Express Application Setup
 *
 * Initializes the Express app with middleware and basic configuration.
 * This module handles:
 * - CORS configuration
 * - JSON body parsing
 * - Basic health check endpoint
 */

export const app = express();

// Configure CORS
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Health check endpoints
app.get('/', (req, res) => {
  res.json({ message: 'AmiExpress Backend API' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default app;
