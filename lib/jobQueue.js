const { v4: uuidv4 } = require('uuid');
const config = require('../config');

class JobQueue {
  constructor() {
    this.jobs = new Map();
    this.activeJobs = 0;
    this.maxConcurrent = config.rendering.maxConcurrentJobs;
    this.queue = [];
  }
  
  createJob(data) {
    const jobId = uuidv4();
    const job = {
      id: jobId,
      status: 'queued',
      progress: 0,
      currentFrame: 0,
      totalFrames: data.duration * data.fps,
      data: data,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      error: null,
      downloadUrl: null,
      fileSize: null
    };
    
    this.jobs.set(jobId, job);
    this.queue.push(jobId);
    this.processQueue();
    
    return job;
  }
  
  getJob(jobId) {
    return this.jobs.get(jobId);
  }
  
  updateJob(jobId, updates) {
    const job = this.jobs.get(jobId);
    if (job) {
      Object.assign(job, updates);
      
      // Calculate progress percentage
      if (updates.currentFrame !== undefined) {
        job.progress = Math.round((updates.currentFrame / job.totalFrames) * 100);
      }
    }
    return job;
  }
  
  async processQueue() {
    if (this.activeJobs >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }
    
    const jobId = this.queue.shift();
    const job = this.jobs.get(jobId);
    
    if (!job || job.status !== 'queued') {
      return this.processQueue();
    }
    
    this.activeJobs++;
    this.updateJob(jobId, {
      status: 'processing',
      startedAt: new Date()
    });
    
    try {
      // Import renderer dynamically to avoid circular dependencies
      const renderer = require('../workers/renderer');
      await renderer.render(job);
      
      this.updateJob(jobId, {
        status: 'completed',
        completedAt: new Date(),
        progress: 100,
        downloadUrl: `/download/${jobId}`
      });
    } catch (error) {
      console.error(`Job ${jobId} failed:`, error);
      this.updateJob(jobId, {
        status: 'failed',
        error: error.message,
        completedAt: new Date()
      });
    } finally {
      this.activeJobs--;
      this.processQueue();
    }
  }
  
  getStats() {
    const jobs = Array.from(this.jobs.values());
    return {
      total: jobs.length,
      queued: jobs.filter(j => j.status === 'queued').length,
      processing: jobs.filter(j => j.status === 'processing').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed').length,
      activeJobs: this.activeJobs,
      queueLength: this.queue.length
    };
  }
  
  async cleanup() {
    // Cancel all pending jobs
    for (const jobId of this.queue) {
      this.updateJob(jobId, {
        status: 'cancelled',
        error: 'Server shutting down'
      });
    }
    this.queue = [];
  }
}

module.exports = new JobQueue();