const puppeteer = require('puppeteer');

async function testLocalChrome() {
  console.log('Testing local Chrome/Puppeteer setup...\n');
  
  try {
    // Test 1: Launch browser
    console.log('1. Launching browser...');
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
    console.log('   ✓ Browser launched successfully');
    
    // Test 2: Create a page
    console.log('\n2. Creating new page...');
    const page = await browser.newPage();
    console.log('   ✓ Page created');
    
    // Test 3: Set viewport
    console.log('\n3. Setting viewport...');
    await page.setViewport({ width: 1920, height: 1080 });
    console.log('   ✓ Viewport set to 1920x1080');
    
    // Test 4: Load content with animation
    console.log('\n4. Loading animated content...');
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head><title>Animation Test</title></head>
        <body>
          <canvas id="testCanvas" width="800" height="600"></canvas>
          <script>
            const canvas = document.getElementById('testCanvas');
            const ctx = canvas.getContext('2d');
            let frame = 0;
            
            function animate() {
              ctx.clearRect(0, 0, 800, 600);
              ctx.fillStyle = 'hsl(' + (frame * 2) + ', 70%, 50%)';
              ctx.fillRect(100 + Math.sin(frame * 0.1) * 50, 100, 200, 200);
              frame++;
            }
            
            // Initial render
            animate();
            
            // Store animation function globally
            window.updateAnimation = function(time) {
              frame = Math.floor(time * 30); // 30 fps
              animate();
            };
          </script>
        </body>
      </html>
    `);
    console.log('   ✓ HTML content loaded');
    
    // Test 5: Simulate animation frames
    console.log('\n5. Testing animation frames...');
    for (let i = 0; i < 5; i++) {
      await page.evaluate((time) => {
        if (window.updateAnimation) {
          window.updateAnimation(time);
        }
      }, i / 30);
      
      await page.screenshot({ 
        path: `test-frame-${i}.png`,
        type: 'png',
        omitBackground: true
      });
      console.log(`   ✓ Frame ${i} captured`);
    }
    
    // Test 6: Close browser
    console.log('\n6. Closing browser...');
    await browser.close();
    console.log('   ✓ Browser closed');
    
    console.log('\n✅ All tests passed! Local Chrome/Puppeteer is working correctly.');
    console.log('   Generated test frames: test-frame-0.png through test-frame-4.png');
    
  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error);
    process.exit(1);
  }
}

// Run the test
testLocalChrome();