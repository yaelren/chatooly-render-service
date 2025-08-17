const express = require('express');
const router = express.Router();
const jobQueue = require('../lib/jobQueue');
const os = require('os');

router.get('/', (req, res) => {
  const stats = jobQueue.getStats();
  const uptime = process.uptime();
  
  res.json({
    status: 'healthy',
    service: 'Chatooly Render Service',
    version: '1.0.0',
    uptime: Math.floor(uptime),
    timestamp: new Date().toISOString(),
    jobs: stats,
    system: {
      platform: os.platform(),
      memory: {
        used: Math.round((os.totalmem() - os.freemem()) / 1024 / 1024),
        total: Math.round(os.totalmem() / 1024 / 1024),
        unit: 'MB'
      },
      loadAverage: os.loadavg()
    }
  });
});

module.exports = router;