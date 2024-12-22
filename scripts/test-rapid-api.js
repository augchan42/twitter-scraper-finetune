import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import AdblockerPlugin from "puppeteer-extra-plugin-adblocker";
import fs from "fs/promises";
import path from "path";

// Configure puppeteer stealth once
puppeteer.use(StealthPlugin());
puppeteer.use(AdblockerPlugin({ blockTrackers: true }));

async function scrapeTweetById(tweetId) {
  const url = `https://x.com/eledranguyen/status/${tweetId}`;
  const browser = await puppeteer.launch({
    headless: true, // Runs in headless mode
    args: ["--no-sandbox", "--disable-setuid-sandbox"], // Important for VPS
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(30000); // For all waitFor* methods
  page.setDefaultNavigationTimeout(30000); // For navigation methods like goto()
  await page.goto(url);

  try {
    // Navigate to the specific tweet URL
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    // Wait for the tweet element to load
    await page.waitForSelector("article", { timeout: 30000 });

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

    return tweetData;
  } catch (error) {
    console.error("Error scraping tweet:", error);
  } finally {
    await browser.close();
  }
}

async function searchTweets(searchQuery) {
  const browser = await puppeteer.launch({ headless: false });
  try {
    const page = await browser.newPage();
    // Go directly to search
    await page.goto(
      `https://twitter.com/search?q=${encodeURIComponent(searchQuery)}&f=live`
    );

    const newTweets = await page.evaluate(() => {
      const tweetElements = Array.from(
        document.querySelectorAll('article[data-testid="tweet"]')
      );
      return tweetElements
        .map((tweet) => {
          try {
            return {
              id: tweet.getAttribute("data-tweet-id"),
              text: tweet.querySelector("div[lang]")?.textContent || "",
              timestamp: tweet.querySelector("time")?.getAttribute("datetime"),
              metrics: Array.from(
                tweet.querySelectorAll('span[data-testid$="count"]')
              ).map((m) => m.textContent),
            };
          } catch (e) {
            return null;
          }
        })
        .filter((t) => t && t.id);
    });

    console.log("New Tweets:", JSON.stringify(newTweets, null, 2));
  } catch (error) {
    console.error("Error searching tweets:", error);
  } finally {
    await browser.close();
  }
}

async function getAccountInfo(username) {
  try {
    const url = new URL("https://twitter-api45.p.rapidapi.com/screenname.php");
    url.searchParams.append("screenname", username);
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "X-RapidAPI-Key": "",
        "X-RapidAPI-Host": "twitter-api45.p.rapidapi.com",
      },
    });
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error searching tweets:", error);
  }
}

async function searchTweetRapidAPI(username) {
  try {
    const userInfo = await getAccountInfo(username);
    console.log("User Info:", userInfo);
    // return;

    const totalTweets = userInfo.statuses_count;
    console.log(`Total tweets for ${username}: ${totalTweets}`);
    let count = 0;
    let allTweets = [];
    let bottomCursor = null;
    do {
      const url = new URL("https://twitter-api45.p.rapidapi.com/search.php");
      url.searchParams.append("query", username);
      url.searchParams.append("search_type", "Latest");
      if (bottomCursor) {
        url.searchParams.append("cursor", bottomCursor);
      }
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "X-RapidAPI-Key": "",
          "X-RapidAPI-Host": "twitter-api45.p.rapidapi.com",
        },
      });
      const data = await response.json();
      const tweets = data.timeline;
      console.log(`Tweets: ${JSON.stringify(tweets, null, 2)}`);

      count += tweets.length;
      allTweets = allTweets.concat(tweets);
      bottomCursor = data.next_cursor;
      console.log(
        `Fetched ${tweets.length} tweets. Total: ${count}/${totalTweets}`
      );
    } while (totalTweets > count);

    const dir = `./data/${username}/raw/`;
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, "tweets.json");

    await fs.writeFile(filePath, JSON.stringify(allTweets, null, 2), "utf-8");
    console.log(`✅ Saved ${allTweets.length} tweets to ${filePath}`);
  } catch (error) {
    console.error("Error searching tweets:", error);
  }
}

// // Replace with the actual Tweet ID
// scrapeTweetById("1509383216666333187") // Example Tweet ID
//   .then((tweetData) => {
//     console.log("Extracted Tweet:", tweetData);
//   })
//   .catch((err) => {
//     console.error("Scraping Error:", err);
//   });

// // Replace with the actual search query
// searchTweets("from:eledranguyen").catch((err) => {
//   console.error("Search Error:", err);
// });
searchTweetRapidAPI("DngH669636").then(() => {
  console.log("RapidAPI Response done");
});
