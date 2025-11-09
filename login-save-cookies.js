import 'dotenv/config';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

console.log('🔐 Manual Login - Save Cookies\n');
console.log('This script will open a browser for you to MANUALLY log in.');
console.log('After you successfully log in, the cookies will be saved.\n');

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
  console.log('🌐 Navigating to X.com login page...\n');
  await page.goto('https://x.com/i/flow/login', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });

  console.log('👉 PLEASE LOG IN MANUALLY IN THE BROWSER WINDOW');
  console.log('   After you see your home feed, come back here and press Enter\n');

  // Wait for user input
  await new Promise(resolve => {
    process.stdin.once('data', () => resolve());
  });

  // Get current URL
  const currentUrl = page.url();
  console.log(`\n✓ Current URL: ${currentUrl}`);

  // Save cookies
  const cookies = await page.cookies();
  const cookiesDir = './cookies';

  if (!fs.existsSync(cookiesDir)) {
    fs.mkdirSync(cookiesDir);
  }

  const cookiesPath = `${cookiesDir}/twitter-session.json`;
  fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));

  console.log(`\n✅ Saved ${cookies.length} cookies to ${cookiesPath}`);
  console.log('\nYou can now use these cookies in your scraper!\n');

  // Also save as Netscape format for compatibility
  const netscapePath = `${cookiesDir}/twitter-session.txt`;
  const netscapeCookies = cookies.map(cookie => {
    const domain = cookie.domain.startsWith('.') ? cookie.domain : '.' + cookie.domain;
    const flag = 'TRUE';
    const path = cookie.path;
    const secure = cookie.secure ? 'TRUE' : 'FALSE';
    const expiration = cookie.expires || Math.floor(Date.now() / 1000) + 31536000;
    const name = cookie.name;
    const value = cookie.value;

    return `${domain}\t${flag}\t${path}\t${secure}\t${expiration}\t${name}\t${value}`;
  }).join('\n');

  fs.writeFileSync(netscapePath, '# Netscape HTTP Cookie File\n' + netscapeCookies);
  console.log(`✅ Also saved in Netscape format to ${netscapePath}\n`);

  console.log('Browser will close in 5 seconds...');
  await new Promise(r => setTimeout(r, 5000));

} catch (error) {
  console.error('\n❌ Error:', error.message);
} finally {
  await browser.close();
}
