import 'dotenv/config';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

console.log('🍪 Testing Saved Cookies Authentication\n');

const cookiesPath = './cookies/sixlinesapp_cookies.txt';

if (!fs.existsSync(cookiesPath)) {
  console.error('❌ No saved cookies found!');
  console.error(`   Cookie file not found: ${cookiesPath}\n`);
  process.exit(1);
}

const browser = await puppeteer.launch({
  headless: false,
  ignoreDefaultArgs: ['--enable-automation'],
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process'
  ]
});

const page = await browser.newPage();

// More realistic user agent
await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

// Set realistic viewport
await page.setViewport({ width: 1366, height: 768 });

// Additional stealth measures
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(navigator, 'languages', {
    get: () => ['en-US', 'en'],
  });

  Object.defineProperty(navigator, 'plugins', {
    get: () => [1, 2, 3, 4, 5],
  });

  delete navigator.__proto__.webdriver;
});

try {
  // Load cookies from Netscape format
  console.log('📂 Loading saved cookies from Netscape format...');
  const netscapeCookies = fs.readFileSync(cookiesPath, 'utf-8');
  const lines = netscapeCookies.split('\n');

  const cookies = [];
  for (const line of lines) {
    if (line.startsWith('#') || !line.trim()) continue;

    const parts = line.split('\t');
    if (parts.length < 7) continue;

    const [domain, , path, secure, expiration, name, value] = parts;

    cookies.push({
      name,
      value,
      domain: domain.startsWith('.') ? domain : domain,
      path,
      secure: secure === 'TRUE',
      httpOnly: false,
      expires: parseInt(expiration) > 0 ? parseInt(expiration) : undefined
    });
  }

  // Set cookies
  await page.setCookie(...cookies);
  console.log(`✓ Loaded ${cookies.length} cookies\n`);

  // Navigate to home page (should be logged in)
  console.log('🌐 Navigating to X.com home...');
  await page.goto('https://x.com/home', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });

  const currentUrl = page.url();
  console.log(`✓ Current URL: ${currentUrl}\n`);

  if (currentUrl.includes('/home')) {
    console.log('✅ SUCCESS! Logged in with saved cookies!\n');

    // Try to search
    console.log('🔍 Testing search functionality...');
    await page.goto('https://x.com/search?q=from:elonmusk&f=live', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await new Promise(r => setTimeout(r, 3000));

    console.log('✓ Search page loaded\n');

    // Check for tweets
    const tweets = await page.evaluate(() => {
      const articles = document.querySelectorAll('article[data-testid="tweet"]');
      return articles.length;
    });

    console.log(`📊 Found ${tweets} tweet elements on page\n`);

    if (tweets > 0) {
      console.log('✅ Scraping appears to be working!\n');
    } else {
      console.log('⚠️  No tweets found - may need to wait longer or adjust selectors\n');
    }

  } else {
    console.log('❌ Not logged in - cookies may have expired');
    console.log('   Please run: node login-save-cookies.js again\n');
  }

  console.log('Browser will stay open for 30 seconds so you can inspect...');
  await new Promise(r => setTimeout(r, 30000));

} catch (error) {
  console.error('\n❌ Error:', error.message);
} finally {
  await browser.close();
}
