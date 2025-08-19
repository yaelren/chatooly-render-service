# Chatooly CDN - Render Service Integration Design Document

## Executive Summary
This document outlines the design and implementation plan for integrating the Chatooly Render Service with the Chatooly CDN UI. The integration will add an export section to the CDN button with separate options for static images (PNGs) and animations/videos.

## Architecture Overview

### Current State
- **Render Service**: Standalone Node.js service deployed on Render.com
- **API Endpoint**: POST `/render` accepting HTML content and rendering parameters
- **Export Formats**: ZIP (PNG sequence), MP4, WebM, GIF (if video encoder available)
- **Processing**: Asynchronous job queue with status tracking

### Target State
- **CDN UI**: Enhanced export menu with two main sections
  - Images: Existing PNG export functionality
  - Animations/Movies: New integration with Render Service
- **Canvas Handling**: Proper serialization and transmission of canvas content
- **Progress Tracking**: Real-time feedback during rendering

## UI/UX Design

### Export Menu Structure
```
CDN Button
└── Export Section (expandable)
    ├── 📸 Images
    │   ├── 1x PNG (existing)
    │   └── 2x PNG (existing)
    └── 🎬 Animations
        ├── 📦 PNG Sequence (.zip) ← MVP
        ├── 🎥 WebM Video ← Phase 2
        └── 🎬 MOV Video ← Phase 3
```

### Animation Export Dialog (Modal Overlay)
```
┌─────────────────────────────────────┐
│       Export Animation               │
├─────────────────────────────────────┤
│ Duration:  [5] seconds (max 15)     │
│ Format:    [PNG Sequence ▼]         │
│ ☑ Transparent Background            │ ← Auto-detected + user override
├─────────────────────────────────────┤
│ [Cancel]           [Export]         │
└─────────────────────────────────────┘
```

### Progress Modal
```
┌─────────────────────────────────────┐
│       Exporting Animation...         │
├─────────────────────────────────────┤
│ [████████████░░░░] 75%              │
│ Frame 112/150                       │
│                                     │
│ [Cancel Export]                     │
└─────────────────────────────────────┘
```

## Technical Implementation

### 1. Canvas Serialization Strategy

#### Simple Canvas Capture (Recommended for MVP)
```javascript
function captureCanvasForAnimation() {
  const canvas = document.getElementById('chatooly-canvas');
  const container = document.getElementById('chatooly-container');
  
  // Auto-detect transparency
  const isTransparent = detectCanvasTransparency(canvas, container);
  
  // Get canvas dimensions
  const width = canvas.width || 800;
  const height = canvas.height || 600;
  
  // Create minimal HTML wrapper - render service will record live animation
  const html = `<!DOCTYPE html>
<html>
<head>
    <style>
        body { margin: 0; padding: 0; background: ${isTransparent ? 'transparent' : 'white'}; }
        canvas { display: block; }
    </style>
</head>
<body>
    <canvas id="chatooly-canvas" width="${width}" height="${height}"></canvas>
    <script>
        // Animation will continue running - render service records it
        // Future: Add window.updateAnimation(time) for precise control
    </script>
</body>
</html>`;
  
  return { html, transparent: isTransparent, width, height };
}

function detectCanvasTransparency(canvas, container) {
  // Check CSS backgrounds
  const containerBg = getComputedStyle(container).backgroundColor;
  const canvasBg = getComputedStyle(canvas).backgroundColor;
  
  if (containerBg === 'transparent' || containerBg === 'rgba(0, 0, 0, 0)') {
    return true;
  }
  
  // Sample canvas pixels for transparency
  try {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, 1, 1);
    const alpha = imageData.data[3];
    return alpha < 255;
  } catch (e) {
    return false; // Fallback if canvas access fails
  }
}
```

### 2. API Integration Layer

```javascript
class RenderServiceClient {
  constructor(config) {
    this.baseUrl = config.renderServiceUrl || 'https://chatooly-render.onrender.com';
    this.timeout = config.timeout || 300000; // 5 minutes
  }

  async exportAnimation(options) {
    // Prepare the payload (simplified for MVP)
    const payload = {
      html: options.html,
      duration: options.duration,        // User configurable (max 15 seconds)
      fps: 30,                          // Fixed at 30fps
      width: options.canvasWidth,
      height: options.canvasHeight,
      resolution: 1,                    // Fixed at 1x
      transparent: options.transparent, // Auto-detected + user override
      toolName: 'chatooly-cdn',
      exportFormat: options.format,     // 'zip' for MVP, 'webm'/'mov' later
      videoQuality: 'high',             // Fixed quality
      animationSpeed: 1,                // Fixed speed
      perfectLoop: false,               // Disabled for MVP
      naturalPeriod: null               // Disabled for MVP
    };

    // Submit render job
    const response = await fetch(`${this.baseUrl}/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Render service error: ${response.status}`);
    }

    const { jobId } = await response.json();
    return this.pollJobStatus(jobId);
  }

  async pollJobStatus(jobId) {
    const pollInterval = 1000; // 1 second
    const maxAttempts = this.timeout / pollInterval;
    
    for (let i = 0; i < maxAttempts; i++) {
      const status = await this.getJobStatus(jobId);
      
      if (status.status === 'completed') {
        return status.downloadUrl;
      }
      
      if (status.status === 'failed') {
        throw new Error(status.error || 'Render failed');
      }
      
      // Update progress UI
      this.updateProgress(status.progress);
      
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    throw new Error('Render timeout');
  }

  async getJobStatus(jobId) {
    const response = await fetch(`${this.baseUrl}/status/${jobId}`);
    return response.json();
  }

  updateProgress(progress) {
    // Update modal progress bar
    this.showProgressModal(progress);
  }
  
  showProgressModal(progress) {
    // Show modal overlay with progress bar
    const modal = document.getElementById('chatooly-export-modal');
    if (!modal) {
      this.createProgressModal();
    }
    
    const progressBar = modal.querySelector('.progress-fill');
    const progressText = modal.querySelector('.progress-text');
    
    progressBar.style.width = progress + '%';
    progressText.textContent = `Frame ${Math.round(progress * totalFrames / 100)}/${totalFrames}`;
  }
  
  handleError(error) {
    this.hideProgressModal();
    alert(`Export failed: ${error.message}\nPlease try again or contact support.`);
  }
}
```

### 3. CDN UI Integration

```javascript
// Extension to existing CDN button functionality
class CDNExportMenu {
  constructor() {
    this.renderClient = new RenderServiceClient({
      renderServiceUrl: window.CHATOOLY_CONFIG?.renderServiceUrl
    });
  }

  async handleAnimationExport(format) {
    try {
      // Show export dialog
      const options = await this.showExportDialog(format);
      if (!options) return; // User cancelled
      
      // Show progress overlay
      this.showProgressOverlay();
      
      // Capture canvas content
      const html = this.captureCanvasContent();
      
      // Get animation parameters
      const animationParams = this.getAnimationParameters();
      
      // Submit to render service
      const downloadUrl = await this.renderClient.exportAnimation({
        html,
        format: options.format,
        duration: options.duration,
        fps: options.fps,
        resolution: options.resolution,
        transparent: options.transparent,
        quality: options.quality,
        perfectLoop: options.perfectLoop,
        ...animationParams
      });
      
      // Trigger download
      this.downloadFile(downloadUrl);
      
      // Hide progress overlay
      this.hideProgressOverlay();
      
    } catch (error) {
      console.error('Export failed:', error);
      this.showError(error.message);
      this.hideProgressOverlay();
    }
  }

  captureCanvasContent() {
    // Implementation depends on Chatooly's canvas structure
    const canvasWrapper = document.querySelector('.chatooly-canvas-wrapper');
    
    // Option 1: If using HTML5 Canvas
    const canvas = canvasWrapper.querySelector('canvas');
    if (canvas) {
      return this.wrapCanvasInHTML(canvas);
    }
    
    // Option 2: If using DOM-based animations
    return this.serializeDOMCanvas(canvasWrapper);
  }

  getAnimationParameters() {
    // Extract animation-specific parameters
    return {
      animationCode: this.extractAnimationCode(),
      canvasWidth: this.getCanvasWidth(),
      canvasHeight: this.getCanvasHeight(),
      toolName: this.getToolName()
    };
  }
}
```

## Implementation Tasks

### Phase 1: MVP Implementation (Week 1-2)
- [ ] **Task 1.1**: Create RenderServiceClient class
  - Implement API communication layer
  - Add simple alert error handling
  - Set up modal progress tracking
  
- [ ] **Task 1.2**: Implement simple canvas capture
  - Develop minimal HTML wrapper method
  - Add transparency auto-detection
  - Test with different Chatooly tools
  
- [ ] **Task 1.3**: Build export dialog modal
  - Create modal component with duration input (max 15s)
  - Add transparency toggle (auto-detected)
  - Start with PNG Sequence format only
  
- [ ] **Task 1.4**: Modify CDN button menu
  - Add Animations section to existing Images section
  - Maintain visual consistency
  - Wire up modal triggers

### Phase 2: Video Support (Week 3-4)
- [ ] **Task 2.1**: Add WebM export format
  - Extend export dialog with format dropdown
  - Test video output quality
  - Handle larger file downloads
  
- [ ] **Task 2.2**: Add MOV export format
  - Complete video format support
  - Optimize for different use cases
  - Add format descriptions/recommendations
  
- [ ] **Task 2.3**: Progress modal enhancement
  - Improve progress feedback
  - Add cancel functionality
  - Handle different export types

### Phase 3: Polish & Optimization (Week 5)
- [ ] **Task 3.1**: Cross-browser testing
  - Test on Chrome, Firefox, Safari, Edge
  - Verify canvas serialization across tools
  - Check download functionality
  
- [ ] **Task 3.2**: Error handling refinement
  - Improve error messages
  - Add retry mechanisms for failed exports
  - Handle service downtime gracefully
  
- [ ] **Task 3.3**: Performance optimization
  - Optimize canvas capture for larger canvases
  - Minimize payload size
  - Test with various animation types

### Phase 4: Future Enhancements (Later)
- [ ] **Task 4.1**: Advanced animation control
  - Add window.updateAnimation(time) support
  - Implement perfect loop detection
  - Add animation speed control
  
- [ ] **Task 4.2**: Enhanced UI features
  - Add export presets
  - Batch export support
  - Export history/caching

## Configuration Requirements

### CDN Frontend Configuration
```javascript
window.CHATOOLY_CONFIG = {
  renderServiceUrl: 'https://chatooly-render-service.onrender.com',
  maxRenderDuration: 15, // seconds (free tier limit)
  defaultDuration: 5,    // seconds
  fps: 30,              // fixed
  resolution: 1,        // fixed at 1x
  supportedFormats: ['zip'], // MVP: PNG sequence only
  futureFormats: ['webm', 'mov'], // Phase 2 & 3
  enableTransparencyDetection: true
};
```

### Environment Variables
```bash
# .env file for CDN
RENDER_SERVICE_URL=https://chatooly-render.onrender.com
RENDER_SERVICE_TIMEOUT=300000
ENABLE_VIDEO_EXPORT=true
ENABLE_GIF_EXPORT=true
```

## API Specifications

### Request Format
```typescript
interface RenderRequest {
  html: string;           // Serialized canvas HTML
  duration: number;       // Animation duration in seconds
  fps: number;           // Frames per second (15, 24, 30, 60)
  width: number;         // Canvas width in pixels
  height: number;        // Canvas height in pixels
  resolution: number;    // Multiplier (1, 2, 3, 4)
  transparent: boolean;  // Background transparency
  toolName: string;      // Source tool identifier
  animationCode?: string; // Optional animation script
  exportFormat: 'zip' | 'mp4' | 'webm' | 'gif';
  videoQuality: 'low' | 'medium' | 'high' | 'ultra';
  animationSpeed: number; // Playback speed multiplier
  perfectLoop: boolean;   // Enable perfect looping
  naturalPeriod?: number; // Natural animation period
}
```

### Response Format
```typescript
interface RenderResponse {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  currentFrame?: number;
  totalFrames: number;
  downloadUrl?: string;
  error?: string;
  fileSize?: number;
}
```

## Security Considerations

1. **CORS Configuration**
   - Whitelist Chatooly domains
   - Implement origin validation
   - Use secure headers

2. **Content Validation**
   - Sanitize HTML input
   - Limit payload size
   - Validate animation scripts

3. **Rate Limiting**
   - Implement per-user limits
   - Add queue management
   - Monitor resource usage

4. **Authentication (Future)**
   - Add API key authentication
   - Implement user quotas
   - Track usage metrics

## Performance Optimization

### Canvas Serialization
- Use efficient DOM traversal
- Minimize style computation
- Compress HTML before transmission
- Cache repeated elements

### Network Optimization
- Use compression (gzip/brotli)
- Implement request batching
- Add client-side caching
- Use CDN for downloads

### Rendering Optimization
- Prioritize active user jobs
- Implement smart queueing
- Cache rendered frames
- Optimize memory usage

## Monitoring & Analytics

### Metrics to Track
- Export success rate
- Average render time by format
- Most popular export formats
- Error frequency and types
- Canvas size distribution
- User engagement with export features

### Implementation
```javascript
class ExportAnalytics {
  trackExportStart(format, options) {
    gtag('event', 'export_start', {
      event_category: 'animation_export',
      event_label: format,
      custom_dimensions: {
        duration: options.duration,
        fps: options.fps,
        resolution: options.resolution
      }
    });
  }

  trackExportComplete(format, duration, fileSize) {
    gtag('event', 'export_complete', {
      event_category: 'animation_export',
      event_label: format,
      value: duration,
      custom_dimensions: {
        file_size: fileSize,
        render_time: duration
      }
    });
  }

  trackExportError(format, error) {
    gtag('event', 'export_error', {
      event_category: 'animation_export',
      event_label: format,
      custom_dimensions: {
        error_message: error.message,
        error_code: error.code
      }
    });
  }
}
```

## Testing Strategy

### Unit Tests
- Canvas serialization functions
- API client methods
- Progress tracking
- Error handling

### Integration Tests
- End-to-end export flow
- Different canvas types
- Various export formats
- Error scenarios

### Performance Tests
- Large canvas handling
- Concurrent exports
- Memory usage
- Network reliability

### User Acceptance Tests
- Export quality verification
- UI responsiveness
- Progress accuracy
- Download reliability

## Rollout Plan

### Phase 1: Beta Testing
- Deploy to staging environment
- Test with internal team
- Gather feedback
- Fix critical issues

### Phase 2: Limited Release
- Enable for 10% of users
- Monitor performance metrics
- Collect user feedback
- Iterate on UI/UX

### Phase 3: Full Release
- Enable for all users
- Announce feature
- Provide documentation
- Monitor adoption

## Success Criteria

1. **Technical Success**
   - 95% export success rate
   - < 30 second average render time for 5-second animations
   - < 500MB memory usage per job
   - 99.9% service uptime

2. **User Success**
   - 50% feature adoption within first month
   - < 2% error rate
   - Positive user feedback (>4.0 rating)
   - Increased user engagement

## Test Pages

### Animation Export Tests
- [Simple Canvas Animation Test](../chatooly-cdn/tests/test-animation-export.html) - Basic spinning circle animation
- [Three.js Animation Test](../chatooly-cdn/tests/test-threejs-export.html) - 3D rotating cube with library inlining
- [p5.js Test](../chatooly-cdn/tests/test-p5.html) - p5.js animation export
- [Three.js Test](../chatooly-cdn/tests/test-three.html) - Three.js scene export  
- [DOM Test](../chatooly-cdn/tests/test-dom.html) - DOM-based gradient animation
- [Comprehensive Test](../chatooly-cdn/tests/test-comprehensive.html) - Full functionality suite

## Appendix

### A. Sample Implementation Code

```javascript
// Complete integration example
class ChatoolyCDNExporter {
  constructor() {
    this.renderService = new RenderServiceClient();
    this.analytics = new ExportAnalytics();
    this.initializeUI();
  }

  initializeUI() {
    // Add export menu to CDN button
    const cdnButton = document.querySelector('.cdn-button');
    const exportMenu = this.createExportMenu();
    cdnButton.appendChild(exportMenu);
    
    // Bind event handlers
    this.bindEventHandlers();
  }

  createExportMenu() {
    const menu = document.createElement('div');
    menu.className = 'export-menu';
    menu.innerHTML = `
      <div class="export-section">
        <h3>📸 Images</h3>
        <button data-export="png">PNG</button>
      </div>
      <div class="export-section">
        <h3>🎬 Animations</h3>
        <button data-export="zip">PNG Sequence</button>
        <button data-export="mp4">MP4 Video</button>
        <button data-export="webm">WebM Video</button>
        <button data-export="gif">GIF</button>
      </div>
    `;
    return menu;
  }

  async handleExport(format) {
    this.analytics.trackExportStart(format);
    
    try {
      const options = await this.getExportOptions(format);
      const html = this.captureCanvas();
      
      const result = await this.renderService.exportAnimation({
        html,
        format,
        ...options
      });
      
      this.downloadResult(result);
      this.analytics.trackExportComplete(format, result.renderTime, result.fileSize);
      
    } catch (error) {
      this.handleError(error);
      this.analytics.trackExportError(format, error);
    }
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  window.chatoolyExporter = new ChatoolyCDNExporter();
});
```

### B. Troubleshooting Guide

| Issue | Possible Cause | Solution |
|-------|---------------|----------|
| Export fails immediately | Canvas serialization error | Check console for JS errors, verify canvas structure |
| Export times out | Large canvas or slow connection | Reduce resolution or duration, check network |
| Downloaded file is corrupted | Incomplete render | Verify job status before download |
| Animation doesn't loop | Incorrect period detection | Manually set loop duration |
| No transparency in export | Format doesn't support alpha | Use PNG sequence or WebM |

### C. Future Enhancements

1. **Cloud Storage Integration**
   - Direct upload to Google Drive
   - Dropbox integration
   - S3 bucket support

2. **Advanced Export Options**
   - Custom frame ranges
   - Sprite sheet generation
   - Audio synchronization

3. **Collaboration Features**
   - Share render jobs
   - Team render queues
   - Export presets

4. **AI Enhancement**
   - Auto-optimize settings
   - Quality prediction
   - Format recommendations

---

*Document Version: 1.0*  
*Last Updated: August 2025*  
*Author: Chatooly Development Team*