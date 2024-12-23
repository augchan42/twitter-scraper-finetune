import fs from "fs/promises";
import path from "path";

async function getAccountInfo(username) {
  try {
    const url = new URL("https://twitter-api45.p.rapidapi.com/screenname.php");
    url.searchParams.append("screenname", username);
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "X-RapidAPI-Key": "ea30cc8855msh8e9c4e47e870dc1p19c501jsn61904015d846",
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
      if (bottomCursor) {
        url.searchParams.append("cursor", bottomCursor);
      }
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "X-RapidAPI-Key":
            "ea30cc8855msh8e9c4e47e870dc1p19c501jsn61904015d846",
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
    } while (totalTweets > count && bottomCursor);

    const dir = `./data/${username}/raw/`;
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, "tweets.json");

    await fs.writeFile(filePath, JSON.stringify(allTweets, null, 2), "utf-8");
    console.log(`✅ Saved ${allTweets.length} tweets to ${filePath}`);
  } catch (error) {
    console.error("Error searching tweets:", error);
  }
}

searchTweetRapidAPI("DngH669636").then(() => {
  console.log("RapidAPI Response done");
});
