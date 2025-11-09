import 'dotenv/config';
import TwitterPipeline from './src/twitter/TwitterPipeline.js';
import DataOrganizer from './src/twitter/DataOrganizer.js';

console.log('🔍 Scraping tweets from qdayanon and saving to disk\n');

// Create pipeline with our logged-in account
const pipeline = new TwitterPipeline('sixlinesapp');

// Create data organizer for the target account (qdayanon)
const dataOrganizer = new DataOrganizer('pipeline', 'qdayanon');

try {
  console.log('📊 Target: qdayanon');
  console.log(`📁 Cookie file: cookies/sixlinesapp_cookies.txt`);
  console.log(`💾 Save location: ${dataOrganizer.getPaths().raw.tweets}\n`);

  const searchQuery = 'from:qdayanon';
  console.log(`🔎 Search query: ${searchQuery}\n`);

  console.log('⏳ Collecting tweets...\n');
  const rawTweets = await pipeline.collectWithFallback(searchQuery);

  console.log(`\n✅ Collected ${rawTweets.length} raw tweets\n`);

  // Process tweets to add proper structure and include all metrics
  const processedTweets = rawTweets.map(tweet => ({
    id: tweet.id,
    text: tweet.text,
    username: tweet.username || 'qdayanon',
    timestamp: tweet.timestamp ? new Date(tweet.timestamp).getTime() : Date.now(),
    createdAt: tweet.timestamp || new Date().toISOString(),
    isReply: tweet.isReply || false,
    isRetweet: tweet.isRetweet || false,
    likes: tweet.likes || 0,
    retweetCount: tweet.retweets || 0,
    replies: tweet.replies || 0,
    views: tweet.views || 0,
    bookmarks: tweet.bookmarks || 0,
    photos: tweet.photos || [],
    videos: tweet.videos || [],
    urls: tweet.urls || [],
    permanentUrl: `https://x.com/${tweet.username || 'qdayanon'}/status/${tweet.id}`,
    hashtags: tweet.hashtags || []
  }));

  console.log('💾 Saving tweets to disk...\n');
  await dataOrganizer.saveTweets(processedTweets);

  console.log('\n📊 Summary:');
  console.log(`   Total tweets: ${processedTweets.length}`);
  console.log(`   Location: ${dataOrganizer.getPaths().raw.tweets}`);

  if (processedTweets.length > 0) {
    console.log('\n📝 Sample tweets:');
    processedTweets.slice(0, 3).forEach((tweet, i) => {
      console.log(`\n${i + 1}. [${tweet.id}]`);
      console.log(`   ${tweet.text.substring(0, 100)}...`);
      console.log(`   ${tweet.createdAt}`);
    });
  }

  process.exit(0);

} catch (error) {
  console.error('\n❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
