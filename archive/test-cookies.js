import 'dotenv/config';
import { Scraper } from 'goat-x';
import fs from 'fs';

console.log('🍪 Testing cookie-based authentication...\n');

const scraper = new Scraper();

// Load cookies
const cookiesPath = 'cookies/sixlinesapp_cookies.json';
console.log(`📂 Loading cookies from: ${cookiesPath}`);

try {
  const cookiesData = fs.readFileSync(cookiesPath, 'utf-8');
  const cookies = JSON.parse(cookiesData);

  console.log(`✅ Loaded ${cookies.length} cookies`);

  // Set cookies
  await scraper.setCookies(cookies);
  console.log('✅ Cookies set in scraper\n');

  // Test if we're logged in (this should work without hitting guest/activate)
  console.log('🔍 Checking login status...');
  const isLoggedIn = await scraper.isLoggedIn();

  if (isLoggedIn) {
    console.log('✅ Successfully authenticated with cookies!\n');

    // Try to get the user's profile to confirm
    const me = await scraper.me();
    if (me) {
      console.log('👤 Logged in as:');
      console.log(`   Username: @${me.username}`);
      console.log(`   Name: ${me.name}`);
      console.log(`   Followers: ${me.followersCount?.toLocaleString()}`);
    }
  } else {
    console.log('❌ Not logged in - cookies may be expired or invalid');
    process.exit(1);
  }

} catch (error) {
  console.error('❌ Error:', error.message);
  if (error.stack) {
    console.error('Stack:', error.stack.split('\n')[0]);
  }
  process.exit(1);
}
