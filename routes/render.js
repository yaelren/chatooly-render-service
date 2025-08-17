const express = require('express');
const router = express.Router();
const jobQueue = require('../lib/jobQueue');
const config = require('../config');

router.post('/', async (req, res) => {
  try {
    // Validate input
    const {
      html,
      duration = config.rendering.defaultDuration,
      fps = config.rendering.defaultFps,
      width = config.rendering.defaultWidth,
      height = config.rendering.defaultHeight,
      resolution = 2,
      transparent = true,
      toolName = 'unknown',
      animationCode = ''
    } = req.body;
    
    // Input validation
    if (!html) {
      return res.status(400).json({
        error: 'HTML content is required',
        status: 400
      });
    }
    
    // Validate limits
    const totalFrames = duration * fps;
    if (totalFrames > config.rendering.maxFramesPerJob) {
      return res.status(400).json({
        error: `Too many frames requested. Maximum is ${config.rendering.maxFramesPerJob} frames`,
        status: 400
      });
    }
    
    if (resolution > config.rendering.maxResolution) {
      return res.status(400).json({
        error: `Resolution too high. Maximum is ${config.rendering.maxResolution}x`,
        status: 400
      });
    }
    
    // Create job
    const job = jobQueue.createJob({
      html,
      duration,
      fps,
      width,
      height,
      resolution,
      transparent,
      toolName,
      animationCode
    });
    
    res.json({
      jobId: job.id,
      status: job.status,
      totalFrames: job.totalFrames,
      message: 'Job created successfully'
    });
    
  } catch (error) {
    console.error('Render error:', error);
    res.status(500).json({
      error: 'Failed to create render job',
      status: 500
    });
  }
});

module.exports = router;