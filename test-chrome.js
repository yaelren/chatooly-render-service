const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

async function testChrome() {
  console.log('Testing Chrome/Puppeteer setup...\n');
  
  try {
    // Test 1: Check if chromium can find executable
    console.log('1. Getting Chromium executable path...');
    const executablePath = await chromium.executablePath();
    console.log('   ✓ Executable path:', executablePath);
    
    // Test 2: Try to launch browser
    console.log('\n2. Launching browser...');
    const browser = await puppeteer.launch({
      executablePath: executablePath,
      headless: true,
      args: chromium.args.concat([
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080',
        '--single-process',
        '--no-zygote'
      ])
    });
    console.log('   ✓ Browser launched successfully');
    
    // Test 3: Create a page
    console.log('\n3. Creating new page...');
    const page = await browser.newPage();
    console.log('   ✓ Page created');
    
    // Test 4: Set viewport
    console.log('\n4. Setting viewport...');
    await page.setViewport({ width: 1920, height: 1080 });
    console.log('   ✓ Viewport set to 1920x1080');
    
    // Test 5: Load content
    console.log('\n5. Loading HTML content...');
    await page.setContent(`
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <h1>Chrome Test</h1>
          <canvas id="testCanvas" width="800" height="600"></canvas>
          <script>
            const canvas = document.getElementById('testCanvas');
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'red';
            ctx.fillRect(100, 100, 200, 200);
          </script>
        </body>
      </html>
    `);
    console.log('   ✓ HTML content loaded');
    
    // Test 6: Take screenshot
    console.log('\n6. Taking screenshot...');
    await page.screenshot({ path: 'test-screenshot.png' });
    console.log('   ✓ Screenshot saved as test-screenshot.png');
    
    // Test 7: Close browser
    console.log('\n7. Closing browser...');
    await browser.close();
    console.log('   ✓ Browser closed');
    
    console.log('\n✅ All tests passed! Chrome/Puppeteer is working correctly.');
    
  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error);
    console.error('\nError details:', {
      message: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Run the test
testChrome();