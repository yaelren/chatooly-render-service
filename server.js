const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs').promises;
const cron = require('node-cron');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware - CORS setup with multiple origins
const allowedOrigins = process.env.CORS_ORIGINS ? 
  process.env.CORS_ORIGINS.split(',').map(origin => origin.trim()) : 
  ['http://localhost:3000', 'http://localhost:8080'];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if the origin is in our allowed list
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(morgan('dev'));

// Import routes
const renderRoute = require('./routes/render');
const statusRoute = require('./routes/status');
const downloadRoute = require('./routes/download');
const healthRoute = require('./routes/health');

// Import job queue
const jobQueue = require('./lib/jobQueue');

// Routes
app.use('/render', renderRoute);
app.use('/status', statusRoute);
app.use('/download', downloadRoute);
app.use('/health', healthRoute);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Chatooly Render Service',
    version: '1.0.0',
    status: 'online',
    endpoints: {
      render: 'POST /render',
      status: 'GET /status/:jobId',
      download: 'GET /download/:jobId',
      health: 'GET /health'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    status: err.status || 500
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    status: 404
  });
});

// Cleanup job - runs every 30 minutes
cron.schedule('*/30 * * * *', async () => {
  console.log('Running cleanup job...');
  try {
    // Clean up old files
    const tempDir = path.join(__dirname, 'storage', 'temp');
    const files = await fs.readdir(tempDir);
    const now = Date.now();
    const thirtyMinutes = 30 * 60 * 1000;
    
    for (const file of files) {
      const filePath = path.join(tempDir, file);
      const stats = await fs.stat(filePath);
      
      if (now - stats.mtime.getTime() > thirtyMinutes) {
        await fs.rm(filePath, { recursive: true, force: true });
        console.log(`Cleaned up old file: ${file}`);
      }
    }
    
    // Clean up old jobs from memory
    jobQueue.cleanupOldJobs();
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      console.log('Forced garbage collection');
    }
    
    // Log memory usage
    const memUsage = process.memoryUsage();
    console.log(`Memory usage: RSS=${Math.round(memUsage.rss / 1024 / 1024)}MB, Heap=${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
  } catch (error) {
    console.error('Cleanup error:', error);
  }
});

// Start server
async function startServer() {
  try {
    // Ensure storage directories exist
    const storageDir = path.join(__dirname, 'storage', 'temp');
    await fs.mkdir(storageDir, { recursive: true });
    
    app.listen(PORT, () => {
      console.log(`Chatooly Render Service running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`CORS Origin: ${process.env.CORS_ORIGIN || '*'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await jobQueue.cleanup();
  process.exit(0);
});

module.exports = app;