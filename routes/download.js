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
  
  // Determine file path and details based on export format
  let filePath, contentType, filename;
  const exportFormat = job.data.exportFormat || 'zip';
  
  if (exportFormat === 'zip') {
    filePath = path.join(__dirname, '..', 'storage', 'temp', jobId, 'output.zip');
    contentType = 'application/zip';
    filename = `${job.data.toolName}_frames_${Date.now()}.zip`;
  } else if (exportFormat === 'mov') {
    filePath = path.join(__dirname, '..', 'storage', 'temp', jobId, `${jobId}.mov`);
    contentType = 'video/quicktime';
    filename = `${job.data.toolName}_video_${Date.now()}.mov`;
  } else if (exportFormat === 'webm') {
    filePath = path.join(__dirname, '..', 'storage', 'temp', jobId, `${jobId}.webm`);
    contentType = 'video/webm';
    filename = `${job.data.toolName}_video_${Date.now()}.webm`;
  } else if (exportFormat === 'gif') {
    filePath = path.join(__dirname, '..', 'storage', 'temp', jobId, `${jobId}.gif`);
    contentType = 'image/gif';
    filename = `${job.data.toolName}_animation_${Date.now()}.gif`;
  }
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      error: `Download file not found. It may have been cleaned up. Looking for: ${path.basename(filePath)}`,
      status: 404
    });
  }
  
  // Set headers for download
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  
  // Stream the file
  const stream = fs.createReadStream(filePath);
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