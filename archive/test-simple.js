import 'dotenv/config';
import TwitterPipeline from './src/twitter/TwitterPipeline.js';

console.log('🧪 Testing Simple Twitter Scraping Workflow\n');
console.log(`📊 Target username: ${process.env.TWITTER_USERNAME}`);
console.log(`📁 Cookie file: cookies/${process.env.TWITTER_USERNAME}_cookies.txt\n`);

const pipeline = new TwitterPipeline(process.env.TWITTER_USERNAME);

try {
  // Test collecting a small batch of tweets
  console.log('🔍 Testing tweet collection (will collect 10 tweets)...\n');

  const searchQuery = `from:${process.env.TWITTER_USERNAME}`;
  const tweets = await pipeline.collectWithFallback(searchQuery);

  console.log(`\n✅ Successfully collected ${tweets.length} tweets!\n`);

  if (tweets.length > 0) {
    console.log('📝 Sample tweet:');
    console.log(JSON.stringify(tweets[0], null, 2));
  } else {
    console.log('⚠️  No tweets collected - this might be due to:');
    console.log('   1. The account has no tweets');
    console.log('   2. Tweet selectors need updating');
    console.log('   3. Page didn't load completely');
  }

  process.exit(0);

} catch (error) {
  console.error('\n❌ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
