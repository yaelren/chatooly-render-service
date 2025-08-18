const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const videoEncoder = require('./video-encoder');

class Packager {
  async createZip(jobId, framesDir) {
    return new Promise((resolve, reject) => {
      const outputPath = path.join(
        path.dirname(framesDir),
        'output.zip'
      );
      
      const output = fs.createWriteStream(outputPath);
      const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
      });
      
      output.on('close', () => {
        console.log(`ZIP created for job ${jobId}: ${archive.pointer()} bytes`);
        resolve(outputPath);
      });
      
      output.on('error', (err) => {
        console.error(`ZIP creation error for job ${jobId}:`, err);
        reject(err);
      });
      
      archive.on('error', (err) => {
        console.error(`Archive error for job ${jobId}:`, err);
        reject(err);
      });
      
      archive.on('warning', (err) => {
        if (err.code === 'ENOENT') {
          console.warn(`Archive warning for job ${jobId}:`, err);
        } else {
          reject(err);
        }
      });
      
      // Pipe archive data to the file
      archive.pipe(output);
      
      // Add all PNG files from frames directory
      archive.glob('*.png', {
        cwd: framesDir,
        prefix: 'frames/'
      });
      
      // Add metadata file
      const metadata = {
        jobId: jobId,
        createdAt: new Date().toISOString(),
        frameCount: fs.readdirSync(framesDir).length,
        format: 'PNG Sequence',
        generator: 'Chatooly Render Service v1.0.0'
      };
      
      archive.append(JSON.stringify(metadata, null, 2), {
        name: 'metadata.json'
      });
      
      // Finalize the archive
      archive.finalize();
    });
  }

  async createVideo(jobId, framesDir, options = {}) {
    try {
      // Initialize video encoder if not already done
      await videoEncoder.initialize();
      
      // Create video with specified options
      const result = await videoEncoder.createVideo(jobId, framesDir, options);
      
      console.log(`Video created for job ${jobId}: ${result.path} (${result.size})`);
      return result.path;
      
    } catch (error) {
      console.error(`Video creation failed for job ${jobId}:`, error.message);
      throw error;
    }
  }

  // Get available export formats
  getAvailableFormats() {
    const formats = ['zip']; // ZIP is always available
    
    try {
      // Check if video encoder is available
      const videoFormats = videoEncoder.getSupportedFormats();
      formats.push(...videoFormats);
    } catch (error) {
      console.log('Video export not available:', error.message);
    }
    
    return formats;
  }

  // Get format information
  getFormatInfo() {
    const info = {
      zip: {
        name: 'ZIP (PNG Sequence)',
        description: 'Collection of individual PNG frames',
        pros: ['Frame-by-frame control', 'Universal compatibility', 'No quality loss'],
        cons: ['Large file sizes', 'Requires assembly for playback'],
        bestFor: 'Professional editing, frame analysis, maximum flexibility'
      }
    };
    
    try {
      const videoInfo = videoEncoder.getFormatInfo();
      Object.assign(info, videoInfo);
    } catch (error) {
      // Video encoder not available
    }
    
    return info;
  }
}

module.exports = new Packager();