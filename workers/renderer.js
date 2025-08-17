const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs').promises;
const config = require('../config');
const jobQueue = require('../lib/jobQueue');
const packager = require('./packager');

class Renderer {
  constructor() {
    this.browser = null;
  }
  
  async getBrowser() {
    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await puppeteer.launch(config.puppeteer);
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
      
      // Set viewport with resolution multiplier
      await page.setViewport({
        width: job.data.width * job.data.resolution,
        height: job.data.height * job.data.resolution,
        deviceScaleFactor: 1
      });
      
      // Create HTML with animation
      const fullHtml = this.createFullHtml(job.data);
      await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
      
      // Wait for any initial setup
      await page.waitForTimeout(500);
      
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
      const totalFrames = job.totalFrames;
      console.log(`Starting capture of ${totalFrames} frames for job ${job.id}`);
      
      for (let frame = 0; frame < totalFrames; frame++) {
        // Update animation time
        const currentTime = frame / job.data.fps;
        await page.evaluate((time) => {
          if (window.setAnimationTime) {
            window.setAnimationTime(time);
          }
        }, currentTime);
        
        // Small delay to ensure rendering is complete
        await page.waitForTimeout(50);
        
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
      
      console.log(`Packaging frames for job ${job.id}`);
      
      // Package frames into ZIP
      const zipPath = await packager.createZip(job.id, framesDir);
      
      // Get file size
      const stats = await fs.stat(zipPath);
      const fileSize = `${Math.round(stats.size / 1024 / 1024)}MB`;
      
      // Update job with completion info
      jobQueue.updateJob(job.id, {
        fileSize: fileSize
      });
      
      console.log(`Job ${job.id} completed successfully`);
      
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