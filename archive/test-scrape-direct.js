import 'dotenv/config';
import { Scraper } from 'goat-x';
import fs from 'fs';

console.log('🍪 Testing direct scraping with cookies...\n');

const scraper = new Scraper();

// Load cookies
const cookiesPath = 'cookies/sixlinesapp_cookies.json';
console.log(`📂 Loading cookies from: ${cookiesPath}`);

try {
  const cookiesData = fs.readFileSync(cookiesPath, 'utf-8');
  const cookies = JSON.parse(cookiesData);
  console.log(`✅ Loaded ${cookies.length} cookies\n`);

  // Set cookies
  await scraper.setCookies(cookies);
  console.log('✅ Cookies set\n');

  // Try to get a profile directly (skipping isLoggedIn check)
  console.log('🔍 Attempting to fetch a public profile (elonmusk)...');
  const profile = await scraper.getProfile('elonmusk');

  if (profile) {
    console.log('✅ Successfully fetched profile with cookies!\n');
    console.log('Profile data:');
    console.log(`   Username: @${profile.username}`);
    console.log(`   Name: ${profile.name}`);
    console.log(`   Followers: ${profile.followersCount?.toLocaleString()}`);
    console.log(`   Bio: ${profile.biography?.substring(0, 100)}...`);
  } else {
    console.log('❌ Failed to fetch profile');
  }

} catch (error) {
  console.error('❌ Error:', error.message);
  console.error('Full error:', error);
}
