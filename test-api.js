const fs = require('fs');
const path = require('path');

async function testRenderAPI() {
  console.log('Testing Chatooly Render Service API...\n');
  
  const API_URL = 'http://localhost:3001';
  
  // Test HTML with animation
  const testHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Render Test</title>
      <style>
        body { margin: 0; padding: 0; }
        canvas { display: block; }
      </style>
    </head>
    <body>
      <canvas id="canvas" width="800" height="600"></canvas>
      <script>
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        
        function draw(time) {
          ctx.clearRect(0, 0, 800, 600);
          
          // Animated circle
          const x = 400 + Math.sin(time * 2) * 150;
          const y = 300 + Math.cos(time * 3) * 100;
          const radius = 30 + Math.sin(time * 4) * 20;
          
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = 'hsl(' + (time * 100) + ', 70%, 50%)';
          ctx.fill();
          
          // Static text
          ctx.font = '24px Arial';
          ctx.fillStyle = 'black';
          ctx.fillText('Chatooly Render Test', 250, 50);
        }
        
        // Initial draw
        draw(0);
        
        // Global update function for renderer
        window.updateAnimation = function(time) {
          draw(time);
        };
      </script>
    </body>
    </html>
  `;
  
  try {
    // Step 1: Create render job
    console.log('1. Creating render job...');
    const createResponse = await fetch(`${API_URL}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html: testHTML,
        duration: 2,        // 2 seconds
        fps: 15,           // 15 frames per second
        width: 800,
        height: 600,
        resolution: 1,     // Normal resolution for testing
        transparent: false,
        toolName: 'test-tool'
      })
    });
    
    if (!createResponse.ok) {
      const error = await createResponse.text();
      throw new Error(`Failed to create job: ${error}`);
    }
    
    const job = await createResponse.json();
    console.log(`   ✓ Job created: ${job.jobId}`);
    console.log(`   Total frames: ${job.totalFrames}`);
    
    // Step 2: Poll for status
    console.log('\n2. Waiting for rendering to complete...');
    let status;
    let attempts = 0;
    const maxAttempts = 60; // 60 seconds timeout
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      
      const statusResponse = await fetch(`${API_URL}/status/${job.jobId}`);
      status = await statusResponse.json();
      
      if (status.status === 'completed') {
        console.log(`   ✓ Rendering completed!`);
        break;
      } else if (status.status === 'failed') {
        throw new Error(`Job failed: ${status.error}`);
      } else {
        const progress = Math.round((status.currentFrame / status.totalFrames) * 100);
        process.stdout.write(`\r   Processing: ${status.currentFrame}/${status.totalFrames} frames (${progress}%)`);
      }
      
      attempts++;
    }
    
    if (status.status !== 'completed') {
      throw new Error('Job timed out');
    }
    
    console.log(`\n   File size: ${status.fileSize}`);
    
    // Step 3: Download the ZIP file
    console.log('\n3. Downloading rendered frames...');
    const downloadResponse = await fetch(`${API_URL}/download/${job.jobId}`);
    
    if (!downloadResponse.ok) {
      throw new Error(`Failed to download: ${downloadResponse.statusText}`);
    }
    
    const buffer = await downloadResponse.arrayBuffer();
    const outputPath = path.join(__dirname, `test-render-${job.jobId}.zip`);
    fs.writeFileSync(outputPath, Buffer.from(buffer));
    
    console.log(`   ✓ Downloaded to: ${outputPath}`);
    
    // Step 4: Test health endpoint
    console.log('\n4. Testing health endpoint...');
    const healthResponse = await fetch(`${API_URL}/health`);
    const health = await healthResponse.json();
    console.log(`   ✓ Service status: ${health.status}`);
    console.log(`   Active jobs: ${health.activeJobs}`);
    console.log(`   Completed jobs: ${health.completedJobs}`);
    
    console.log('\n✅ All API tests passed successfully!');
    console.log(`   Output saved to: ${outputPath}`);
    
  } catch (error) {
    console.error('\n❌ API test failed:');
    console.error(error.message);
    process.exit(1);
  }
}

// Check if server is running first
async function checkServer() {
  try {
    const response = await fetch('http://localhost:3001/health');
    if (!response.ok) {
      throw new Error('Server not responding');
    }
    return true;
  } catch (error) {
    console.error('❌ Server is not running!');
    console.error('Please start the server first with: npm start');
    process.exit(1);
  }
}

// Run the test
(async () => {
  await checkServer();
  await testRenderAPI();
})();