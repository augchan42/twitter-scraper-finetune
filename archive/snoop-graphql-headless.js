import 'dotenv/config';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';

puppeteer.use(StealthPlugin());

console.log('🕵️  Starting headless GraphQL snooper with cookies...\n');

const browser = await puppeteer.launch({
  headless: false, // Keep visible for debugging
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled'
  ]
});

const page = await browser.newPage();

// Set user agent to look like a real browser
await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

// Load cookies from your file
console.log('🍪 Loading cookies...');
const cookiesPath = './cookies/sixlinesapp.txt';

if (fs.existsSync(cookiesPath)) {
  const netscapeCookies = fs.readFileSync(cookiesPath, 'utf-8');
  const lines = netscapeCookies.split('\n');

  for (const line of lines) {
    if (line.startsWith('#') || !line.trim()) continue;

    const parts = line.split('\t');
    if (parts.length < 7) continue;

    const [domain, , path, secure, expiration, name, value] = parts;

    await page.setCookie({
      name,
      value,
      domain: domain.startsWith('.') ? domain : '.' + domain,
      path,
      secure: secure === 'TRUE',
      httpOnly: false,
      expires: parseInt(expiration) > 0 ? parseInt(expiration) : undefined
    });
  }
  console.log('✓ Cookies loaded\n');
}

// Intercept all network requests
const graphqlRequests = [];

page.on('request', request => {
  const url = request.url();
  if (url.includes('/graphql/') || url.includes('/i/api/')) {
    const match = url.match(/\/graphql\/([^/]+)\/([^?]+)/);
    if (match) {
      const [_, queryId, operationName] = match;

      // Only log unique combinations
      const exists = graphqlRequests.find(r => r.operationName === operationName && r.queryId === queryId);
      if (!exists) {
        graphqlRequests.push({ queryId, operationName, url: url.split('?')[0] });
        console.log(`📡 NEW: ${operationName} → ${queryId}`);
      }
    }
  }
});

page.on('response', async response => {
  const url = response.url();
  if (url.includes('/graphql/')) {
    const status = response.status();
    const statusIcon = status === 200 ? '✓' : status === 404 ? '❌' : '⚠️';
    const match = url.match(/\/graphql\/[^/]+\/([^?]+)/);
    const operation = match ? match[1] : 'unknown';
    console.log(`${statusIcon} ${status} ${operation}`);
  }
});

console.log('🌐 Navigating to X.com home...\n');
await page.goto('https://x.com/home', { waitUntil: 'networkidle2', timeout: 30000 });

await new Promise(resolve => setTimeout(resolve, 3000));

// Try to search for tweets
console.log('\n🔍 Performing search...');
try {
  await page.goto('https://x.com/search?q=from:elonmusk&f=live', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });
  console.log('✓ Search page loaded\n');
  await new Promise(resolve => setTimeout(resolve, 5000));
} catch (e) {
  console.log('⚠️  Search failed:', e.message);
}

// Try to view a profile
console.log('\n👤 Viewing profile...');
try {
  await page.goto('https://x.com/elonmusk', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });
  console.log('✓ Profile page loaded\n');
  await new Promise(resolve => setTimeout(resolve, 5000));
} catch (e) {
  console.log('⚠️  Profile view failed:', e.message);
}

console.log('\n📊 Summary of GraphQL endpoints discovered:\n');
console.log('='.repeat(60) + '\n');

graphqlRequests.forEach(({ queryId, operationName, url }) => {
  console.log(`${operationName}:`);
  console.log(`  Query ID: ${queryId}`);
  console.log(`  Full URL: ${url}\n`);
});

console.log('💾 Saving to graphql-endpoints.json...');
fs.writeFileSync('graphql-endpoints.json', JSON.stringify(graphqlRequests, null, 2));

console.log('\n✅ Done! Found ' + graphqlRequests.length + ' unique GraphQL endpoints.');
console.log('\nClosing browser in 5 seconds...\n');

await new Promise(resolve => setTimeout(resolve, 5000));
await browser.close();
