import 'dotenv/config';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

console.log('🕵️  Starting GraphQL snooper...\n');

const browser = await puppeteer.launch({
  headless: false, // Run visible so you can see what's happening
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const page = await browser.newPage();

// Intercept all network requests
const graphqlRequests = [];

page.on('request', request => {
  const url = request.url();
  if (url.includes('/graphql/')) {
    const match = url.match(/\/graphql\/([^/]+)\/([^?]+)/);
    if (match) {
      const [_, queryId, operationName] = match;
      graphqlRequests.push({ queryId, operationName, url: url.split('?')[0] });
      console.log(`📡 GraphQL: ${operationName}`);
      console.log(`   Query ID: ${queryId}`);
      console.log(`   URL: ${url.split('?')[0]}\n`);
    }
  }
});

page.on('response', async response => {
  const url = response.url();
  if (url.includes('/graphql/')) {
    console.log(`✓ Response: ${response.status()} ${url.split('?')[0]}\n`);
  }
});

console.log('🌐 Navigating to X.com...\n');
await page.goto('https://x.com', { waitUntil: 'networkidle2' });

console.log('\n📋 Waiting 10 seconds for you to navigate around...');
console.log('   Try: searching for tweets, viewing a profile, etc.\n');

await new Promise(resolve => setTimeout(resolve, 10000));

console.log('\n📊 Summary of GraphQL endpoints discovered:\n');
const unique = [...new Map(graphqlRequests.map(r => [r.operationName, r])).values()];

unique.forEach(({ queryId, operationName, url }) => {
  console.log(`${operationName}:`);
  console.log(`  Query ID: ${queryId}`);
  console.log(`  URL: ${url}\n`);
});

console.log('💾 Saving to graphql-endpoints.json...');
import fs from 'fs';
fs.writeFileSync('graphql-endpoints.json', JSON.stringify(unique, null, 2));

console.log('\n✅ Done! Close the browser when ready.\n');
console.log('The browser will stay open so you can explore more.');
console.log('Press Ctrl+C to exit when finished.\n');

// Keep running until manually stopped
await new Promise(() => {});
