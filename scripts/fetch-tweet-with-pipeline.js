#!/usr/bin/env node
/**
 * Fetch a single tweet using the TwitterPipeline fallback method
 * Usage: node scripts/fetch-tweet-with-pipeline.js <tweet_url_or_id>
 */

import TwitterPipeline from "../src/twitter/TwitterPipeline.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from 'url';
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function extractTweetIdAndUsername(input) {
  // Try to extract from URL patterns
  const urlPatterns = [
    /twitter\.com\/(\w+)\/status\/(\d+)/,
    /x\.com\/(\w+)\/status\/(\d+)/,
  ];

  for (const pattern of urlPatterns) {
    const match = input.match(pattern);
    if (match) {
      return { username: match[1], tweetId: match[2] };
    }
  }

  // If it's just a numeric ID
  if (/^\d+$/.test(input)) {
    return { username: null, tweetId: input };
  }

  return null;
}

async function fetchTweetDirectly(tweetId, username) {
  // For a single tweet, it's better to navigate directly to the tweet URL
  // where the full text is always visible, rather than searching

  const { Cluster } = await import("puppeteer-cluster");
  const puppeteer = await import("puppeteer-extra");
  const StealthPlugin = (await import("puppeteer-extra-plugin-stealth")).default;
  const AdblockerPlugin = (await import("puppeteer-extra-plugin-adblocker")).default;
  const fs = await import("fs/promises");
  const path = await import("path");

  puppeteer.default.use(StealthPlugin());
  puppeteer.default.use(AdblockerPlugin({ blockTrackers: true }));

  const cookiesPath = path.join(
    process.cwd(),
    'cookies',
    `${process.env.TWITTER_USERNAME}_cookies.txt`
  );

  // Load cookies
  const cookiesContent = await fs.readFile(cookiesPath, 'utf-8');
  const cookies = cookiesContent
    .split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const parts = line.split('\t');
      return {
        name: parts[5],
        value: parts[6],
        domain: parts[0],
        path: parts[2],
        expires: parts[4] === '0' ? -1 : parseFloat(parts[4]),
        httpOnly: parts[1] === 'TRUE',
        secure: parts[3] === 'TRUE',
        sameSite: 'None'
      };
    });

  console.log(`✅ Loaded ${cookies.length} authentication cookies`);

  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    maxConcurrency: 1,
    puppeteer: puppeteer.default,
    puppeteerOptions: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    }
  });

  let tweet = null;

  await cluster.task(async ({ page }) => {
    try {
      // Set up the page
      await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setViewport({ width: 1366, height: 768 });
      await page.setCookie(...cookies);

      // Navigate directly to the tweet URL
      const tweetUrl = `https://x.com/${username}/status/${tweetId}`;
      console.log(`🌐 Navigating to tweet: ${tweetUrl}`);

      await page.goto(tweetUrl, {
        waitUntil: "networkidle2",
        timeout: 30000,
      });

      // Verify we're logged in
      const currentUrl = page.url();
      if (currentUrl.includes('/login') || currentUrl.includes('/flow/')) {
        throw new Error("Authentication cookies expired");
      }

      console.log(`✅ Successfully loaded tweet page`);

      // Wait for tweet to load
      await page.waitForSelector('article[data-testid="tweet"]', { timeout: 10000 });

      // Check if this is a thread
      const threadTweets = await page.evaluate(() => {
        const articles = document.querySelectorAll('article[data-testid="tweet"]');
        console.log(`Found ${articles.length} tweet articles on the page`);
        return articles.length;
      });

      console.log(`📊 Found ${threadTweets} tweets on page (thread detection)`);

      // Extract tweet data from the page (including thread if present)
      const allTweetsData = await page.evaluate((targetTweetId, targetUsername) => {
        const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));

        // Helper to parse counts
        const parseCount = (text) => {
          if (!text) return 0;
          text = text.trim().toLowerCase();
          const multipliers = { k: 1000, m: 1000000, b: 1000000000 };
          const match = text.match(/^([\d.]+)([kmb]?)$/);
          if (!match) return parseInt(text.replace(/,/g, '')) || 0;
          return Math.floor(parseFloat(match[1]) * (multipliers[match[2]] || 1));
        };

        const extractTweetData = (article) => {
          // Extract tweet ID
          const tweetId = article.querySelector('a[href*="/status/"]')?.href?.match(/status\/(\d+)/)?.[1];

          // Extract FULL text - on individual tweet pages, full text is always shown
          const textElement = article.querySelector("div[lang]") || article.querySelector('[data-testid="tweetText"]');
          const text = textElement?.innerText || textElement?.textContent || "";

          // Extract timestamp
          const timeElement = article.querySelector("time");
          const datetime = timeElement?.getAttribute("datetime");
          const timestamp = datetime ? new Date(datetime).getTime() : null;

          // Extract metrics
          const getMetricCount = (testId) => {
            const button = article.querySelector(`[data-testid="${testId}"]`);
            if (!button) return 0;

            const ariaLabel = button.getAttribute('aria-label');
            if (ariaLabel) {
              const match = ariaLabel.match(/(\d+[\d,]*)/);
              if (match) return parseCount(match[1]);
            }

            const span = button.querySelector('span');
            if (span?.textContent) return parseCount(span.textContent);

            return 0;
          };

          const replies = getMetricCount('reply');
          const retweets = getMetricCount('retweet');
          const likes = getMetricCount('like');
          const bookmarks = getMetricCount('bookmark');

          // Views
          let views = 0;
          const viewsElement = article.querySelector('a[href*="/analytics"] span, [aria-label*="View"]');
          if (viewsElement) {
            const viewText = viewsElement.textContent || viewsElement.getAttribute('aria-label');
            if (viewText) {
              const viewMatch = viewText.match(/(\d+[\d,\.]*[KMB]?)/i);
              if (viewMatch) views = parseCount(viewMatch[1]);
            }
          }

          // Extract username
          const userLink = article.querySelector('a[role="link"][href^="/"]');
          const username = userLink?.href?.split('/')[3] || '';

          // Check if retweet or reply
          const isRetweet = !!article.querySelector('[data-testid="socialContext"]')?.textContent?.includes('reposted');
          const isReply = !!article.querySelector('[data-testid="socialContext"]')?.textContent?.includes('Replying to');

          // Extract media
          const photos = Array.from(article.querySelectorAll('img[src*="media"]'))
            .map(img => img.src)
            .filter(src => src.includes('media'));

          const videos = Array.from(article.querySelectorAll('video[src]'))
            .map(vid => vid.src);

          // Extract hashtags
          const hashtags = Array.from(article.querySelectorAll('a[href*="/hashtag/"]'))
            .map(a => a.textContent);

          // Extract URLs
          const urls = Array.from(article.querySelectorAll('a[href^="http"]'))
            .map(a => a.href)
            .filter(url => !url.includes('twitter.com') && !url.includes('x.com'));

          return {
            id: tweetId,
            text: text,
            timestamp: timestamp,
            username: username,
            replies: replies,
            retweets: retweets,
            likes: likes,
            views: views,
            bookmarks: bookmarks,
            isRetweet: isRetweet,
            isReply: isReply,
            photos: photos,
            videos: videos,
            hashtags: hashtags,
            urls: urls,
            permanentUrl: `https://x.com/${username}/status/${tweetId}`
          };
        };

        // Extract all tweets and filter to only include thread tweets from the same author
        const allTweets = articles.map(extractTweetData).filter(t => t && t.id);

        // Find the target tweet and identify thread tweets
        const targetIndex = allTweets.findIndex(t => t.id === targetTweetId);
        if (targetIndex === -1) return null;

        // Thread tweets are consecutive tweets from the same author
        const threadTweets = [allTweets[targetIndex]];

        // Look for subsequent tweets from same author (thread continuation)
        for (let i = targetIndex + 1; i < allTweets.length; i++) {
          if (allTweets[i].username.toLowerCase() === targetUsername.toLowerCase() &&
              !allTweets[i].isRetweet) {
            threadTweets.push(allTweets[i]);
          } else {
            break; // Stop at first non-author tweet or retweet
          }
        }

        return {
          mainTweet: allTweets[targetIndex],
          threadTweets: threadTweets,
          isThread: threadTweets.length > 1
        };
      }, tweetId, username);

      if (!allTweetsData || !allTweetsData.mainTweet) {
        throw new Error("Could not extract tweet data");
      }

      tweet = allTweetsData.mainTweet;

      if (allTweetsData.isThread) {
        console.log(`🧵 Detected thread with ${allTweetsData.threadTweets.length} tweets`);
        tweet.thread = allTweetsData.threadTweets;
      }

      if (tweet) {
        console.log("✅ Tweet fetched successfully");
        console.log(`📝 Text: ${tweet.text?.substring(0, 100)}...`);
        console.log(`👤 Author: @${tweet.username}`);
        console.log(`❤️  Likes: ${tweet.likes}`);
        console.log(`🔁 Retweets: ${tweet.retweets}`);
        console.log(`💬 Replies: ${tweet.replies}`);
      }

    } catch (error) {
      console.error("❌ Error fetching tweet:", error.message);
      throw error;
    }
  });

  await cluster.queue({});
  await cluster.idle();
  await cluster.close();

  return tweet;
}

async function saveTweetAsGoldSet(tweet, outputDir = null) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
  const filename = `tweet_${tweet.id}_${timestamp}.json`;

  // Default to content-engine gold sets directory
  const defaultDir = path.join(
    __dirname,
    '../../qdayanon-content-engine/backend/data/gold_sets/research_paper_analysis'
  );

  const targetDir = outputDir || defaultDir;

  // Create directory if it doesn't exist
  await fs.mkdir(targetDir, { recursive: true });

  const filepath = path.join(targetDir, filename);

  // Add gold set metadata
  const goldSetData = {
    ...tweet,
    _gold_set_metadata: {
      category: "research_paper_analysis",
      saved_at: new Date().toISOString(),
      quality_reason: "[FILL IN: Why this is a good example]",
      key_features: [
        "[FILL IN: Feature 1]",
        "[FILL IN: Feature 2]",
        "[FILL IN: Feature 3]"
      ],
      source_url: tweet.permanentUrl || `https://twitter.com/${tweet.username}/status/${tweet.id}`
    }
  };

  await fs.writeFile(filepath, JSON.stringify(goldSetData, null, 2), 'utf-8');

  console.log(`\n✅ Gold set saved to: ${filepath}`);
  console.log("\n📝 Next steps:");
  console.log("1. Open the file and fill in the _gold_set_metadata fields");
  console.log("2. Explain why this tweet is a good example in quality_reason");
  console.log("3. List key features that make it effective");

  return filepath;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: node scripts/fetch-tweet-with-pipeline.js <tweet_url_or_id>");
    console.error("Example: node scripts/fetch-tweet-with-pipeline.js https://x.com/doodlestein/status/1988891504291500208");
    console.error("Example: node scripts/fetch-tweet-with-pipeline.js 1988891504291500208");
    process.exit(1);
  }

  const input = args[0];
  const result = extractTweetIdAndUsername(input);

  if (!result) {
    console.error(`❌ Could not extract tweet ID from: ${input}`);
    process.exit(1);
  }

  console.log(`📌 Processing tweet ID: ${result.tweetId}\n`);

  if (!result.username) {
    console.error("❌ Username is required. Please provide a full tweet URL.");
    process.exit(1);
  }

  try {
    const tweet = await fetchTweetDirectly(result.tweetId, result.username);
    if (tweet) {
      await saveTweetAsGoldSet(tweet);
    }
  } catch (error) {
    console.error("\n❌ Failed to fetch tweet:", error.message);
    process.exit(1);
  }
}

main();
