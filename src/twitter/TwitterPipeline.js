import inquirer from "inquirer";
import chalk from "chalk";
import { format } from "date-fns";
import path from "path";
import fs from "fs/promises";

// Imported Files
import Logger from "./Logger.js";
import DataOrganizer from "./DataOrganizer.js";
import TweetFilter from "./TweetFilter.js";

// goat-x
import { Scraper, SearchMode } from "goat-x";

// Puppeteer
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AdblockerPlugin from "puppeteer-extra-plugin-adblocker";
import { Cluster } from "puppeteer-cluster";

// Configure puppeteer stealth once
puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

class TwitterPipeline {
  constructor(username) {
    this.username = username;
    this.dataOrganizer = new DataOrganizer("pipeline", username);
    this.paths = this.dataOrganizer.getPaths();
    this.tweetFilter = new TweetFilter();

    // Separate cookie paths for different formats
    this.paths.netscapeCookies = path.join(
      process.cwd(),
      'cookies',
      `${process.env.TWITTER_USERNAME}_cookies.txt`
    );
    // JSON cookies for API scraper (if used)
    this.paths.cookies = path.join(
      process.cwd(),
      'cookies',
      `${process.env.TWITTER_USERNAME}_cookies.json`
    );

    // Enhanced configuration with fallback handling
    this.config = {
      twitter: {
        maxTweets: parseInt(process.env.MAX_TWEETS) || 50000,
        maxRetries: parseInt(process.env.MAX_RETRIES) || 5,
        retryDelay: parseInt(process.env.RETRY_DELAY) || 5000,
        minDelayBetweenRequests: parseInt(process.env.MIN_DELAY) || 1000,
        maxDelayBetweenRequests: parseInt(process.env.MAX_DELAY) || 3000,
        rateLimitThreshold: 3, // Number of rate limits before considering fallback
      },
      fallback: {
        enabled: true,
        sessionDuration: 30 * 60 * 1000, // 30 minutes
        viewport: {
          width: 1366,
          height: 768,
          deviceScaleFactor: 1,
          hasTouch: false,
          isLandscape: true,
        },
      },
    };

    this.scraper = new Scraper();
    this.cluster = null;

    // Enhanced statistics tracking
    this.stats = {
      requestCount: 0,
      rateLimitHits: 0,
      retriesCount: 0,
      uniqueTweets: 0,
      fallbackCount: 0,
      startTime: Date.now(),
      oldestTweetDate: null,
      newestTweetDate: null,
      fallbackUsed: false,
    };
  }

  async initializeFallback() {
    if (!this.cluster) {
      this.cluster = await Cluster.launch({
        puppeteer,
        maxConcurrency: 1, // Single instance for consistency
        timeout: 30000,
        puppeteerOptions: {
          headless: "new",
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-blink-features=AutomationControlled",
          ],
        },
      });

      this.cluster.on("taskerror", async (err) => {
        Logger.warn(`Fallback error: ${err.message}`);
        this.stats.retriesCount++;
      });
    }
  }

  async loadNetscapeCookies() {
    try {
      const cookieFileExists = await fs.access(this.paths.netscapeCookies).then(() => true).catch(() => false);

      if (!cookieFileExists) {
        Logger.warn(`Cookie file not found: ${this.paths.netscapeCookies}`);
        return [];
      }

      const netscapeCookies = await fs.readFile(this.paths.netscapeCookies, 'utf-8');
      const lines = netscapeCookies.split('\n');

      const cookies = [];
      for (const line of lines) {
        if (line.startsWith('#') || !line.trim()) continue;

        const parts = line.split('\t');
        if (parts.length < 7) continue;

        const [domain, , cookiePath, secure, expiration, name, value] = parts;

        cookies.push({
          name,
          value,
          domain: domain.startsWith('.') ? domain : domain,
          path: cookiePath,
          secure: secure === 'TRUE',
          httpOnly: false,
          expires: parseInt(expiration) > 0 ? parseInt(expiration) : undefined
        });
      }

      return cookies;
    } catch (error) {
      Logger.warn(`Failed to load Netscape cookies: ${error.message}`);
      return [];
    }
  }

  async setupFallbackPage(page) {
    await page.setViewport(this.config.fallback.viewport);

    // Set realistic user agent
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Enhanced stealth measures
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      delete navigator.__proto__.webdriver;
    });

    // Load and set cookies
    const cookies = await this.loadNetscapeCookies();
    if (cookies.length > 0) {
      await page.setCookie(...cookies);
      Logger.success(`Loaded ${cookies.length} authentication cookies`);
    } else {
      Logger.warn('No cookies loaded - authentication may fail');
    }
  }

  async validateEnvironment() {
    Logger.startSpinner("Validating environment");
    const required = ["TWITTER_USERNAME", "TWITTER_PASSWORD"];
    const missing = required.filter((var_) => !process.env[var_]);

    if (missing.length > 0) {
      Logger.stopSpinner(false);
      Logger.error("Missing required environment variables:");
      missing.forEach((var_) => Logger.error(`- ${var_}`));
      console.log("\n📝 Create a .env file with your Twitter credentials:");
      console.log(`TWITTER_USERNAME=your_username`);
      console.log(`TWITTER_PASSWORD=your_password`);
      process.exit(1);
    }
    Logger.stopSpinner();
  }

async loadCookies() {
    try {
      const cookieFileExists = await fs.access(this.paths.cookies).then(() => true).catch(() => false);

      if (cookieFileExists) {
        const cookiesData = await fs.readFile(this.paths.cookies, 'utf-8');
        const cookies = JSON.parse(cookiesData);
        await this.scraper.setCookies(cookies);
        return true;
      }
    } catch (error) {
      Logger.warn(`Failed to load cookies: ${error.message}`);
    }
    return false;
}

async saveCookies() {
    try {
      const cookies = await this.scraper.getCookies();
      // Create cookies directory if it doesn't exist
      await fs.mkdir(path.dirname(this.paths.cookies), { recursive: true });
      await fs.writeFile(this.paths.cookies, JSON.stringify(cookies));
      Logger.success('Saved authentication cookies');
    } catch (error) {
      Logger.warn(`Failed to save cookies: ${error.message}`);
    }
}


  async initializeScraper() {
    Logger.startSpinner("Initializing Twitter scraper");

    // Skip goat-x authentication entirely - it's broken due to deprecated endpoints
    // Will use Puppeteer fallback for all scraping
    Logger.warn("⚠️  Skipping goat-x authentication (deprecated endpoints)");
    Logger.warn("📌 Using Puppeteer-based scraping instead");
    Logger.stopSpinner();

    return false; // Force fallback mode

    // Verify all required credentials are present
    const username = process.env.TWITTER_USERNAME;
    const password = process.env.TWITTER_PASSWORD;
    const email = process.env.TWITTER_EMAIL;

    if (!username || !password || !email) {
      Logger.error("Missing required credentials. Need username, password, AND email");
      Logger.stopSpinner(false);
      return false;
    }

    // Attempt login with email verification
    while (retryCount < this.config.twitter.maxRetries) {
      try {
        // Add random delay before login attempt
        await this.randomDelay(5000, 10000);

        // Always use email in login attempt
        Logger.info(`🔐 Attempting login for user: ${username}`);
        Logger.info(`📧 Email provided: ${email ? 'Yes' : 'No'}`);

        await this.scraper.login(username, password, email);

        // Verify login success
        Logger.info(`✔️  Login call completed, verifying session...`);
        const isLoggedIn = await this.scraper.isLoggedIn();
        if (isLoggedIn) {
          await this.saveCookies();
          Logger.success("✅ Successfully authenticated with Twitter");
          Logger.stopSpinner();
          return true;
        } else {
          throw new Error("Login verification failed");
        }

      } catch (error) {
        retryCount++;
        Logger.error(`⚠️  Authentication attempt ${retryCount} failed:`);
        Logger.error(`   Error message: ${error.message}`);
        Logger.error(`   Error stack: ${error.stack?.split('\n')[0]}`);

        if (retryCount >= this.config.twitter.maxRetries) {
          Logger.stopSpinner(false);
          return false;
        }

        // Exponential backoff with jitter
        const baseDelay = this.config.twitter.retryDelay * Math.pow(2, retryCount - 1);
        const maxJitter = baseDelay * 0.2; // 20% jitter
        const jitter = Math.floor(Math.random() * maxJitter);
        await this.randomDelay(baseDelay + jitter, baseDelay + jitter + 5000);
      }
    }
    return false;
  }


  async randomDelay(min, max) {
    // Gaussian distribution for more natural delays
    const gaussianRand = () => {
      let rand = 0;
      for (let i = 0; i < 6; i++) rand += Math.random();
      return rand / 6;
    };

    const delay = Math.floor(min + gaussianRand() * (max - min));
    Logger.info(`Waiting ${(delay / 1000).toFixed(1)} seconds...`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /*
  async initializeScraper() {
    Logger.startSpinner("Initializing Twitter scraper");
    let retryCount = 0;

    while (retryCount < this.config.twitter.maxRetries) {
      try {
        const username = process.env.TWITTER_USERNAME;
        const password = process.env.TWITTER_PASSWORD;

        if (!username || !password) {
          throw new Error("Twitter credentials not found");
        }

        // Try login with minimal parameters first
        await this.scraper.login(username, password);

        if (await this.scraper.isLoggedIn()) {
          Logger.success("✅ Successfully authenticated with Twitter");
          Logger.stopSpinner();
          return true;
        } else {
          throw new Error("Authentication failed");
        }
      } catch (error) {
        retryCount++;
        Logger.warn(
          `⚠️  Authentication attempt ${retryCount} failed: ${error.message}`
        );

        if (retryCount >= this.config.twitter.maxRetries) {
          Logger.stopSpinner(false);
          // Don't throw - allow fallback
          return false;
        }

        await this.randomDelay(
          this.config.twitter.retryDelay * retryCount,
          this.config.twitter.retryDelay * retryCount * 2
        );
      }
    }
    return false;
  }   */

  async randomDelay(min = null, max = null) {
    const minDelay = min || this.config.twitter.minDelayBetweenRequests;
    const maxDelay = max || this.config.twitter.maxDelayBetweenRequests;

    // Use gaussian distribution for more natural delays
    const gaussianRand = () => {
      let rand = 0;
      for (let i = 0; i < 6; i++) rand += Math.random();
      return rand / 6;
    };

    const delay = Math.floor(minDelay + gaussianRand() * (maxDelay - minDelay));
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  async handleRateLimit(retryCount = 1) {
    this.stats.rateLimitHits++;
    const baseDelay = 60000; // 1 minute
    const maxDelay = 15 * 60 * 1000; // 15 minutes

    // Exponential backoff with small jitter
    const exponentialDelay = baseDelay * Math.pow(2, retryCount - 1);
    const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
    const delay = Math.min(exponentialDelay + jitter, maxDelay);

    Logger.warn(
      `⚠️  Rate limit hit - waiting ${
        delay / 1000
      } seconds (attempt ${retryCount})`
    );

    await this.randomDelay(delay, delay * 1.1);
  }

  processTweetData(tweet) {
    try {
      if (!tweet || !tweet.id) return null;

      let timestamp = tweet.timestamp;
      if (!timestamp) {
        timestamp = tweet.timeParsed?.getTime();
      }

      if (!timestamp) return null;

      if (timestamp < 1e12) timestamp *= 1000;

      if (isNaN(timestamp) || timestamp <= 0) {
        Logger.warn(`⚠️  Invalid timestamp for tweet ${tweet.id}`);
        return null;
      }

      const tweetDate = new Date(timestamp);
      if (
        !this.stats.oldestTweetDate ||
        tweetDate < this.stats.oldestTweetDate
      ) {
        this.stats.oldestTweetDate = tweetDate;
      }
      if (
        !this.stats.newestTweetDate ||
        tweetDate > this.stats.newestTweetDate
      ) {
        this.stats.newestTweetDate = tweetDate;
      }

      return {
        id: tweet.id,
        text: tweet.text,
        username: tweet.username || this.username,
        timestamp,
        createdAt: new Date(timestamp).toISOString(),
        isReply: Boolean(tweet.isReply),
        isRetweet: Boolean(tweet.isRetweet),
        likes: tweet.likes || 0,
        retweetCount: tweet.retweets || 0,
        replies: tweet.replies || 0,
        photos: tweet.photos || [],
        videos: tweet.videos || [],
        urls: tweet.urls || [],
        permanentUrl: tweet.permanentUrl,
        quotedStatusId: tweet.quotedStatusId,
        inReplyToStatusId: tweet.inReplyToStatusId,
        hashtags: tweet.hashtags || [],
      };
    } catch (error) {
      Logger.warn(`⚠️  Error processing tweet ${tweet?.id}: ${error.message}`);
      return null;
    }
  }

  async collectWithFallback(searchQuery) {
    if (!this.cluster) {
      await this.initializeFallback();
    }

    const tweetMap = new Map(); // Store tweets by ID to prevent duplicates
    let sessionStartTime = Date.now();

    const fallbackTask = async ({ page }) => {
      await this.setupFallbackPage(page);

      try {
        // Skip login - use cookies instead and go directly to search
        Logger.info("🌐 Navigating to X.com search with saved cookies...");

        const searchUrl = `https://x.com/search?q=${encodeURIComponent(searchQuery)}&f=live`;
        await page.goto(searchUrl, {
          waitUntil: "networkidle2",
          timeout: 30000,
        });

        // Verify we're logged in by checking if we were redirected to login
        const currentUrl = page.url();
        if (currentUrl.includes('/login') || currentUrl.includes('/flow/')) {
          Logger.error("❌ Cookies expired or invalid - redirected to login page");
          Logger.error(`   Please run: cp cookies/sixlinesapp_cookies.txt cookies/${process.env.TWITTER_USERNAME}_cookies.txt`);
          throw new Error("Authentication cookies expired - please refresh cookies");
        }

        Logger.success(`✓ Successfully loaded search page: ${currentUrl}`);

        // Wait for tweets to load
        await this.randomDelay(2000, 3000);

        // Debug: Check initial page state
        const initialCheck = await page.evaluate(() => {
          const articles = document.querySelectorAll('article[data-testid="tweet"]');
          return {
            articleCount: articles.length,
            hasArticles: articles.length > 0,
            firstArticleHTML: articles[0]?.outerHTML?.substring(0, 200)
          };
        });
        Logger.info(`📊 Initial page check: Found ${initialCheck.articleCount} tweet articles`);

        let lastTweetCount = 0;
        let unchangedCount = 0;

        while (
          unchangedCount < 3 &&
          Date.now() - sessionStartTime < this.config.fallback.sessionDuration
        ) {
          try {
            await page.evaluate(() => {
              window.scrollBy(0, 500);
            });
          } catch (error) {
            if (error.message.includes('detached')) {
              Logger.warn('⚠️  Page detached during scroll, stopping collection');
              break;
            }
            throw error;
          }

          await this.randomDelay(1000, 2000);

          let newTweets;
          try {
            newTweets = await page.evaluate(() => {
            const tweetElements = Array.from(
              document.querySelectorAll('article[data-testid="tweet"]')
            );

            // Debug info
            console.log(`Found ${tweetElements.length} tweet elements`);

            // Helper function to parse count text (e.g., "1.2K" -> 1200)
            const parseCount = (text) => {
              if (!text) return 0;
              text = text.trim().toLowerCase();
              if (text === '') return 0;

              const multipliers = { k: 1000, m: 1000000, b: 1000000000 };
              const match = text.match(/^([\d.]+)([kmb]?)$/);

              if (match) {
                const num = parseFloat(match[1]);
                const mult = multipliers[match[2]] || 1;
                return Math.floor(num * mult);
              }

              return parseInt(text.replace(/,/g, '')) || 0;
            };

            return tweetElements
              .map((tweet) => {
                try {
                  // Try multiple ways to get tweet ID
                  const tweetId = tweet.getAttribute("data-tweet-id") ||
                                 tweet.querySelector('a[href*="/status/"]')?.href?.match(/status\/(\d+)/)?.[1];

                  const textElement = tweet.querySelector("div[lang]") ||
                                     tweet.querySelector('[data-testid="tweetText"]');
                  const text = textElement?.textContent || "";

                  const timeElement = tweet.querySelector("time");
                  const datetime = timeElement?.getAttribute("datetime");
                  const timestamp = datetime ? new Date(datetime).getTime() : null;

                  if (!tweetId) {
                    console.log('Tweet missing ID, text preview:', text.substring(0, 50));
                    return null;
                  }

                  // Extract engagement metrics
                  const replyButton = tweet.querySelector('[data-testid="reply"]');
                  const retweetButton = tweet.querySelector('[data-testid="retweet"]');
                  const likeButton = tweet.querySelector('[data-testid="like"]');
                  const viewsElement = tweet.querySelector('a[href*="/analytics"] span, [aria-label*="View"]');
                  const bookmarkButton = tweet.querySelector('[data-testid="bookmark"]');

                  // Get counts from aria-labels or visible text
                  const getMetricCount = (button, metricName) => {
                    if (!button) return 0;

                    // Try aria-label first
                    const ariaLabel = button.getAttribute('aria-label');
                    if (ariaLabel) {
                      const match = ariaLabel.match(/(\d+[\d,]*)/);
                      if (match) return parseCount(match[1]);
                    }

                    // Try visible span text
                    const span = button.querySelector('span[data-testid$="count"]');
                    if (span?.textContent) {
                      return parseCount(span.textContent);
                    }

                    return 0;
                  };

                  const replies = getMetricCount(replyButton, 'replies');
                  const retweets = getMetricCount(retweetButton, 'retweets');
                  const likes = getMetricCount(likeButton, 'likes');
                  const bookmarks = getMetricCount(bookmarkButton, 'bookmarks');

                  // Views are often in a different format
                  let views = 0;
                  if (viewsElement) {
                    const viewText = viewsElement.textContent || viewsElement.getAttribute('aria-label');
                    if (viewText) {
                      const viewMatch = viewText.match(/(\d+[\d,\.]*[KMB]?)/i);
                      if (viewMatch) {
                        views = parseCount(viewMatch[1]);
                      }
                    }
                  }

                  // Extract user info
                  const userLink = tweet.querySelector('a[role="link"][href^="/"]');
                  const username = userLink?.href?.split('/')[3] || '';

                  // Check if it's a retweet or reply
                  const isRetweet = !!tweet.querySelector('[data-testid="socialContext"]')?.textContent?.includes('reposted');
                  const isReply = !!tweet.querySelector('[data-testid="socialContext"]')?.textContent?.includes('Replying to');

                  // Extract media
                  const photos = Array.from(tweet.querySelectorAll('img[src*="media"]'))
                    .map(img => img.src)
                    .filter(src => src.includes('media'));

                  const videos = Array.from(tweet.querySelectorAll('video[src]'))
                    .map(vid => vid.src);

                  // Extract hashtags
                  const hashtags = Array.from(tweet.querySelectorAll('a[href*="/hashtag/"]'))
                    .map(a => a.textContent);

                  // Extract URLs
                  const urls = Array.from(tweet.querySelectorAll('a[href^="http"]'))
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
                    urls: urls
                  };
                } catch (e) {
                  console.error('Error parsing tweet:', e.message);
                  return null;
                }
              })
              .filter((t) => t && t.id);
          });
          } catch (error) {
            if (error.message.includes('detached')) {
              Logger.warn('⚠️  Page detached during extraction, stopping collection');
              break;
            }
            throw error;
          }

          if (!newTweets) newTweets = [];

          Logger.info(`📝 Found ${newTweets.length} new tweets in this batch`);

          for (const tweet of newTweets) {
            if (!tweetMap.has(tweet.id)) {
              tweetMap.set(tweet.id, tweet);
              this.stats.fallbackCount++;
              Logger.info(`  ✓ Added tweet ${tweet.id}: ${tweet.text?.substring(0, 50)}... [👁️ ${tweet.views || 0} | ❤️ ${tweet.likes || 0} | 🔁 ${tweet.retweets || 0} | 💬 ${tweet.replies || 0}]`);
            }
          }

          if (tweetMap.size === lastTweetCount) {
            unchangedCount++;
            Logger.info(`⏸️  No new tweets (unchanged count: ${unchangedCount}/3)`);
          } else {
            unchangedCount = 0;
            lastTweetCount = tweetMap.size;
            Logger.success(`📊 Total collected so far: ${tweetMap.size} tweets`);
          }
        }
      } catch (error) {
        Logger.warn(`Fallback collection error: ${error.message}`);
        throw error;
      }
    };

    await this.cluster.task(fallbackTask);
    await this.cluster.queue({});
    await this.cluster.idle();
    await this.cluster.close();
    this.cluster = null; // Reset to allow subsequent fallback attempts

    Logger.success(`✅ Collected ${tweetMap.size} tweets via Puppeteer`);
    return Array.from(tweetMap.values());
  }

  async collectTweets(scraper) {
    try {
      // Check if scraper is actually initialized (not broken)
      let profile;
      let totalExpectedTweets = 0;

      try {
        profile = await scraper.getProfile(this.username);
        totalExpectedTweets = profile.tweetsCount;
      } catch (error) {
        Logger.warn(`⚠️  Failed to get profile via API: ${error.message}`);
        Logger.info("🔄 Falling back to Puppeteer for all scraping...");

        // Use fallback collection directly
        const fallbackTweets = await this.collectWithFallback(`from:${this.username}`);
        return fallbackTweets.map(t => this.processTweetData(t)).filter(t => t);
      }

      Logger.info(
        `📊 Found ${chalk.bold(
          totalExpectedTweets.toLocaleString()
        )} total tweets for @${this.username}`
      );

      const allTweets = new Map();
      let previousCount = 0;
      let stagnantBatches = 0;
      const MAX_STAGNANT_BATCHES = 2;

      // Try main collection first
      try {
        const searchResults = scraper.searchTweets(
          `from:${this.username}`,
          this.config.twitter.maxTweets,
          SearchMode.Latest
        );

        for await (const tweet of searchResults) {
          if (tweet && !allTweets.has(tweet.id)) {
            const processedTweet = this.processTweetData(tweet);
            if (processedTweet) {
              allTweets.set(tweet.id, processedTweet);

              if (allTweets.size % 100 === 0) {
                const completion = (
                  (allTweets.size / totalExpectedTweets) *
                  100
                ).toFixed(1);
                Logger.info(
                  `📊 Progress: ${allTweets.size.toLocaleString()} unique tweets (${completion}%)`
                );

                if (allTweets.size === previousCount) {
                  stagnantBatches++;
                  if (stagnantBatches >= MAX_STAGNANT_BATCHES) {
                    Logger.info(
                      "📝 Collection rate has stagnated, checking fallback..."
                    );
                    break;
                  }
                } else {
                  stagnantBatches = 0;
                }
                previousCount = allTweets.size;
              }
            }
          }
        }
      } catch (error) {
        if (error.message.includes("rate limit")) {
          await this.handleRateLimit(this.stats.rateLimitHits + 1);

          // Consider fallback if rate limits are frequent
          if (
            this.stats.rateLimitHits >= this.config.twitter.rateLimitThreshold
          ) {
            Logger.info("Switching to fallback collection...");
            const fallbackTweets = await this.collectWithFallback(
              `from:${this.username}`
            );

            fallbackTweets.forEach((tweet) => {
              if (!allTweets.has(tweet.id)) {
                const processedTweet = this.processTweetData(tweet);
                if (processedTweet) {
                  allTweets.set(tweet.id, processedTweet);
                  this.stats.fallbackUsed = true;
                }
              }
            });
          }
        }
        Logger.warn(`⚠️  Search error: ${error.message}`);
      }

      // Use fallback for replies if needed
      if (
        allTweets.size < totalExpectedTweets * 0.8 &&
        this.config.fallback.enabled
      ) {
        Logger.info("\n🔍 Collecting additional tweets via fallback...");

        try {
          const fallbackTweets = await this.collectWithFallback(
            `from:${this.username}`
          );
          let newTweetsCount = 0;

          fallbackTweets.forEach((tweet) => {
            if (!allTweets.has(tweet.id)) {
              const processedTweet = this.processTweetData(tweet);
              if (processedTweet) {
                allTweets.set(tweet.id, processedTweet);
                newTweetsCount++;
                this.stats.fallbackUsed = true;
              }
            }
          });

          if (newTweetsCount > 0) {
            Logger.info(
              `Found ${newTweetsCount} additional tweets via fallback`
            );
          }
        } catch (error) {
          Logger.warn(`⚠️  Fallback collection error: ${error.message}`);
        }
      }

      Logger.success(
        `\n🎉 Collection complete! ${allTweets.size.toLocaleString()} unique tweets collected${
          this.stats.fallbackUsed
            ? ` (including ${this.stats.fallbackCount} from fallback)`
            : ""
        }`
      );

      return Array.from(allTweets.values());
    } catch (error) {
      Logger.error(`Failed to collect tweets: ${error.message}`);
      throw error;
    }
  }

  async showSampleTweets(tweets) {
    const { showSample } = await inquirer.prompt([
      {
        type: "confirm",
        name: "showSample",
        message: "Would you like to see a sample of collected tweets?",
        default: true,
      },
    ]);

    if (showSample) {
      Logger.info("\n🌟 Sample Tweets (Most Engaging):");

      const sortedTweets = tweets
        .filter((tweet) => !tweet.isRetweet)
        .sort((a, b) => b.likes + b.retweetCount - (a.likes + a.retweetCount))
        .slice(0, 5);

      sortedTweets.forEach((tweet, i) => {
        console.log(
          chalk.cyan(
            `\n${i + 1}. [${format(new Date(tweet.timestamp), "yyyy-MM-dd")}]`
          )
        );
        console.log(chalk.white(tweet.text));
        console.log(
          chalk.gray(
            `❤️ ${tweet.likes.toLocaleString()} | 🔄 ${tweet.retweetCount.toLocaleString()} | 💬 ${tweet.replies.toLocaleString()}`
          )
        );
        console.log(chalk.gray(`🔗 ${tweet.permanentUrl}`));
      });
    }
  }

  async getProfile() {
    const profile = await this.scraper.getProfile(this.username);
    return profile;
  }

  async run() {
    const startTime = Date.now();

    console.log("\n" + chalk.bold.blue("🐦 Twitter Data Collection Pipeline"));
    console.log(
      chalk.bold(`Target Account: ${chalk.cyan("@" + this.username)}\n`)
    );

    try {
      await this.validateEnvironment();

      // Initialize main scraper
      const scraperInitialized = await this.initializeScraper();
      if (!scraperInitialized && !this.config.fallback.enabled) {
        throw new Error(
          "Failed to initialize scraper and fallback is disabled"
        );
      }

      // Start collection
      Logger.startSpinner(`Collecting tweets from @${this.username}`);
      const allTweets = await this.collectTweets(this.scraper);
      Logger.stopSpinner();

      if (allTweets.length === 0) {
        Logger.warn("⚠️  No tweets collected");
        return;
      }

      // Save collected data
      Logger.startSpinner("Processing and saving data");
      const analytics = await this.dataOrganizer.saveTweets(allTweets);
      Logger.stopSpinner();

      // Calculate final statistics
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      const tweetsPerMinute = (allTweets.length / (duration / 60)).toFixed(1);

      // Display final results
      Logger.stats("📈 Collection Results", {
        "Total Tweets": allTweets.length.toLocaleString(),
        "Original Tweets": analytics.directTweets.toLocaleString(),
        Replies: analytics.replies.toLocaleString(),
        Retweets: analytics.retweets.toLocaleString(),
        "Date Range": `${analytics.timeRange.start} to ${analytics.timeRange.end}`,
        Runtime: `${duration} seconds`,
        "Collection Rate": `${tweetsPerMinute} tweets/minute`,
        "Rate Limit Hits": this.stats.rateLimitHits.toLocaleString(),
        "Fallback Collections": this.stats.fallbackCount.toLocaleString(),
        "Storage Location": chalk.gray(this.dataOrganizer.baseDir),
      });

      // Content type breakdown
      Logger.info("\n📊 Content Type Breakdown:");
      console.log(
        chalk.cyan(
          `• Text Only: ${analytics.contentTypes.textOnly.toLocaleString()}`
        )
      );
      console.log(
        chalk.cyan(
          `• With Images: ${analytics.contentTypes.withImages.toLocaleString()}`
        )
      );
      console.log(
        chalk.cyan(
          `• With Videos: ${analytics.contentTypes.withVideos.toLocaleString()}`
        )
      );
      console.log(
        chalk.cyan(
          `• With Links: ${analytics.contentTypes.withLinks.toLocaleString()}`
        )
      );

      // Engagement statistics
      Logger.info("\n💫 Engagement Statistics:");
      console.log(
        chalk.cyan(
          `• Total Likes: ${analytics.engagement.totalLikes.toLocaleString()}`
        )
      );
      console.log(
        chalk.cyan(
          `• Total Retweets: ${analytics.engagement.totalRetweetCount.toLocaleString()}`
        )
      );
      console.log(
        chalk.cyan(
          `• Total Replies: ${analytics.engagement.totalReplies.toLocaleString()}`
        )
      );
      console.log(
        chalk.cyan(`• Average Likes: ${analytics.engagement.averageLikes}`)
      );

      // Collection method breakdown
      if (this.stats.fallbackUsed) {
        Logger.info("\n🔄 Collection Method Breakdown:");
        console.log(
          chalk.cyan(
            `• Primary Collection: ${(
              allTweets.length - this.stats.fallbackCount
            ).toLocaleString()}`
          )
        );
        console.log(
          chalk.cyan(
            `• Fallback Collection: ${this.stats.fallbackCount.toLocaleString()}`
          )
        );
      }

      // Show sample tweets
      await this.showSampleTweets(allTweets);

      // Cleanup
      await this.cleanup();

      return analytics;
    } catch (error) {
      Logger.error(`Pipeline failed: ${error.message}`);
      await this.logError(error, {
        stage: "pipeline_execution",
        runtime: (Date.now() - startTime) / 1000,
        stats: this.stats,
      });
      await this.cleanup();
      throw error;
    }
  }

  async logError(error, context = {}) {
    const errorLog = {
      timestamp: new Date().toISOString(),
      error: {
        message: error.message,
        stack: error.stack,
      },
      context: {
        ...context,
        username: this.username,
        sessionDuration: Date.now() - this.stats.startTime,
        rateLimitHits: this.stats.rateLimitHits,
        fallbackUsed: this.stats.fallbackUsed,
        fallbackCount: this.stats.fallbackCount,
      },
      stats: this.stats,
      config: {
        delays: {
          min: this.config.twitter.minDelayBetweenRequests,
          max: this.config.twitter.maxDelayBetweenRequests,
        },
        retries: this.config.twitter.maxRetries,
        fallback: {
          enabled: this.config.fallback.enabled,
          sessionDuration: this.config.fallback.sessionDuration,
        },
      },
    };

    const errorLogPath = path.join(
      this.dataOrganizer.baseDir,
      "meta",
      "error_log.json"
    );

    try {
      let existingLogs = [];
      try {
        const existing = await fs.readFile(errorLogPath, "utf-8");
        existingLogs = JSON.parse(existing);
      } catch {
        // File doesn't exist yet
      }

      existingLogs.push(errorLog);

      // Keep only recent errors
      if (existingLogs.length > 100) {
        existingLogs = existingLogs.slice(-100);
      }

      await fs.writeFile(errorLogPath, JSON.stringify(existingLogs, null, 2));
    } catch (logError) {
      Logger.error(`Failed to save error log: ${logError.message}`);
    }
  }

  async cleanup() {
    try {
      // Cleanup main scraper
      if (this.scraper) {
        await this.scraper.logout();
        Logger.success("🔒 Logged out of primary system");
      }

      // Cleanup fallback system
      if (this.cluster) {
        await this.cluster.close();
        Logger.success("🔒 Cleaned up fallback system");
      }

      Logger.success("✨ Cleanup complete");
    } catch (error) {
      Logger.warn(`⚠️  Cleanup error: ${error.message}`);
    }
  }
}

export default TwitterPipeline;