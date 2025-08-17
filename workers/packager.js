const archiver = require('archiver');
const fs = require('fs');
const path = require('path');

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
}

module.exports = new Packager();