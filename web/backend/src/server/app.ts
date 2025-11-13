import express from 'express';
import cors from 'cors';
import { config } from '../config';
import { doorApiRouter } from '../doors/door-api-routes';
import { deploymentRouter } from '../api/deployment-routes';

/**
 * Express Application Setup
 *
 * Initializes the Express app with middleware and basic configuration.
 * This module handles:
 * - CORS configuration
 * - JSON body parsing
 * - Basic health check endpoint
 * - Door API routes for client door bundling
 * - Deployment and health check routes
 */

export const app = express();

// Configure CORS
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api', (req, res) => {
  res.json({ message: 'AmiExpress Backend API' });
});

// Door API routes
app.use('/api', doorApiRouter);

// Deployment API routes
app.use('/api', deploymentRouter);

export default app;
