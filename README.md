# Chatooly Render Service

High-resolution PNG sequence rendering service for Chatooly tools. Powered by Puppeteer and hosted on Render.com.

## Features

- 🎨 High-resolution PNG sequence export (up to 4x resolution)
- 🎬 Configurable frame rate and duration
- 🔲 Transparent background support
- 📦 Automatic ZIP packaging
- ⚡ Concurrent job processing
- 🧹 Automatic cleanup of old files

## Quick Start

### Local Development

1. **Clone the repository:**
```bash
git clone https://github.com/yourusername/chatooly-render-service.git
cd chatooly-render-service
```

2. **Install dependencies:**
```bash
npm install
```

3. **Set up environment variables:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Start the development server:**
```bash
npm run dev
```

The service will be available at `http://localhost:3001`

### Production Deployment (Render.com)

1. **Push to GitHub:**
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/chatooly-render-service.git
git push -u origin main
```

2. **Deploy to Render.com:**
- Go to [Render Dashboard](https://dashboard.render.com)
- Click "New +" → "Web Service"
- Connect your GitHub repository
- Render will automatically detect the `render.yaml` configuration
- Click "Create Web Service"

3. **Configure environment variables in Render:**
- `CORS_ORIGIN`: Set to your CDN URL (e.g., `https://yaelren.github.io`)
- Other variables are pre-configured in `render.yaml`

## API Documentation

### POST /render
Create a new rendering job.

**Request Body:**
```json
{
  "html": "<!DOCTYPE html>...",
  "duration": 3,
  "fps": 30,
  "width": 1920,
  "height": 1080,
  "resolution": 2,
  "transparent": true,
  "toolName": "my-tool",
  "animationCode": "// JavaScript animation code"
}
```

**Response:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716",
  "status": "queued",
  "totalFrames": 90,
  "message": "Job created successfully"
}
```

### GET /status/:jobId
Check the status of a rendering job.

**Response:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716",
  "status": "completed",
  "progress": 100,
  "currentFrame": 90,
  "totalFrames": 90,
  "downloadUrl": "/download/550e8400-e29b-41d4-a716",
  "fileSize": "125MB"
}
```

### GET /download/:jobId
Download the completed ZIP file containing PNG frames.

### GET /health
Health check endpoint for monitoring.

## Testing

### Test with cURL

1. **Create a render job:**
```bash
curl -X POST http://localhost:3001/render \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<canvas id=\"canvas\"></canvas><script>/* animation code */</script>",
    "duration": 2,
    "fps": 30
  }'
```

2. **Check job status:**
```bash
curl http://localhost:3001/status/YOUR_JOB_ID
```

3. **Download frames:**
```bash
curl -O http://localhost:3001/download/YOUR_JOB_ID
```

### Test HTML Page

Create a test HTML file and open it in your browser:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Render Service Test</title>
</head>
<body>
  <button onclick="testRender()">Test Render</button>
  <div id="status"></div>
  
  <script>
    async function testRender() {
      const response = await fetch('http://localhost:3001/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: '<canvas></canvas>',
          duration: 1,
          fps: 10
        })
      });
      
      const data = await response.json();
      document.getElementById('status').innerText = JSON.stringify(data, null, 2);
      
      // Poll for status
      pollStatus(data.jobId);
    }
    
    async function pollStatus(jobId) {
      const interval = setInterval(async () => {
        const response = await fetch(`http://localhost:3001/status/${jobId}`);
        const data = await response.json();
        
        document.getElementById('status').innerText = JSON.stringify(data, null, 2);
        
        if (data.status === 'completed') {
          clearInterval(interval);
          window.location.href = `http://localhost:3001/download/${jobId}`;
        }
      }, 1000);
    }
  </script>
</body>
</html>
```

## Architecture

```
Client (Chatooly CDN)
    ↓
Express Server (server.js)
    ↓
Job Queue (in-memory)
    ↓
Puppeteer Renderer
    ↓
Frame Capture (PNG)
    ↓
ZIP Packager
    ↓
Download Endpoint
```

## Configuration

Environment variables can be set in `.env` file or through Render.com dashboard:

- `PORT`: Server port (default: 3001)
- `CORS_ORIGIN`: Allowed origin for CORS (default: *)
- `MAX_CONCURRENT_JOBS`: Maximum parallel render jobs (default: 3)
- `MAX_FRAMES_PER_JOB`: Maximum frames per job (default: 300)
- `MAX_RESOLUTION`: Maximum resolution multiplier (default: 4)
- `CLEANUP_INTERVAL`: Old file cleanup interval in ms (default: 3600000)

## Troubleshooting

### Puppeteer fails to launch
- Ensure Chrome/Chromium is installed
- On Render.com, Chromium is pre-installed
- Check Puppeteer launch args in `config/index.js`

### Out of memory errors
- Reduce `MAX_CONCURRENT_JOBS`
- Lower `MAX_RESOLUTION`
- Implement frame chunking for long animations

### CORS errors
- Set `CORS_ORIGIN` to your CDN URL
- Ensure credentials are included in requests

### Files not found after cleanup
- Increase `CLEANUP_INTERVAL`
- Download files promptly after completion

## Performance Tips

1. **Optimize HTML/CSS:**
   - Minimize external resources
   - Use inline styles and scripts
   - Avoid heavy libraries

2. **Frame Rate:**
   - 30 FPS is usually sufficient
   - Lower FPS for longer animations
   - Higher FPS only for smooth motion

3. **Resolution:**
   - 2x is good for most cases
   - 4x for print quality
   - 1x for quick previews

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

MIT License - See LICENSE file for details

## Support

For issues and questions, please open an issue on GitHub or contact the Chatooly team.