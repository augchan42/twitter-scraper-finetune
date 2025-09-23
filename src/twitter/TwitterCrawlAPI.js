// TwitterCrawlAPI.js
import Logger from "./Logger.js";
import fetch from "node-fetch";
import DataOrganizer from "./DataOrganizer.js";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AdblockerPlugin from "puppeteer-extra-plugin-adblocker";
import MessageExamplesCrawler from "./MessageExamplesCrawler.js";

class TwitterCrawlAPI {
  constructor(username, apiKey, dataOrganizer) {
    this.username = username;
    this.apiKey = apiKey;
    const rawBaseUrl = process.env.RAPIDAPI_URL || null;
    let parsedHost = null;
    if (rawBaseUrl) {
      try {
        parsedHost = new URL(rawBaseUrl).host;
        this.baseUrl = rawBaseUrl;
      } catch (_) {
        this.baseUrl = null;
      }
    } else {
      this.baseUrl = null;
    }
    this.headers = this.baseUrl
      ? {
          "x-rapidapi-host": parsedHost,
          "x-rapidapi-key": this.apiKey,
        }
      : {};
    this.dataOrganizer =
      dataOrganizer || new DataOrganizer("pipeline", username); // Initialize DataOrganizer
    this.paths = this.dataOrganizer.getPaths();
    // Configure puppeteer stealth once
    puppeteer.use(StealthPlugin());
    puppeteer.use(AdblockerPlugin({ blockTrackers: true }));
  }

  async getUserId() {
    if (!this.baseUrl) {
      throw new Error(
        "RAPIDAPI_URL is not configured. Set RAPIDAPI_URL and RAPIDAPI_KEY in your .env to use RapidAPI endpoints."
      );
    }
    const url = new URL(`${this.baseUrl}/user`);
    url.searchParams.set("username", this.username.toLocaleLowerCase());

    const response = await fetch(url, {
      headers: this.headers,
    });

    if (!response.ok) {
      const errorData = await response.text(); // Capture error response body
      const errorMessage = `API request failed with status ${response.status}: ${errorData}`;
      throw new Error(errorMessage); // Include error details in the error message
    }
    const jsonData = await response.json();

    return {
      userId: jsonData.result?.data?.user?.result?.rest_id || null,
      totalTweets:
        jsonData.result?.data?.user?.result?.legacy?.statuses_count || null,
    };
  }

  async collectTweets() {
    try {
      const { userId, totalTweets: totalExpectedTweets } =
        await this.getUserId();
      console.log(`User ID: ${userId} - Total Tweets: ${totalExpectedTweets}`);

      if (!userId) {
        Logger.error(`❌ User ID not found for username: ${this.username}`);
        return;
      }

      // when userId is read, init the MessageExamplesCrawler
      this.messageExamplesCrawler = new MessageExamplesCrawler(
        this.username,
        userId,
        this.apiKey
      );

      const allTweets = await this.searchTweets(
        this.username,
        totalExpectedTweets
      );

      let processedTweets = [];
      let count = 0;
      for (const tweet of allTweets) {
        count++;
        const processedTweet = await this.processTweetData(tweet);
        processedTweets.push(processedTweet);
        if (count % 100 === 0) {
          const completion = ((count / allTweets.length) * 100).toFixed(1);
          Logger.info(
            `📊 Progress: ${count.toLocaleString()} unique tweets (${completion}%)`
          );
        }
      }
      processedTweets = processedTweets
        .sort((a, b) => b.timestamp - a.timestamp)
        .filter((tweet) => tweet !== null);

      // TODO: Save the message examples to the raw data directory
      messageExample = this.messageExamplesCrawler.collectedMessageExamples();

      // Save the processed tweets to the raw data directory
      // await this.dataOrganizer.saveTweets(processedTweets);
      return processedTweets;
    } catch (error) {
      Logger.error(`Failed to collect tweets: ${error.message}`);
      // ... other error handling, maybe retry logic
      throw error; // Re-throw the error to be handled at a higher level.
    }
  }

  extractTweetsFromResponse(jsonData) {
    const extractedTweets = [];

    const instructions = jsonData?.result?.timeline?.instructions;

    if (instructions) {
      for (const instruction of instructions) {
        if (instruction.type === "TimelineAddEntries") {
          for (const entry of instruction.entries) {
            if (entry?.content?.itemContent?.tweet_results?.result) {
              extractedTweets.push(
                entry.content.itemContent.tweet_results.result
              );
              continue;
            }

            if (
              entry?.content?.itemContent?.tweet_results?.result
                ?.retweeted_status_result?.result
            ) {
              extractedTweets.push(
                entry.content.itemContent.tweet_results.result
                  .retweeted_status_result.result
              );
            }
          }
        }
      }
    }

    return extractedTweets;
  }

  async processTweetData(tweet) {
    if (!tweet || !tweet.rest_id) return null; //Important
    const legacyTweet = tweet.legacy;
    let full_text = "";

    // Check if the tweet is a note_tweet
    if (
      !tweet.note_tweet?.note_tweet_results?.result?.text &&
      legacyTweet.display_text_range[1] == 280
    ) {
      full_text = await this.fallbackGetFullTextTweet(
        this.username,
        tweet.rest_id
      );
    } else if (tweet.note_tweet?.note_tweet_results?.result?.text) {
      full_text = tweet.note_tweet?.note_tweet_results?.result?.text;
    } else {
      full_text = legacyTweet.full_text;
    }

    try {
      const createdAt = new Date(legacyTweet.created_at);
      const timestamp = createdAt.getTime();

      return {
        id: tweet.rest_id,
        text: full_text, // Use full_text for complete tweet content
        username: this.username,
        timestamp,
        createdAt: createdAt.toISOString(),
        isReply: Boolean(legacyTweet.reply_count > 0),
        isRetweet: legacyTweet.retweeted,
        likes: legacyTweet.favorite_count,
        retweetCount: legacyTweet.retweet_count,
        replies: legacyTweet.reply_count,
        photos:
          legacyTweet.extended_entities?.media?.filter(
            (media) => media.type === "photo"
          ) || [], // Updated for photos
        videos:
          legacyTweet.extended_entities?.media?.filter(
            (media) => media.type === "video"
          ) || [], // Updated for videos
        urls: legacyTweet.entities?.urls || [], //Updated for urls
        permanentUrl: `https://twitter.com/${this.username}/status/${tweet.rest_id}`, //Added permanentUrl
        hashtags: legacyTweet.entities?.hashtags || [],
        //Add other fields here if needed
      };
    } catch (error) {
      Logger.warn(
        `⚠️  Error processing tweet ${tweet?.rest_id}: ${error.message}`
      );
      return null;
    }
  }

  async getFullTextTweet(tweetId) {
    if (!this.baseUrl) {
      throw new Error(
        "RAPIDAPI_URL is not configured. Set RAPIDAPI_URL and RAPIDAPI_KEY in your .env to use RapidAPI endpoints."
      );
    }
    const url = new URL(`${this.baseUrl}/tweet/${tweetId}`);
    const response = await fetch(url, { headers: this.headers });
    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`API request failed with status ${response.status}: ${errorData}`);
    }
    const jsonData = await response.json();
    const text = jsonData?.result?.data?.tweetResult?.result?.legacy?.full_text;
    return text || null;
  }

  async getUserTweets(userId, totalExpectedTweets) {
    if (!this.baseUrl) {
      throw new Error(
        "RAPIDAPI_URL is not configured. Set RAPIDAPI_URL and RAPIDAPI_KEY in your .env to use RapidAPI endpoints."
      );
    }
    try {
      let count = 0;
      const limit = 20;
      let bottomCursor = null;
      let allTweets = [];

      do {
        const url = new URL(`${this.baseUrl}/user-tweets`);
        url.searchParams.set("user", userId);
        url.searchParams.set("count", limit);
        if (bottomCursor) {
          url.searchParams.set("cursor", bottomCursor);
        }

        const response = await fetch(url, {
          headers: this.headers,
        });

        if (!response.ok) {
          const errorData = await response.text(); // Capture error response body
          const errorMessage = `API request failed with status ${response.status}: ${errorData}`;
          throw new Error(errorMessage); // Include error details in the error message
        }

        const jsonData = await response.json();

        const tweets = this.extractTweetsFromResponse(jsonData);
        allTweets = allTweets.concat(tweets);
        bottomCursor = jsonData?.cursor?.bottom;
        count += limit;
      } while (totalExpectedTweets > count);

      return allTweets;
    } catch (error) {
      console.error("Error fetching user tweets:", error);
    }
  }

  async searchTweets(username, totalExpectedTweets) {
    if (!this.baseUrl) {
      throw new Error(
        "RAPIDAPI_URL is not configured. Set RAPIDAPI_URL and RAPIDAPI_KEY in your .env to use RapidAPI endpoints."
      );
    }
    try {
      let allTweets = [];
      let bottomCursor = null;
      let count = 0;
      const limit = 20;

      const url = new URL(`${this.baseUrl}/search-v2`);
      url.searchParams.set("type", "Latest");
      url.searchParams.set("count", limit);
      url.searchParams.set("query", username);

      do {
        if (bottomCursor) {
          url.searchParams.set("cursor", bottomCursor);
        }

        const response = await fetch(url, {
          headers: this.headers,
        });

        if (!response.ok) {
          const errorData = await response.text(); // Capture error response body
          const errorMessage = `API request failed with status ${response.status}: ${errorData}`;
          throw new Error(errorMessage); // Include error details in the error message
        }
        const jsonData = await response.json();

        if (jsonData.errors) {
          throw new Error(
            `API request failed with status ${
              response.status
            }: ${JSON.stringify(jsonData.errors)}`
          );
        }
        const tweets = this.extractTweetsFromResponse(jsonData);
        allTweets = allTweets.concat(tweets);
        bottomCursor = jsonData?.cursor?.bottom;
        count += limit;
        if (count > totalExpectedTweets) count = totalExpectedTweets;
        console.log(`Fetched tweets: ${count}/${totalExpectedTweets}`);
      } while (totalExpectedTweets > count);

      return allTweets;
    } catch (error) {
      console.error("Error searching tweets:", error);
    }
  }

  // Fallback method to fetch detailed Tweet
  async fallbackGetFullTextTweet(username, tweetId) {
    const url = `https://x.com/${username}/status/${tweetId}`;
    const browser = await puppeteer.launch({
      headless: true, // Runs in headless mode
      args: ["--no-sandbox", "--disable-setuid-sandbox"], // Important for VPS
    });
    const page = await browser.newPage();

    try {
      // Navigate to the specific tweet URL
      await page.goto(url, { waitUntil: "networkidle2", timeout: 30_000 });

      // Wait for the tweet element to load
      await page.waitForSelector("article", { timeout: 15_000 });

      // Extract the tweet details
      const tweetData = await page.evaluate(() => {
        const tweetElement = document.querySelector("article");
        const textElement = tweetElement.querySelector("[lang]");
        const authorElement = tweetElement.querySelector('div[dir="ltr"] span');

        return {
          text: textElement ? textElement.textContent.trim() : null,
          author: authorElement ? authorElement.textContent.trim() : null,
        };
      });

      return tweetData.text;
    } catch (error) {
      console.error("Error scraping tweet:", error);
      return null;
    } finally {
      await browser.close();
    }
  }
}

export default TwitterCrawlAPI;
