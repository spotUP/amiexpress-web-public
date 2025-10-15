// Vercel serverless function entry point
// This redirects to the main backend application

const { app } = require('../backend/dist/index.js');

module.exports = app;