const express = require('express');
const router = express.Router();
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
  
  const response = {
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    currentFrame: job.currentFrame,
    totalFrames: job.totalFrames,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    error: job.error
  };
  
  if (job.status === 'completed') {
    response.downloadUrl = job.downloadUrl;
    response.fileSize = job.fileSize;
  }
  
  res.json(response);
});

module.exports = router;