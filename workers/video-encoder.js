const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs').promises;

class VideoEncoder {
  constructor() {
    this.ffmpegPath = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      // Try to detect FFmpeg installation
      await this.checkFFmpegInstallation();
      this.initialized = true;
      console.log('Video encoder initialized successfully');
    } catch (error) {
      console.warn('FFmpeg not found. Video export will be disabled.', error.message);
      throw new Error('FFmpeg is required for video export. Please install FFmpeg.');
    }
  }

  async checkFFmpegInstallation() {
    return new Promise((resolve, reject) => {
      // First try to get available formats
      ffmpeg.getAvailableFormats((err, formats) => {
        if (err) {
          // Try alternative check by running ffmpeg version
          ffmpeg()
            .on('error', (error) => {
              reject(new Error(`FFmpeg not found: ${error.message}\n\nTo install FFmpeg:\n- macOS: brew install ffmpeg\n- Ubuntu: apt-get install ffmpeg\n- Windows: Download from https://ffmpeg.org/`));
            })
            .on('stderr', (stderrLine) => {
              if (stderrLine.includes('ffmpeg version')) {
                resolve();
              }
            })
            .input('dummy')
            .format('null')
            .duration(0.1)
            .run();
        } else {
          resolve();
        }
      });
    });
  }

  async createVideo(jobId, framesDir, options = {}) {
    const {
      format = 'mov',        // 'mov' or 'webm'
      fps = 30,
      width = 1920,
      height = 1080,
      quality = 'high'       // 'low', 'medium', 'high', 'lossless'
    } = options;

    const outputPath = path.join(path.dirname(framesDir), `${jobId}.${format}`);
    const inputPattern = path.join(framesDir, 'frame_%04d.png');

    console.log(`Creating ${format.toUpperCase()} video for job ${jobId}`);
    console.log(`Input pattern: ${inputPattern}`);
    console.log(`Output path: ${outputPath}`);

    return new Promise((resolve, reject) => {
      let command = ffmpeg()
        .input(inputPattern)
        .inputFPS(fps)
        .size(`${width}x${height}`)
        .fps(fps);

      // Configure codec and quality based on format
      if (format === 'mov') {
        // ProRes 4444 for MOV with alpha channel support
        command = command
          .videoCodec('prores_ks')
          .outputOptions([
            '-profile:v', '4444',     // ProRes 4444 profile (supports alpha)
            '-pix_fmt', 'yuva444p10le', // Pixel format with alpha
            '-vendor', 'apl0'         // Apple vendor tag
          ]);
          
        // Quality settings for ProRes
        switch (quality) {
          case 'low':
            command = command.outputOptions(['-q:v', '15']);
            break;
          case 'medium':
            command = command.outputOptions(['-q:v', '10']);
            break;
          case 'high':
            command = command.outputOptions(['-q:v', '5']);
            break;
          case 'lossless':
            command = command.outputOptions(['-q:v', '0']);
            break;
        }
      } else if (format === 'webm') {
        // VP9 codec for WebM with alpha channel support
        command = command
          .videoCodec('libvpx-vp9')
          .outputOptions([
            '-pix_fmt', 'yuva420p',   // Pixel format with alpha
            '-auto-alt-ref', '0',     // Disable auto alt-ref frames
            '-lag-in-frames', '25',   // Enable lookahead
          ]);
          
        // Quality settings for VP9
        switch (quality) {
          case 'low':
            command = command.outputOptions(['-crf', '40', '-b:v', '1M']);
            break;
          case 'medium':
            command = command.outputOptions(['-crf', '30', '-b:v', '2M']);
            break;
          case 'high':
            command = command.outputOptions(['-crf', '20', '-b:v', '4M']);
            break;
          case 'lossless':
            command = command.outputOptions(['-crf', '0', '-b:v', '0']);
            break;
        }
      } else if (format === 'gif') {
        // GIF with optimized palette and transparency support
        command = command
          .outputOptions([
            '-vf', 'palettegen=stats_mode=diff',
            '-y'
          ]);
        
        // Create palette first, then GIF (two-pass encoding for better quality)
        const paletteFile = outputPath.replace('.gif', '_palette.png');
        
        return new Promise((resolve, reject) => {
          // First pass: Generate palette
          ffmpeg()
            .input(inputPattern)
            .inputFPS(fps)
            .outputOptions([
              '-vf', 'palettegen=stats_mode=diff'
            ])
            .output(paletteFile)
            .on('error', reject)
            .on('end', () => {
              // Second pass: Create GIF with palette
              let gifCommand = ffmpeg()
                .input(inputPattern)
                .inputFPS(fps)
                .input(paletteFile)
                .fps(fps)
                
              // Quality settings for GIF
              switch (quality) {
                case 'low':
                  gifCommand = gifCommand.outputOptions([
                    '-lavfi', '[0:v][1:v]paletteuse=dither=bayer:bayer_scale=5',
                    '-vf', 'scale=iw/2:ih/2'
                  ]);
                  break;
                case 'medium':
                  gifCommand = gifCommand.outputOptions([
                    '-lavfi', '[0:v][1:v]paletteuse=dither=bayer:bayer_scale=3'
                  ]);
                  break;
                case 'high':
                  gifCommand = gifCommand.outputOptions([
                    '-lavfi', '[0:v][1:v]paletteuse=dither=bayer:bayer_scale=1'
                  ]);
                  break;
                case 'lossless':
                  gifCommand = gifCommand.outputOptions([
                    '-lavfi', '[0:v][1:v]paletteuse=dither=none'
                  ]);
                  break;
              }
              
              gifCommand
                .output(outputPath)
                .on('start', (commandLine) => {
                  console.log('FFmpeg started:', commandLine);
                })
                .on('progress', (progress) => {
                  if (progress.percent) {
                    console.log(`Video encoding: ${Math.round(progress.percent)}%`);
                  }
                })
                .on('error', reject)
                .on('end', async () => {
                  try {
                    // Clean up palette file
                    const fs = require('fs').promises;
                    await fs.unlink(paletteFile).catch(() => {});
                    
                    const stats = await fs.stat(outputPath);
                    const fileSize = `${Math.round(stats.size / 1024 / 1024)}MB`;
                    
                    console.log(`GIF created successfully: ${outputPath} (${fileSize})`);
                    resolve({
                      path: outputPath,
                      size: fileSize,
                      format: 'GIF'
                    });
                  } catch (error) {
                    reject(new Error(`Failed to read output file: ${error.message}`));
                  }
                })
                .run();
            })
            .run();
        });
      }

      command
        .output(outputPath)
        .on('start', (commandLine) => {
          console.log('FFmpeg started:', commandLine);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`Video encoding: ${Math.round(progress.percent)}%`);
          }
        })
        .on('error', (err) => {
          console.error('FFmpeg error:', err);
          reject(new Error(`Video encoding failed: ${err.message}`));
        })
        .on('end', async () => {
          try {
            // Check if file was created and get its size
            const stats = await fs.stat(outputPath);
            const fileSize = `${Math.round(stats.size / 1024 / 1024)}MB`;
            
            console.log(`Video created successfully: ${outputPath} (${fileSize})`);
            resolve({
              path: outputPath,
              size: fileSize,
              format: format.toUpperCase()
            });
          } catch (error) {
            reject(new Error(`Failed to read output file: ${error.message}`));
          }
        })
        .run();
    });
  }

  // Get supported formats
  getSupportedFormats() {
    return ['mov', 'webm', 'gif'];
  }

  // Get quality options
  getQualityOptions() {
    return ['low', 'medium', 'high', 'lossless'];
  }

  // Get format info
  getFormatInfo() {
    return {
      mov: {
        name: 'MOV (ProRes 4444)',
        description: 'High-quality Apple ProRes with transparency support',
        pros: ['Professional quality', 'Excellent transparency', 'Industry standard'],
        cons: ['Large file sizes', 'Limited browser support'],
        bestFor: 'Professional workflows, After Effects, Final Cut Pro'
      },
      webm: {
        name: 'WebM (VP9)',
        description: 'Web-optimized format with transparency support',
        pros: ['Smaller file sizes', 'Web-native', 'Good compression'],
        cons: ['Lower quality than ProRes', 'Limited pro software support'],
        bestFor: 'Web use, social media, general sharing'
      },
      gif: {
        name: 'GIF (Animated)',
        description: 'Classic animated GIF with optimized palette',
        pros: ['Universal support', 'Perfect loops', 'Small file sizes', 'Transparency'],
        cons: ['256 color limit', 'No audio support'],
        bestFor: 'Social media, memes, simple animations, loops'
      }
    };
  }
}

module.exports = new VideoEncoder();