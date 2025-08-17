const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const jobQueue = require('../lib/jobQueue');

router.get('/:jobId', (req, res) => {
  const { jobId } = req.params;
  
  const job = jobQueue.getJob(jobId);
  
  if (!job) {
    return res.status(404).json({
      error: 'Job not found',
      status: 404
    });
  }
  
  if (job.status !== 'completed') {
    return res.status(400).json({
      error: `Job is ${job.status}. Downloads are only available for completed jobs.`,
      status: 400
    });
  }
  
  const zipPath = path.join(__dirname, '..', 'storage', 'temp', jobId, 'output.zip');
  
  // Check if file exists
  if (!fs.existsSync(zipPath)) {
    return res.status(404).json({
      error: 'Download file not found. It may have been cleaned up.',
      status: 404
    });
  }
  
  // Set headers for download
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${job.data.toolName}_frames_${Date.now()}.zip"`);
  
  // Stream the file
  const stream = fs.createReadStream(zipPath);
  stream.pipe(res);
  
  stream.on('error', (error) => {
    console.error('Download stream error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Failed to download file',
        status: 500
      });
    }
  });
});

module.exports = router;