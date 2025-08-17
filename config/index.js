module.exports = {
  server: {
    port: process.env.PORT || 3001,
    corsOrigin: process.env.CORS_ORIGIN || '*'
  },
  
  rendering: {
    maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS) || 3,
    maxFramesPerJob: parseInt(process.env.MAX_FRAMES_PER_JOB) || 300,
    maxResolution: parseInt(process.env.MAX_RESOLUTION) || 4,
    defaultFps: 30,
    defaultDuration: 3,
    defaultWidth: 1920,
    defaultHeight: 1080
  },
  
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080',
      '--single-process',
      '--no-zygote'
    ],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
  },
  
  storage: {
    tempDir: 'storage/temp',
    cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL) || 3600000, // 1 hour
    maxFileSize: 500 * 1024 * 1024 // 500MB
  },
  
  jobs: {
    timeout: 5 * 60 * 1000, // 5 minutes
    pollInterval: 1000 // 1 second
  }
};