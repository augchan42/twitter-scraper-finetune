import express from "express";
import bodyParser from "body-parser";
import TwitterPipeline from "./twitter/TwitterPipeline.js";
import TweetProcessor from "./character/GenerateCharacter.js";
import { isRawTweetsFileExists } from "./twitter/utils.js";
import fs from "fs/promises";
import dotenv from "dotenv";
import cors from "cors";
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
// Use middleware to parse JSON
app.use(bodyParser.json());

// Enable CORS for all routes
app.use(cors());

// Set up a basic route
app.get("/", (req, res) => {
  res.send("Hello, World! This is your Express server.");
});

// Define additional routes
app.post("/api/characters", async (req, res) => {
  const data = req.body;
  const { username, date, is_crawl } = data;
  console.log(`Received username: ${username}`);
  const pipeline = new TwitterPipeline(username);
  if ((await isRawTweetsFileExists(pipeline.paths.raw.tweets)) && !is_crawl) {
    console.log(`Raw tweets for ${username} already exist`);
  } else {
    console.log(`Downloading raw tweets for ${username}`);
    await pipeline.run();

    console.log(`Processing tweets for ${username} from ${date}`);
    const tweetProcessor = new TweetProcessor(username, date);
    // Generate character
    await tweetProcessor.processTweets(
      pipeline.messageExamplesCrawler.messageExamples
    );
  }

  const characterData = await fs.readFile(
    `characters/${username}.json`,
    "utf-8"
  );

  res.json({ characterData });
});

app.get("/api/characters/:username", async (req, res) => {
  const username = req.params.username;
  const pathFile = `characters/${username}.json`;
  if (await isRawTweetsFileExists(pathFile)) {
    const characterData = await fs.readFile(pathFile, "utf-8");
    res.json({ characterData });
  } else {
    res.status(404).send("Character not found");
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
