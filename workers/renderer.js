const path = require('path');
const fs = require('fs').promises;
const config = require('../config');
const jobQueue = require('../lib/jobQueue');
const packager = require('./packager');

class Renderer {
  constructor() {
    this.browser = null;
    this.puppeteer = null;
    this.chromium = null;
  }
  
  async initializePuppeteer() {
    if (!this.puppeteer) {
      // Try to use regular puppeteer for local development
      try {
        this.puppeteer = require('puppeteer');
        console.log('Using regular Puppeteer for local development');
      } catch (e) {
        // Fall back to puppeteer-core for production
        this.puppeteer = require('puppeteer-core');
        this.chromium = require('@sparticuz/chromium');
        console.log('Using puppeteer-core with @sparticuz/chromium for production');
      }
    }
    return this.puppeteer;
  }
  
  async getBrowser() {
    if (!this.browser || !this.browser.isConnected()) {
      const puppeteer = await this.initializePuppeteer();
      
      let launchOptions = { ...config.puppeteer };
      
      // If using puppeteer-core (production), set executable path
      if (this.chromium) {
        const executablePath = await this.chromium.executablePath();
        launchOptions.executablePath = executablePath;
        launchOptions.args = this.chromium.args.concat(config.puppeteer.args || []);
      }
      // For local development with regular puppeteer, it will find Chrome automatically
      
      this.browser = await puppeteer.launch(launchOptions);
    }
    return this.browser;
  }
  
  async render(job) {
    const jobDir = path.join(__dirname, '..', config.storage.tempDir, job.id);
    const framesDir = path.join(jobDir, 'frames');
    
    try {
      // Create directories
      await fs.mkdir(jobDir, { recursive: true });
      await fs.mkdir(framesDir, { recursive: true });
      
      // Get browser instance
      const browser = await this.getBrowser();
      const page = await browser.newPage();
      
      // Set viewport with resolution multiplier using deviceScaleFactor
      await page.setViewport({
        width: job.data.width,
        height: job.data.height,
        deviceScaleFactor: job.data.resolution
      });
      
      // Create HTML with animation
      const fullHtml = this.createFullHtml(job.data);
      await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
      
      // Wait for any initial setup
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Inject animation controller
      await page.evaluate((animationCode) => {
        // Create global animation controller
        window.animationController = {
          currentTime: 0,
          duration: 0,
          fps: 30
        };
        
        // Override requestAnimationFrame to control timing
        window.originalRAF = window.requestAnimationFrame;
        window.rafCallbacks = [];
        window.requestAnimationFrame = (callback) => {
          window.rafCallbacks.push(callback);
          return window.rafCallbacks.length - 1;
        };
        
        // Execute user's animation code
        if (animationCode) {
          try {
            eval(animationCode);
          } catch (e) {
            console.error('Animation code error:', e);
          }
        }
        
        // Function to set animation time
        window.setAnimationTime = (time) => {
          window.animationController.currentTime = time;
          
          // Trigger all RAF callbacks
          const callbacks = [...window.rafCallbacks];
          window.rafCallbacks = [];
          callbacks.forEach(cb => {
            try {
              cb(time * 1000); // Convert to milliseconds
            } catch (e) {
              console.error('RAF callback error:', e);
            }
          });
          
          // Trigger custom animation update if defined
          if (window.updateAnimation) {
            window.updateAnimation(time);
          }
        };
      }, job.data.animationCode || '');
      
      // Capture frames
      let totalFrames = job.totalFrames;
      
      // For perfect loops, capture one less frame since last frame = first frame
      if (job.data.perfectLoop) {
        totalFrames = totalFrames - 1;
        console.log(`Starting capture of ${totalFrames} frames for job ${job.id} (perfect loop: last frame will be first frame)`);
      } else {
        console.log(`Starting capture of ${totalFrames} frames for job ${job.id}`);
      }
      
      for (let frame = 0; frame < totalFrames; frame++) {
        // Update animation time
        let currentTime = frame / job.data.fps;
        
        // Apply perfect loop logic - map time to animation's natural period
        if (job.data.perfectLoop) {
          const naturalPeriod = job.data.naturalPeriod || job.data.duration;
          currentTime = (currentTime * (job.data.animationSpeed || 1)) % naturalPeriod;
        } else {
          currentTime = currentTime * (job.data.animationSpeed || 1);
        }
        
        await page.evaluate((time) => {
          if (window.setAnimationTime) {
            window.setAnimationTime(time);
          }
        }, currentTime);
        
        // Small delay to ensure rendering is complete
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Capture frame
        const framePath = path.join(framesDir, `frame_${String(frame).padStart(4, '0')}.png`);
        await page.screenshot({
          path: framePath,
          type: 'png',
          omitBackground: job.data.transparent
        });
        
        // Update progress
        jobQueue.updateJob(job.id, {
          currentFrame: frame + 1
        });
        
        // Log progress every 10 frames
        if ((frame + 1) % 10 === 0) {
          console.log(`Job ${job.id}: Captured frame ${frame + 1}/${totalFrames}`);
        }
      }
      
      await page.close();
      
      console.log(`Packaging frames for job ${job.id} (format: ${job.data.exportFormat})`);
      
      let outputPath;
      let fileSize;
      
      // Create output based on export format
      if (job.data.exportFormat === 'zip') {
        outputPath = await packager.createZip(job.id, framesDir);
      } else {
        // Video format (mov or webm)
        outputPath = await packager.createVideo(job.id, framesDir, {
          format: job.data.exportFormat,
          fps: job.data.fps,
          width: job.data.width,
          height: job.data.height,
          quality: job.data.videoQuality || 'high'
        });
      }
      
      // Get file size
      const stats = await fs.stat(outputPath);
      fileSize = `${Math.round(stats.size / 1024 / 1024)}MB`;
      
      // Update job with completion info
      jobQueue.updateJob(job.id, {
        fileSize: fileSize,
        exportFormat: job.data.exportFormat
      });
      
      console.log(`Job ${job.id} completed successfully (${fileSize})`);
      
    } catch (error) {
      console.error(`Render error for job ${job.id}:`, error);
      
      // Clean up on error
      try {
        await fs.rm(jobDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error('Cleanup error:', cleanupError);
      }
      
      throw error;
    }
  }
  
  createFullHtml(data) {
    // If the HTML already has a complete structure, use it
    if (data.html.includes('<!DOCTYPE') || data.html.includes('<html')) {
      return data.html;
    }
    
    // Otherwise, wrap it in a basic HTML structure
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chatooly Render</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: ${data.transparent ? 'transparent' : 'white'};
    }
    canvas {
      display: block;
    }
  </style>
</head>
<body>
  ${data.html}
</body>
</html>`;
  }
  
  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = new Renderer();