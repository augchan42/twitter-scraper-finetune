import 'dotenv/config';
import { Scraper } from 'goat-x';

console.log('🔍 Testing goat-x authentication...');
console.log('Environment variables:');
console.log('  TWITTER_USERNAME:', process.env.TWITTER_USERNAME ? '✓ Set' : '✗ Missing');
console.log('  TWITTER_PASSWORD:', process.env.TWITTER_PASSWORD ? '✓ Set' : '✗ Missing');
console.log('  TWITTER_EMAIL:', process.env.TWITTER_EMAIL ? '✓ Set' : '✗ Missing');

const scraper = new Scraper();

// Patch fetch to log requests
const originalFetch = global.fetch;
global.fetch = async (url, options) => {
  console.log('\n📡 HTTP Request:');
  console.log('  URL:', url.toString());
  console.log('  Method:', options?.method || 'GET');

  const response = await originalFetch(url, options);
  console.log('  Status:', response.status, response.statusText);

  return response;
};

try {
  console.log('\n🔐 Attempting login...');
  await scraper.login(
    process.env.TWITTER_USERNAME,
    process.env.TWITTER_PASSWORD,
    process.env.TWITTER_EMAIL
  );

  console.log('\n✅ Login successful!');

  const isLoggedIn = await scraper.isLoggedIn();
  console.log('Logged in:', isLoggedIn);

} catch (error) {
  console.error('\n❌ Login failed:');
  console.error('  Message:', error.message);
  console.error('  Full error:', JSON.stringify(error, null, 2));
  process.exit(1);
}
