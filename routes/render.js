const express = require('express');
const router = express.Router();
const jobQueue = require('../lib/jobQueue');
const config = require('../config');
const packager = require('../workers/packager');

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
      animationCode = '',
      exportFormat = 'zip',
      videoQuality = 'high',
      animationSpeed = 1,
      perfectLoop = false,
      naturalPeriod = null
    } = req.body;
    
    // Input validation
    if (!html) {
      return res.status(400).json({
        error: 'HTML content is required',
        status: 400
      });
    }
    
    // Validate limits - use natural period for perfect loops
    const effectiveDuration = (perfectLoop && naturalPeriod) ? naturalPeriod : duration;
    const totalFrames = Math.ceil(effectiveDuration * fps);
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

    // Validate export format
    const availableFormats = packager.getAvailableFormats();
    if (!availableFormats.includes(exportFormat)) {
      return res.status(400).json({
        error: `Invalid export format. Available formats: ${availableFormats.join(', ')}`,
        status: 400,
        availableFormats
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
      animationCode,
      exportFormat,
      videoQuality,
      animationSpeed,
      perfectLoop,
      naturalPeriod
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

// Get available export formats
router.get('/formats', async (req, res) => {
  try {
    const formats = packager.getAvailableFormats();
    const formatInfo = packager.getFormatInfo();
    
    res.json({
      availableFormats: formats,
      formatDetails: formatInfo
    });
  } catch (error) {
    console.error('Error getting formats:', error);
    res.status(500).json({
      error: 'Failed to get available formats',
      status: 500
    });
  }
});

module.exports = router;