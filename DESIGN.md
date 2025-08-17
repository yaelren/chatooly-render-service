# Chatooly Render Service - System Design Document

## 1. Overview

The Chatooly Render Service is a dedicated Node.js/Express application hosted on Render.com that provides high-resolution PNG sequence export capabilities for all Chatooly tools. It uses Puppeteer for headless browser rendering, captures frames with transparency, and packages them for download.

## 2. Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   Client (Chatooly Tools)                 │
│  • Captures animation state                               │
│  • Sends render request                                   │
│  • Polls for status                                       │
│  • Downloads result                                       │
└────────────────────┬─────────────────────────────────────┘
                     │ HTTPS
┌────────────────────▼─────────────────────────────────────┐
│              Render.com Web Service                       │
├───────────────────────────────────────────────────────────┤
│  Express Server (server.js)                              │
│  ├─ POST /render         → Create render job             │
│  ├─ GET /status/:jobId   → Check job progress            │
│  ├─ GET /download/:jobId → Download ZIP file             │
│  └─ GET /health          → Service health check          │
├───────────────────────────────────────────────────────────┤
│  Renderer Worker (workers/renderer.js)                   │
│  ├─ Puppeteer instance management                        │
│  ├─ Frame-by-frame capture                               │
│  ├─ Transparent background handling                      │
│  └─ Progress reporting                                   │
├───────────────────────────────────────────────────────────┤
│  Storage Layer (storage/)                                │
│  ├─ /temp/jobs/{jobId}/frames/  → Individual PNGs       │
│  ├─ /temp/jobs/{jobId}/output.zip → Final package       │
│  └─ Automatic cleanup after 1 hour                      │
└───────────────────────────────────────────────────────────┘
```

## 3. Core Components

### 3.1 Express Server (server.js)
- **Purpose**: Main application entry point
- **Responsibilities**:
  - HTTP request handling
  - Middleware configuration (CORS, body parsing)
  - Route mounting
  - Error handling
  - Cleanup scheduling

### 3.2 Job Queue (lib/jobQueue.js)
- **Purpose**: Manage rendering jobs
- **Features**:
  - In-memory job storage
  - Concurrent job limiting
  - Progress tracking
  - Job status management
- **States**: queued → processing → completed/failed

### 3.3 Puppeteer Renderer (workers/renderer.js)
- **Purpose**: Headless browser rendering
- **Process**:
  1. Launch Puppeteer browser
  2. Create page with specified viewport
  3. Load HTML content
  4. Inject animation controller
  5. Capture frames at intervals
  6. Handle transparency
- **Optimizations**:
  - Browser instance reuse
  - Memory-efficient frame capture
  - Progress reporting

### 3.4 ZIP Packager (workers/packager.js)
- **Purpose**: Package frames for download
- **Features**:
  - Stream-based ZIP creation
  - Maximum compression
  - Metadata inclusion
  - Memory-efficient processing

## 4. Data Flow

### 4.1 Job Creation Flow
```
Client POST /render
    ↓
Validate input parameters
    ↓
Create job with UUID
    ↓
Add to job queue
    ↓
Return job ID to client
    ↓
Process job asynchronously
```

### 4.2 Rendering Flow
```
Dequeue job
    ↓
Launch Puppeteer
    ↓
Load HTML content
    ↓
For each frame:
    - Set animation time
    - Capture screenshot
    - Save as PNG
    - Update progress
    ↓
Package frames to ZIP
    ↓
Mark job complete
```

### 4.3 Download Flow
```
Client GET /download/:jobId
    ↓
Verify job exists and is complete
    ↓
Stream ZIP file to client
    ↓
File auto-deleted after 1 hour
```

## 5. API Specification

### 5.1 POST /render
Creates a new rendering job.

**Request Schema:**
```typescript
interface RenderRequest {
  html: string;           // HTML content to render
  duration?: number;      // Animation duration in seconds (default: 3)
  fps?: number;          // Frames per second (default: 30)
  width?: number;        // Canvas width (default: 1920)
  height?: number;       // Canvas height (default: 1080)
  resolution?: number;   // Resolution multiplier (default: 2)
  transparent?: boolean; // Transparent background (default: true)
  toolName?: string;     // Tool identifier
  animationCode?: string; // JavaScript animation controller
}
```

**Response Schema:**
```typescript
interface RenderResponse {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  totalFrames: number;
  message: string;
}
```

### 5.2 GET /status/:jobId
Gets the current status of a rendering job.

**Response Schema:**
```typescript
interface StatusResponse {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;      // 0-100
  currentFrame: number;
  totalFrames: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  downloadUrl?: string;  // Only when completed
  fileSize?: string;     // Only when completed
  error?: string;        // Only when failed
}
```

## 6. Animation Control Protocol

### 6.1 Time-based Animation
The renderer provides a global `setAnimationTime(seconds)` function that tools can use to update their animation state:

```javascript
window.setAnimationTime = (time) => {
  // Update animation based on time
  // This is called for each frame
};
```

### 6.2 Frame-based Animation
For frame-based animations, the current frame number is available:

```javascript
window.updateAnimation = (time) => {
  const frame = Math.floor(time * fps);
  // Update based on frame number
};
```

### 6.3 Integration with p5.js
For p5.js tools, the renderer can control the animation loop:

```javascript
// Override p5.js draw loop
let targetTime = 0;
window.setAnimationTime = (time) => {
  targetTime = time;
  redraw(); // Force p5.js to redraw
};
```

## 7. Performance Considerations

### 7.1 Memory Management
- **Stream Processing**: ZIP files created via streams
- **Frame Cleanup**: Delete frames after packaging
- **Browser Pooling**: Reuse Puppeteer instances
- **Job Limits**: Maximum 300 frames per job

### 7.2 Concurrency Control
- **Default**: 3 concurrent jobs
- **Queue System**: FIFO processing
- **Resource Monitoring**: Track memory usage
- **Graceful Degradation**: Reduce concurrency under load

### 7.3 Optimization Strategies
```javascript
// Puppeteer launch args for performance
args: [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--disable-gpu',
  '--single-process',
  '--no-zygote'
]
```

## 8. Error Handling

### 8.1 Input Validation
- HTML content required
- Frame limit enforcement
- Resolution limit check
- Sanitization of user input

### 8.2 Runtime Errors
- Puppeteer crash recovery
- Timeout protection (5 minutes)
- Disk space monitoring
- Network error handling

### 8.3 Error Response Format
```json
{
  "error": "Descriptive error message",
  "status": 400,
  "details": {
    "field": "duration",
    "issue": "exceeds maximum"
  }
}
```

## 9. Security Measures

### 9.1 CORS Configuration
```javascript
cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST'],
  credentials: true
})
```

### 9.2 Input Sanitization
- HTML content validation
- Script injection prevention
- Path traversal protection
- File size limits

### 9.3 Rate Limiting (Future)
```javascript
// Planned implementation
rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10 // 10 requests per minute
})
```

## 10. Storage Architecture

### 10.1 Directory Structure
```
storage/temp/
├── {jobId}/
│   ├── frames/
│   │   ├── frame_0000.png
│   │   ├── frame_0001.png
│   │   └── ...
│   └── output.zip
```

### 10.2 Cleanup Strategy
- **Automatic**: Hourly cron job
- **TTL**: 1 hour after creation
- **Manual**: On-demand cleanup API (future)

## 11. Deployment Architecture

### 11.1 Render.com Configuration
```yaml
services:
  - type: web
    name: chatooly-render-service
    env: node
    region: oregon
    plan: free
    buildCommand: npm install
    startCommand: npm start
```

### 11.2 Environment Variables
- `NODE_ENV`: production/development
- `PORT`: Server port
- `CORS_ORIGIN`: Allowed origins
- `MAX_CONCURRENT_JOBS`: Concurrency limit
- `PUPPETEER_EXECUTABLE_PATH`: Chrome path

### 11.3 Health Monitoring
```javascript
GET /health → {
  status: 'healthy',
  uptime: 3600,
  jobs: {
    active: 2,
    completed: 45,
    failed: 1
  }
}
```

## 12. Integration with CDN

### 12.1 CDN Updates Required
```javascript
// New export manager
class ExportManager {
  async exportPNGSequence(options) {
    const response = await fetch('https://chatooly-render.onrender.com/render', {
      method: 'POST',
      body: JSON.stringify(options)
    });
    // Poll for completion
  }
}
```

### 12.2 State Capture
The CDN needs to capture:
- Current canvas state
- Animation parameters
- User settings
- Random seeds (for reproducibility)

### 12.3 Progress UI
```javascript
// Poll for status updates
const pollInterval = setInterval(async () => {
  const status = await fetch(`/status/${jobId}`);
  updateProgressBar(status.progress);
}, 1000);
```

## 13. Testing Strategy

### 13.1 Unit Tests
```javascript
describe('Renderer', () => {
  test('captures correct number of frames');
  test('handles transparency correctly');
  test('respects resolution multiplier');
});
```

### 13.2 Integration Tests
```javascript
describe('API', () => {
  test('end-to-end render flow');
  test('concurrent job processing');
  test('error handling');
});
```

### 13.3 Performance Tests
- Memory usage under load
- Concurrent job handling
- Large animation rendering
- Cleanup verification

## 14. Future Enhancements

### 14.1 Phase 2 Features
- WebM video export
- GIF generation
- SVG sequence support
- Batch processing API

### 14.2 Phase 3 Features
- GPU acceleration
- Distributed rendering
- WebSocket progress updates
- Cloud storage integration

### 14.3 Optimization Opportunities
- Browser pool management
- Caching repeated renders
- Progressive enhancement
- CDN for downloads

## 15. Monitoring and Analytics

### 15.1 Metrics to Track
- Job success rate
- Average render time
- Frame capture speed
- Memory usage
- Disk usage

### 15.2 Logging Strategy
```javascript
console.log(`[${timestamp}] [${level}] ${message}`);
// Future: Integration with logging service
```

### 15.3 Alerting (Future)
- High failure rate
- Memory threshold exceeded
- Disk space low
- Response time degradation

## 16. Disaster Recovery

### 16.1 Backup Strategy
- Job metadata backup
- Render result caching
- Configuration backup

### 16.2 Failure Recovery
- Automatic job retry
- Graceful degradation
- Fallback rendering mode

This design provides a robust, scalable foundation for high-quality PNG sequence export, with clear upgrade paths for future enhancements.