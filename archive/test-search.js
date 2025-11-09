import 'dotenv/config';
import TwitterPipeline from './src/twitter/TwitterPipeline.js';

console.log('🔍 Testing Twitter Search for qdayanon\n');

// We're logged in as sixlinesapp, but searching for qdayanon's tweets
const pipeline = new TwitterPipeline('sixlinesapp'); // Our logged-in account

try {
  console.log('📊 Searching for tweets from: qdayanon');
  console.log(`📁 Using cookies from: cookies/sixlinesapp_cookies.txt\n`);

  const searchQuery = 'from:qdayanon';
  console.log(`🔎 Search query: ${searchQuery}\n`);

  const tweets = await pipeline.collectWithFallback(searchQuery);

  console.log(`\n✅ Successfully collected ${tweets.length} tweets from qdayanon!\n`);

  if (tweets.length > 0) {
    console.log('📝 First 3 tweets:\n');
    tweets.slice(0, 3).forEach((tweet, i) => {
      console.log(`${i + 1}. [${tweet.id}] ${tweet.text?.substring(0, 100)}...`);
      console.log(`   Posted: ${tweet.timestamp ? new Date(tweet.timestamp).toISOString() : 'unknown'}\n`);
    });
  } else {
    console.log('⚠️  No tweets collected. Possible reasons:');
    console.log('   1. The account qdayanon might not exist or be private');
    console.log('   2. Tweet selectors need updating');
    console.log('   3. Page didn\'t load completely');
  }

  process.exit(0);

} catch (error) {
  console.error('\n❌ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
